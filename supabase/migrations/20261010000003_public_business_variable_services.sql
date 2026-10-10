-- T5 · Portal: los servicios de precio variable entran al portal (decisión D2).
--
-- El portal no cobra, SOLICITA. Un servicio "a convenir" también se puede pedir:
-- la dueña pone el precio al atender. Hasta ahora `public_business` los filtraba
-- (`variable_price = false`) y `public_request_booking` los rechazaba. Esta
-- migración abre las dos puertas, y solo esas.

-- ── public_business ────────────────────────────────────────────────────────
-- Cambia la lista de columnas de un `returns table` (se agrega `variable_price`),
-- y Postgres no deja `create or replace` hacer eso: hay que tirarla y recrearla.
drop function if exists public_business(text);

-- Proyección EXPLÍCITA, columna por columna, como en las versiones anteriores:
-- `service` carga `supply_cost` y `cost_override` (los costos de la dueña) y
-- jamás pueden llegar a una función pública. Nada de `select *`.
--
-- `price` es NULL cuando el servicio es de precio variable. Decisión de producto
-- tomada por el lado seguro: el precio de lista de un servicio "a convenir" es un
-- número de referencia interno que la dueña no eligió publicar. Mostrarlo como
-- "Desde X" sería prometerle un precio a la clienta. Si la dueña quiere un "desde",
-- es una decisión suya y se agrega después con su propio campo.
-- El filtro `duration_min > 0` se conserva: sin duración no hay hueco que ofrecer.
create or replace function public_business(p_slug text)
returns table (
  business_id      bigint,
  business_name    text,
  theme_color      text,
  service_id       bigint,
  service_name     text,
  price            bigint,
  variable_price   boolean,
  duration_min     integer,
  slot_step_min    integer,
  buffer_min       integer,
  min_notice_hours integer,
  max_horizon_days integer
) language sql security definer stable
set search_path = public, pg_temp as $$
  select b.id, b.name, b.theme_color, s.id, s.name,
         case when s.variable_price then null else s.price end,
         s.variable_price, s.duration_min,
         p.slot_step_min, p.buffer_min, p.min_notice_hours, p.max_horizon_days
    from booking_policy p
    join business b on b.id = p.business_id
    join service  s on s.business_id = p.business_id
   where p.public_slug = p_slug
     and p.enabled
     and s.duration_min > 0
   order by s.name;
$$;

-- Mismos permisos que tenía: la visitante anónima la llama.
revoke execute on function public_business(text) from public;
grant  execute on function public_business(text) to anon, authenticated;

-- ── public_request_booking ─────────────────────────────────────────────────
-- SÍ había que tocarla: validaba `variable_price = false` y habría rechazado
-- cualquier solicitud con un servicio variable. Se parte del texto vigente de
-- 20260929000002 (ver notas de T4: no se reescriben las validaciones H1–H6) y el
-- ÚNICO cambio es quitar esa condición. La firma no cambia, así que no hace falta
-- tirarla. La cita nace REQUESTED con `quoted_price` null: no se inventa un precio.
create or replace function public_request_booking(
  p_slug        text,
  p_service_ids bigint[],
  p_datetime    text,
  p_client_name text,
  p_client_phone text
) returns bigint language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_business    bigint;
  v_duration    integer;
  v_new_id      bigint;
  v_count       integer;
  v_tz          text;
  v_buffer      integer;
  v_min_notice  integer;
  v_horizon     integer;
  v_max_req     integer;
  v_start       timestamp;
  v_end         timestamp;
  v_now_local   timestamp;
begin
  if coalesce(trim(p_client_name), '') = '' then raise exception 'Falta el nombre'; end if;
  if coalesce(trim(p_client_phone), '') = '' then raise exception 'Falta el teléfono'; end if;
  if p_datetime !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'Fecha inválida'; end if;

  select business_id, timezone, buffer_min, min_notice_hours,
         max_horizon_days, max_requests_per_phone_per_day
    into v_business, v_tz, v_buffer, v_min_notice, v_horizon, v_max_req
    from booking_policy where public_slug = p_slug and enabled;
  if v_business is null then raise exception 'Este negocio no acepta reservas en línea'; end if;

  -- Serializa las reservas de ESTE negocio durante la transacción. Sin esto,
  -- dos clientas que tocan "reservar" a la vez pasan ambas la comprobación de
  -- choque y ambas quedan agendadas a la misma hora.
  perform pg_advisory_xact_lock(v_business);

  perform expire_stale_requests(v_business);

  -- La duración de la cita es la SUMA de sus servicios, y TODOS tienen que ser
  -- reservables: si uno solo no lo es, no se acepta la solicitud entera. Contar
  -- los que sí valen daría una cita más corta de lo que la clienta pidió.
  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    raise exception 'Hay que elegir al menos un servicio';
  end if;
  if array_length(p_service_ids, 1) <> (
       select count(distinct id) from service
        where id = any(p_service_ids) and business_id = v_business
          and duration_min > 0
     ) then
    raise exception 'Servicio no disponible para reserva en línea';
  end if;
  select sum(duration_min)::integer into v_duration
    from service where id = any(p_service_ids) and business_id = v_business;

  -- "Ahora" en la hora del negocio, no en la del servidor (H6).
  v_now_local := now() at time zone v_tz;
  v_start     := p_datetime::timestamp;
  v_end       := v_start + make_interval(mins => v_duration);

  -- H4: aviso mínimo.
  if v_start < v_now_local + make_interval(hours => v_min_notice) then
    raise exception 'Necesitamos al menos % horas de aviso. Elige un horario más adelante.', v_min_notice;
  end if;

  -- H3: horizonte de la agenda.
  if v_start > v_now_local + make_interval(days => v_horizon) then
    raise exception 'Todavía no abrimos la agenda tan lejos. Prueba dentro de los próximos % días.', v_horizon;
  end if;

  -- H2: la cita completa tiene que caber dentro de UN tramo de atención de ese
  -- día. Un tramo, no la suma: con jornada partida (9-13 y 14-18), una cita de
  -- 12:30 a 14:30 no cabe aunque ambas horas estén "abiertas".
  if not exists (
    select 1 from business_hours h
     where h.business_id = v_business
       and h.weekday = extract(dow from v_start)::integer
       and v_start >= v_start::date + h.opens_at::time
       and v_end   <= v_start::date + h.closes_at::time
  ) then
    raise exception 'Ese horario está fuera de nuestro horario de atención.';
  end if;

  -- H5: bloqueos de la dueña (vacaciones, almuerzo, un asunto personal).
  if exists (
    select 1 from time_block t
     where t.business_id = v_business
       and t.starts_at::timestamp < v_end
       and v_start < t.ends_at::timestamp
  ) then
    raise exception 'Ese horario no está disponible. Elige otro, por favor.';
  end if;

  select count(*) into v_count
    from appointment
   where business_id = v_business
     and client_phone = p_client_phone
     and requested_at > now() - interval '1 day';
  if v_count >= v_max_req then
    raise exception 'Demasiadas solicitudes desde este teléfono. Escríbenos directamente.';
  end if;

  -- Re-verifica el choque DENTRO del lock. El navegador ya filtró, pero el
  -- navegador no es una garantía: la verdad vive aquí.
  -- `buffer_min` extiende el ocupado a AMBOS lados de cada cita, igual que
  -- `occupiesSchedule` en availability.ts: el descanso es "entre citas", así que
  -- también protege el hueco previo.
  if exists (
    select 1
      from appointment a
      join lateral (
        -- null = la cita no tiene servicios resolubles. Ver el fallo seguro abajo.
        -- ::integer obligatorio: sum() devuelve bigint y make_interval(mins =>)
        -- solo acepta integer. Sin el cast, la función revienta al primer choque.
        select case when count(*) = 0 then null else sum(s.duration_min)::integer end as total
          from appointment_service aps
          join service s on s.id = aps.service_id
         where aps.appointment_id = a.id
      ) d on true
     where a.business_id = v_business
       and a.status in ('REQUESTED', 'PENDING', 'IN_PROGRESS', 'COMPLETED')
       and a.datetime::timestamp - make_interval(mins => v_buffer) < v_end
       -- FALLO SEGURO, espejo de `occupiesSchedule` en availability.ts (decisión
       -- A6): si no se puede saber cuánto dura una cita existente, se la trata
       -- como que choca. Calcularla corta dejaría pasar una doble reserva, que
       -- es exactamente el fallo que esa decisión cerró del lado del navegador.
       and (d.total is null
            or v_start < a.datetime::timestamp + make_interval(mins => d.total + v_buffer))
  ) then
    raise exception 'Ese horario acaba de ocuparse. Elige otro, por favor.';
  end if;

  v_new_id := nextval('public_appointment_id_seq');
  insert into appointment (
    id, business_id, service_id, client, client_phone, datetime, status,
    source, requested_at, quoted_price, deposit, charged_price, actual_cost, profit
  ) values (
    v_new_id, v_business, p_service_ids[1], trim(p_client_name), trim(p_client_phone),
    p_datetime, 'REQUESTED', 'SELF', now(), null, null, null, null, null
  );

  -- Las líneas de la cita. `service_id` en `appointment` se queda con el primero
  -- como servicio principal (fase de expansión, decisión D3): la verdad de qué
  -- servicios lleva la cita vive aquí.
  insert into appointment_service (appointment_id, service_id, business_id)
  select v_new_id, id, v_business from service where id = any(p_service_ids);

  return v_new_id;
end; $$;
revoke execute on function public_request_booking(text, bigint[], text, text, text) from public;
grant  execute on function public_request_booking(text, bigint[], text, text, text) to anon, authenticated;
