-- Empleadas (P1 de odd/tasks/payments-and-receipt.md): quién hizo cada servicio.
--
-- QUÉ SON
--   Personas que trabajan en el negocio. NO son usuarias de la app: no hay enlace
--   a `auth.users` (decisión explícita en 20260929000001_appointment_service.sql).
--   Solo existen para que la factura lleve el nombre de quien hizo cada servicio.
--
-- BAJA, NO BORRADO
--   Una empleada con servicios cobrados no se borra: se desactiva (`active =
--   false`). La UI solo ofrece desactivar. El `on delete set null` de la columna
--   es la red de seguridad de la base, no un flujo.
--
-- COBRAR (`complete_appointment`)
--   Cada línea de `p_lines` puede traer `employee_id` (opcional). Si viene, tiene
--   que ser de ESTE negocio y estar ACTIVA al cobrar; se guarda en la misma
--   transacción que congela el dinero. Sin empleada sigue funcionando igual.
--   Mismas validaciones y mismos permisos que antes; solo se añade eso.
--
-- ADITIVA: tabla nueva, columna anulable y `create or replace` de la función.

create table if not exists employee (
  id          bigint  primary key,
  business_id bigint  not null references business (id) on delete cascade,
  name        text    not null check (btrim(name) <> ''),
  active      boolean not null default true
);

create index if not exists employee_business_idx on employee (business_id);

alter table employee enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'employee' and policyname = 'employee_all'
  ) then
    create policy employee_all on employee
      using (is_member(business_id)) with check (is_member(business_id));
  end if;
end $$;

alter table appointment_service
  add column if not exists employee_id bigint references employee (id) on delete set null;

create or replace function complete_appointment(
  p_business_id    bigint,
  p_appointment_id bigint,
  p_charged_price  bigint,
  p_actual_cost    bigint,
  p_profit         bigint,
  p_lines          jsonb
)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_apt      appointment%rowtype;
  v_expected bigint[];
  v_given    bigint[];
  v_n        integer;
  v_distinct integer;
  v_nulls    integer;
  v_sum_chg  bigint;
  v_sum_cost bigint;
  v_sum_prof bigint;
  v_foreign  integer;
  v_bad_emp  integer;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;

  -- Bloqueo de fila: dos cobros a la vez de la misma cita se serializan, y el
  -- segundo ve ya el estado COMPLETED y se rechaza.
  select * into v_apt
    from appointment
   where id = p_appointment_id and business_id = p_business_id
     for update;
  if not found then raise exception 'Esa cita no existe en tu negocio.'; end if;

  if v_apt.status not in ('PENDING', 'IN_PROGRESS') then
    raise exception 'La cita % está en estado % y no se puede completar.', p_appointment_id, v_apt.status;
  end if;

  if p_charged_price is null or p_actual_cost is null or p_profit is null
     or p_charged_price < 0 or p_actual_cost < 0 then
    raise exception 'Los montos del cobro no son válidos.';
  end if;
  if p_profit <> p_charged_price - p_actual_cost then
    raise exception 'La ganancia no es precio menos costo.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Faltan las líneas de servicio de la cita.';
  end if;

  -- Las líneas llegan como jsonb; cada comprobación las lee con `jsonb_to_recordset`.
  -- Sin tabla temporal a propósito: una función que crea objetos propios es más
  -- difícil de razonar y de probar que repetir una cláusula `from`.
  select count(*), count(distinct service_id),
         count(*) filter (where service_id is null or charged_price is null
                             or actual_cost is null or profit is null
                             or charged_price < 0 or actual_cost < 0),
         sum(charged_price), sum(actual_cost), sum(profit)
    into v_n, v_distinct, v_nulls, v_sum_chg, v_sum_cost, v_sum_prof
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint);

  if v_nulls > 0 then raise exception 'Hay líneas con montos incompletos o inválidos.'; end if;
  if v_n <> v_distinct then raise exception 'Un servicio aparece repetido en las líneas.'; end if;

  -- Cada línea cuadra por sí sola: la ganancia se deriva, no se elige.
  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint)
     where l.profit <> l.charged_price - l.actual_cost
  ) then
    raise exception 'La ganancia de una línea no es precio menos costo.';
  end if;

  -- Y entre todas suman lo que se congela en la cita.
  if v_sum_chg <> p_charged_price or v_sum_cost <> p_actual_cost or v_sum_prof <> p_profit then
    raise exception 'Las líneas no suman el total de la cita.';
  end if;

  -- El conjunto de servicios es EXACTAMENTE el de la cita.
  select array_agg(service_id order by service_id) into v_expected
    from appointment_service
   where appointment_id = p_appointment_id and business_id = p_business_id;
  if v_expected is null then
    v_expected := array[v_apt.service_id];
  end if;
  select array_agg(l.service_id order by l.service_id) into v_given
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint);
  if v_expected is distinct from v_given then
    raise exception 'Los servicios de las líneas no son los de la cita.';
  end if;

  -- INVARIANTE 1: ningún servicio de otro negocio.
  select count(*) into v_foreign
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint)
    left join service s on s.id = l.service_id and s.business_id = p_business_id
   where s.id is null;
  if v_foreign > 0 then raise exception 'Un servicio no pertenece a tu negocio.'; end if;

  -- INVARIANTE 1 también para quién lo hizo: la empleada, si viene, es de ESTE
  -- negocio. Y tiene que estar activa AHORA: cobrar es el momento en que se
  -- asigna, y una empleada dada de baja ya no trabaja ahí. Su historial no se
  -- toca (las líneas ya cobradas conservan su `employee_id`).
  select count(*) into v_bad_emp
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint)
    left join employee e on e.id = l.employee_id and e.business_id = p_business_id
   where l.employee_id is not null and e.id is null;
  if v_bad_emp > 0 then raise exception 'Una empleada no pertenece a tu negocio.'; end if;
  select count(*) into v_bad_emp
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint)
    join employee e on e.id = l.employee_id and e.business_id = p_business_id
   where not e.active;
  if v_bad_emp > 0 then raise exception 'Una empleada está dada de baja y no se puede asignar.'; end if;

  -- Todo comprobado: se congela. Cita y líneas, en esta misma transacción.
  update appointment
     set status = 'COMPLETED',
         charged_price = p_charged_price,
         actual_cost = p_actual_cost,
         profit = p_profit
   where id = p_appointment_id and business_id = p_business_id;

  insert into appointment_service (appointment_id, service_id, business_id,
                                   charged_price, actual_cost, profit, employee_id)
  select p_appointment_id, l.service_id, p_business_id,
         l.charged_price, l.actual_cost, l.profit, l.employee_id
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint)
  on conflict (appointment_id, service_id) do update
    set charged_price = excluded.charged_price,
        actual_cost   = excluded.actual_cost,
        profit        = excluded.profit,
        employee_id   = excluded.employee_id;

end $$;

-- Solo la dueña autenticada. Sin esto, `anon` podría intentar completar citas
-- (la comprobación de membresía lo frenaría, pero no hace falta ni que llegue).
revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb) from public;
revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb) from anon;
grant  execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb) to authenticated;
