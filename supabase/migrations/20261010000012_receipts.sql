-- Numeración y emisión del recibo (P5 de odd/tasks/payments-and-receipt.md).
--
-- EMISIÓN PEREZOSA: el recibo nace la PRIMERA vez que la dueña lo abre/imprime, no
--   al completar la cita. Así el número sigue el orden de emisión (lo que la clienta
--   ve en papel) y las citas completadas ANTES de esta función también pueden tener
--   recibo, sin migrar nada ni tocar `complete_appointment`. Solo se emite para citas
--   COMPLETED: el dinero ya está congelado (INVARIANTE 2) y el recibo lo refleja.
--
-- NUMERACIÓN POR NEGOCIO, SIN HUECOS: `receipt_counter` guarda el último número de
--   cada negocio. `insert … on conflict do update set last_number = last_number + 1`
--   bloquea la fila del contador hasta el final de la transacción, así que dos
--   emisiones simultáneas del mismo negocio se serializan y no se repite ni se salta
--   ningún número. Si la transacción falla, el incremento se revierte con ella. Una
--   emisión idempotente (la cita ya tiene recibo) no toca el contador.
--
-- TOKEN PÚBLICO APARTE DEL NÚMERO (P6): el número es secuencial, por tanto
--   adivinable (V-000014 → V-000015). El recibo digital público se abrirá con
--   `public_token`, un uuid aleatorio no adivinable, para que nadie recorra los
--   recibos de otras clientas probando números.
--
-- ESCRITURA SOLO POR RPC: las dueñas únicamente LEEN (política select por
--   membresía); sin insert/update/delete para clientes (privilegios revocados), no
--   pueden elegir su propio número ni saltarse la validación de estado.
--
-- ADITIVA: tablas y función nuevas.

create table if not exists receipt_counter (
  business_id bigint  primary key references business (id) on delete cascade,
  last_number integer not null default 0 check (last_number >= 0)
);

create table if not exists receipt (
  id             bigint      generated always as identity primary key,
  business_id    bigint      not null references business (id) on delete cascade,
  appointment_id bigint      not null unique references appointment (id) on delete cascade,
  number         integer     not null check (number > 0),
  issued_at      timestamptz not null default now(),
  issued_by      uuid        default auth.uid(),
  public_token   uuid        not null default gen_random_uuid() unique,
  unique (business_id, number)
);

create index if not exists receipt_business_idx on receipt (business_id);

alter table receipt_counter enable row level security;
alter table receipt         enable row level security;

-- El contador es interno: sin política, ningún cliente lo lee ni lo escribe.
revoke all on receipt_counter from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'receipt' and policyname = 'receipt_select'
  ) then
    create policy receipt_select on receipt
      for select using (is_member(business_id));
  end if;
end $$;

revoke insert, update, delete on receipt from anon, authenticated;

create or replace function issue_receipt(p_business_id bigint, p_appointment_id bigint)
returns table (number integer, issued_at timestamptz, public_token uuid)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_status text;
  v_next   integer;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;

  select a.status into v_status
    from appointment a
   where a.id = p_appointment_id and a.business_id = p_business_id
     for update;  -- dos emisiones de la MISMA cita hacen cola: la segunda ve el recibo de la primera
  if not found then raise exception 'Esa cita no es de tu negocio.'; end if;
  if v_status <> 'COMPLETED' then
    raise exception 'Solo las citas completadas tienen recibo.';
  end if;

  -- Idempotente: si ya se emitió, se devuelve el mismo (número y token no cambian).
  return query
    select r.number, r.issued_at, r.public_token
      from receipt r
     where r.appointment_id = p_appointment_id and r.business_id = p_business_id;
  if found then return; end if;

  -- Siguiente número del negocio. El upsert toma el bloqueo de la fila del contador
  -- y lo mantiene hasta el commit: las emisiones concurrentes hacen cola aquí.
  insert into receipt_counter as c (business_id, last_number)
  values (p_business_id, 1)
  on conflict (business_id) do update set last_number = c.last_number + 1
  returning c.last_number into v_next;

  return query
    insert into receipt as r (business_id, appointment_id, number)
    values (p_business_id, p_appointment_id, v_next)
    returning r.number, r.issued_at, r.public_token;
end $$;

revoke execute on function issue_receipt(bigint, bigint) from public;
revoke execute on function issue_receipt(bigint, bigint) from anon;
grant  execute on function issue_receipt(bigint, bigint) to authenticated;
