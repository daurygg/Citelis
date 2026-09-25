-- Auto-reserva del cliente (Slice B). ADITIVO e idempotente: puedes correrlo en
-- una base existente SIN perder datos. NO borra, NO convierte columnas, NO toca
-- filas de citas ya creadas.
--
-- ⚠️  SIN VERIFICAR CONTRA UNA BASE REAL. Escrito leyendo schema.sql e
--     invitations.sql, pero nunca ejecutado. Córrelo primero en un proyecto
--     Supabase de prueba o dentro de una transacción con ROLLBACK.
--
-- Principio de seguridad de este archivo (decisión D2 del documento ODD):
-- el público NUNCA toca las tablas directamente. No se crea ni una policy para
-- el rol `anon`. Todo entra por funciones SECURITY DEFINER que devuelven solo
-- las columnas que el público puede ver. La tabla `service` contiene
-- `supply_cost` y `cost_override`: los costos de la dueña. Una policy de SELECT
-- para `anon` sobre esa tabla publicaría su margen a internet.

-- ── Horario de atención ────────────────────────────────────────────────────
-- weekday: 0 = domingo … 6 = sábado (igual que Date.getDay() en el dominio).
-- Varias filas por día permiten partir la jornada (mañana y tarde).
create table if not exists business_hours (
  id          bigint primary key,
  business_id bigint not null references business (id) on delete cascade,
  weekday     integer not null check (weekday between 0 and 6),
  opens_at    text    not null,  -- 'HH:MM' hora local del negocio
  closes_at   text    not null   -- 'HH:MM'
);

-- Tramos puntuales en los que el negocio NO atiende: vacaciones, almuerzo,
-- un asunto personal. Se guardan como ISO local sin zona, igual que
-- appointment.datetime (decisión D4).
create table if not exists time_block (
  id          bigint primary key,
  business_id bigint not null references business (id) on delete cascade,
  starts_at   text   not null,  -- 'YYYY-MM-DDTHH:MM'
  ends_at     text   not null,
  reason      text   not null default ''
);

-- Reglas de reserva pública. Una fila por negocio.
-- `enabled` es el interruptor de la dueña: apagarlo cierra el portal al público
-- sin borrar nada (también sirve de freno si llega spam).
create table if not exists booking_policy (
  business_id      bigint primary key references business (id) on delete cascade,
  public_slug      text    not null unique,
  enabled          boolean not null default false,
  slot_step_min    integer not null default 30,
  buffer_min       integer not null default 0,
  min_notice_hours integer not null default 2,
  max_horizon_days integer not null default 30,
  -- Tope de solicitudes por teléfono y día. Freno simple contra spam.
  max_requests_per_phone_per_day integer not null default 3
);

-- ── Columnas nuevas en appointment (aditivas) ──────────────────────────────
-- `status` sigue siendo text libre, así que REQUESTED y REJECTED no necesitan
-- migración de esquema. No se añade un CHECK sobre status: si alguna fila
-- histórica tuviera un valor inesperado, el ALTER fallaría y abortaría todo.
alter table appointment add column if not exists client_phone text;
alter table appointment add column if not exists source       text not null default 'OWNER'; -- OWNER | SELF
alter table appointment add column if not exists requested_at timestamptz;

-- Búsquedas por día del portal público.
create index if not exists appointment_business_datetime_idx
  on appointment (business_id, datetime);

-- Ids de citas creadas por el público. Arranca alto para no chocar con los ids
-- que genera el cliente (Date.now()*1000 + azar) ni con los ya existentes.
create sequence if not exists public_appointment_id_seq start 1;

-- ── RLS de las tablas nuevas (INVARIANTE 1) ────────────────────────────────
-- Mismo criterio que schema.sql: solo miembros del negocio, en toda operación.
alter table business_hours enable row level security;
alter table time_block     enable row level security;
alter table booking_policy enable row level security;

drop policy if exists business_hours_all on business_hours;
create policy business_hours_all on business_hours
  using (is_member(business_id)) with check (is_member(business_id));

drop policy if exists time_block_all on time_block;
create policy time_block_all on time_block
  using (is_member(business_id)) with check (is_member(business_id));

drop policy if exists booking_policy_all on booking_policy;
create policy booking_policy_all on booking_policy
  using (is_member(business_id)) with check (is_member(business_id));

-- ── Caducidad de solicitudes sin responder ─────────────────────────────────
-- Una solicitud que la dueña nunca contesta bloquearía su horario para siempre.
-- Al pasar la hora de la cita se rechaza sola. Se llama desde las funciones
-- públicas (barato: toca solo filas de ese negocio) y conviene además
-- agendarla con pg_cron si está disponible.
create or replace function expire_stale_requests(p_business_id bigint)
returns void language sql security definer as $$
  update appointment
     set status = 'REJECTED'
   where business_id = p_business_id
     and status = 'REQUESTED'
     and datetime < to_char(now(), 'YYYY-MM-DD"T"HH24:MI');
$$;

-- ── Portal público: solo lectura ───────────────────────────────────────────

-- Datos del negocio y sus servicios reservables. Proyección EXPLÍCITA: nunca
-- supply_cost ni cost_override.
-- Los servicios de precio variable (trenzas, maquillaje) se excluyen: la
-- clienta no puede reservar un precio que todavía no existe. Revisar cuando se
-- decida cómo ofrecerlos.
create or replace function public_business(p_slug text)
returns table (
  business_id    bigint,
  business_name  text,
  service_id     bigint,
  service_name   text,
  price          bigint,
  duration_min   integer,
  slot_step_min  integer,
  buffer_min     integer,
  min_notice_hours integer,
  max_horizon_days integer
) language sql security definer stable as $$
  select b.id, b.name, s.id, s.name, s.price, s.duration_min,
         p.slot_step_min, p.buffer_min, p.min_notice_hours, p.max_horizon_days
    from booking_policy p
    join business b on b.id = p.business_id
    join service  s on s.business_id = p.business_id
   where p.public_slug = p_slug
     and p.enabled
     and s.variable_price = false
     and s.duration_min > 0
   order by s.name;
$$;

-- Horario de atención del negocio.
create or replace function public_hours(p_slug text)
returns table (weekday integer, opens_at text, closes_at text)
language sql security definer stable as $$
  select h.weekday, h.opens_at, h.closes_at
    from booking_policy p
    join business_hours h on h.business_id = p.business_id
   where p.public_slug = p_slug and p.enabled;
$$;

-- Huecos ocupados de un día, ANONIMIZADOS.
-- Devuelve inicio y duración, nunca el nombre ni el teléfono de otra clienta:
-- un desconocido no tiene por qué saber que "María viene a las 3".
-- Incluye REQUESTED: una solicitud pendiente retiene su horario, si no dos
-- clientas pedirían la misma hora y la dueña heredaría un choque que no creó.
create or replace function public_busy(p_slug text, p_date text)
returns table (starts_at text, duration_min integer)
language sql security definer stable as $$
  select a.datetime, s.duration_min
    from booking_policy p
    join appointment a on a.business_id = p.business_id
    join service     s on s.id = a.service_id
   where p.public_slug = p_slug
     and p.enabled
     and a.datetime like p_date || 'T%'
     and a.status in ('REQUESTED', 'PENDING', 'IN_PROGRESS', 'COMPLETED')
  union all
  select t.starts_at,
         greatest(1, (extract(epoch from (t.ends_at::timestamp - t.starts_at::timestamp)) / 60)::integer)
    from booking_policy p
    join time_block t on t.business_id = p.business_id
   where p.public_slug = p_slug
     and p.enabled
     and t.starts_at like p_date || 'T%';
$$;

-- ── Portal público: crear la solicitud ─────────────────────────────────────
-- Nace como REQUESTED, nunca como PENDING: la dueña decide (decisión D1).
-- Nunca escribe charged_price / actual_cost / profit: esos se congelan solo al
-- COMPLETAR (INVARIANTE 2).
create or replace function public_request_booking(
  p_slug        text,
  p_service_id  bigint,
  p_datetime    text,
  p_client_name text,
  p_client_phone text
) returns bigint language plpgsql security definer as $$
declare
  v_business bigint;
  v_duration integer;
  v_new_id   bigint;
  v_count    integer;
begin
  if coalesce(trim(p_client_name), '') = '' then raise exception 'Falta el nombre'; end if;
  if coalesce(trim(p_client_phone), '') = '' then raise exception 'Falta el teléfono'; end if;
  if p_datetime !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'Fecha inválida'; end if;

  select business_id into v_business
    from booking_policy where public_slug = p_slug and enabled;
  if v_business is null then raise exception 'Este negocio no acepta reservas en línea'; end if;

  -- Serializa las reservas de ESTE negocio durante la transacción. Sin esto,
  -- dos clientas que tocan "reservar" a la vez pasan ambas la comprobación de
  -- choque y ambas quedan agendadas a la misma hora.
  perform pg_advisory_xact_lock(v_business);

  perform expire_stale_requests(v_business);

  select duration_min into v_duration
    from service
   where id = p_service_id and business_id = v_business
     and variable_price = false and duration_min > 0;
  if v_duration is null then raise exception 'Servicio no disponible para reserva en línea'; end if;

  select count(*) into v_count
    from appointment
   where business_id = v_business
     and client_phone = p_client_phone
     and requested_at > now() - interval '1 day';
  if v_count >= (select max_requests_per_phone_per_day from booking_policy where business_id = v_business) then
    raise exception 'Demasiadas solicitudes desde este teléfono. Escríbenos directamente.';
  end if;

  -- Re-verifica el choque DENTRO del lock. El navegador ya filtró, pero el
  -- navegador no es una garantía: la verdad vive aquí.
  if exists (
    select 1
      from appointment a
      join service s on s.id = a.service_id
     where a.business_id = v_business
       and a.status in ('REQUESTED', 'PENDING', 'IN_PROGRESS', 'COMPLETED')
       and a.datetime::timestamp < p_datetime::timestamp + make_interval(mins => v_duration)
       and p_datetime::timestamp < a.datetime::timestamp + make_interval(mins => s.duration_min)
  ) then
    raise exception 'Ese horario acaba de ocuparse. Elige otro, por favor.';
  end if;

  v_new_id := nextval('public_appointment_id_seq');
  insert into appointment (
    id, business_id, service_id, client, client_phone, datetime, status,
    source, requested_at, quoted_price, deposit, charged_price, actual_cost, profit
  ) values (
    v_new_id, v_business, p_service_id, trim(p_client_name), trim(p_client_phone),
    p_datetime, 'REQUESTED', 'SELF', now(), null, null, null, null, null
  );
  return v_new_id;
end; $$;

-- ── Permisos ───────────────────────────────────────────────────────────────
-- El público solo puede ejecutar estas cuatro funciones. Ninguna policy de
-- tabla para `anon`: sigue sin poder leer ni escribir nada directamente.
grant execute on function public_business(text)                            to anon, authenticated;
grant execute on function public_hours(text)                               to anon, authenticated;
grant execute on function public_busy(text, text)                          to anon, authenticated;
grant execute on function public_request_booking(text, bigint, text, text, text) to anon, authenticated;
grant execute on function expire_stale_requests(bigint)                    to authenticated;
