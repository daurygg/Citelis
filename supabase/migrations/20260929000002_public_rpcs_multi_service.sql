-- Las RPC públicas cuentan varios servicios por cita (T4 de
-- odd/tasks/multi-service-appointments.md).
--
-- QUÉ CAMBIA Y QUÉ NO
--   Solo la ARITMÉTICA: la duración de una cita pasa a ser la suma de sus
--   servicios, y la solicitud acepta varios. Ninguna validación se relaja, se
--   reordena ni se reescribe: se partió del texto vigente y se aplicaron cuatro
--   cambios dirigidos. Las reglas H1–H6 (aviso mínimo, horizonte, horario de
--   atención, bloqueos, anti-spam, huso horario) quedan intactas, y su regresión
--   `supabase/tests/self-booking-regression.sql` TIENE que seguir pasando: es la
--   red que avisa si esta migración las tocó sin querer.
--
--   NO se toca `public_business`: sigue filtrando `variable_price = false`. Los
--   servicios de precio variable entran al portal en T5, junto con la pantalla
--   que sabe decir "a convenir". Así esta migración no cambia nada visible.
--
-- EL FALLO SEGURO, QUE ES LO DELICADO
--   `availability.ts` bloquea a infinito cuando no puede saber cuánto dura una
--   cita existente (decisión A6, hallazgo crítico de una revisión: una duración
--   calculada corta deja pasar una doble reserva). Esa misma regla se replica
--   aquí, porque el navegador filtra pero la verdad vive en el servidor. Si las
--   dos copias se separan, se separan en silencio — que es justo como
--   aparecieron los fallos H2–H5 en producción.
--
-- ADITIVA: no borra ni una fila.

-- ── public_busy: el hueco ocupado es la suma de los servicios ───────────────
create or replace function public_busy(p_slug text, p_date text)
returns table (starts_at text, duration_min integer)
language sql stable security definer
set search_path = public, pg_temp as $$
  select a.datetime,
         -- Mismo fallo seguro: sin servicios resolubles se reporta un bloque
         -- enorme, para que el navegador tampoco ofrezca ese horario.
         coalesce(
           (select sum(s.duration_min)::integer
              from appointment_service aps
              join service s on s.id = aps.service_id
             where aps.appointment_id = a.id),
           24 * 60
         )
    from booking_policy p
    join appointment a on a.business_id = p.business_id
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

revoke execute on function public_busy(text, text) from public;
grant  execute on function public_busy(text, text) to anon, authenticated;

-- ── public_request_booking: acepta varios servicios ────────────────────────
-- La firma cambia de `p_service_id bigint` a `p_service_ids bigint[]`, así que
-- hay que tirar la vieja: si no, una llamada con un solo argumento quedaría
-- ambigua entre las dos, el mismo problema que en 20260922000001.
drop function if exists public_request_booking(text, bigint, text, text, text);

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
          and variable_price = false and duration_min > 0
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
