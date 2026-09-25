-- Cierra los huecos H1–H6 que salieron al ejecutar el flujo de auto-reserva
-- contra la base real (ver odd/tasks/self-booking.md).
--
-- El hilo común: `public_request_booking` solo validaba choques. Horario,
-- aviso, horizonte y bloqueos vivían únicamente en `generateSlots`, en el
-- navegador. Pero la RPC es API pública: se llama con curl sin abrir la web.
-- Las reglas del negocio pasan aquí, donde nadie puede saltárselas.
--
-- La semántica replica EXACTAMENTE la de `src/lib/domain/availability.ts`. Si
-- el servidor fuera más estricto que el navegador, la clienta vería errores al
-- reservar horarios que la propia web le acaba de ofrecer.

-- ── H6: huso horario del negocio ───────────────────────────────────────────
-- `appointment.datetime` es hora local sin zona, pero la base corre en UTC.
-- Comparar una contra otra desfasa 4 horas en República Dominicana: ahora mismo
-- `expire_stale_requests` rechazaría solicitudes de hasta 4 horas EN EL FUTURO.
-- El huso se guarda por negocio porque es un dato del negocio, no del servidor.
alter table booking_policy
  add column if not exists timezone text not null default 'America/Santo_Domingo';

-- ── H1: `expire_stale_requests` dejaba escribir a cualquiera ───────────────
-- Un anónimo sin autenticar la llamaba con cualquier business_id y cambiaba
-- filas a REJECTED. Causa raíz: Postgres concede EXECUTE a PUBLIC por defecto
-- al crear una función, así que el `grant ... to authenticated` original no
-- restringía nada; solo añadía.
--
-- Se cierra revocando, NO añadiendo un chequeo de pertenencia: su único
-- llamador legítimo es `public_request_booking`, que corre para una clienta
-- ANÓNIMA. Un `is_member` ahí dentro rompería la reserva pública. Como
-- `public_request_booking` es SECURITY DEFINER, su llamada interna sigue
-- funcionando con los privilegios del dueño.
create or replace function expire_stale_requests(p_business_id bigint)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_tz text;
begin
  select timezone into v_tz from booking_policy where business_id = p_business_id;
  -- Negocio sin portal público: no hay solicitudes que caducar.
  if v_tz is null then return; end if;

  update appointment
     set status = 'REJECTED'
   where business_id = p_business_id
     and status = 'REQUESTED'
     and datetime < to_char(now() at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI');
end; $$;

revoke execute on function expire_stale_requests(bigint) from public;
revoke execute on function expire_stale_requests(bigint) from anon;
revoke execute on function expire_stale_requests(bigint) from authenticated;

-- ── H2–H5: las reglas del negocio pasan al servidor ────────────────────────
create or replace function public_request_booking(
  p_slug        text,
  p_service_id  bigint,
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

  select duration_min into v_duration
    from service
   where id = p_service_id and business_id = v_business
     and variable_price = false and duration_min > 0;
  if v_duration is null then raise exception 'Servicio no disponible para reserva en línea'; end if;

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
      join service s on s.id = a.service_id
     where a.business_id = v_business
       and a.status in ('REQUESTED', 'PENDING', 'IN_PROGRESS', 'COMPLETED')
       and a.datetime::timestamp - make_interval(mins => v_buffer) < v_end
       and v_start < a.datetime::timestamp + make_interval(mins => s.duration_min + v_buffer)
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

-- ── search_path fijo en todas las SECURITY DEFINER ─────────────────────────
-- Sin esto, quien pueda crear objetos en un esquema que entre antes en el
-- search_path secuestra una referencia y ejecuta código como el dueño de la
-- función. Es el vector clásico de escalada de privilegios.
alter function is_member(bigint)                                          set search_path = public, pg_temp;
alter function create_business(text)                                      set search_path = public, pg_temp;
alter function create_invitation()                                        set search_path = public, pg_temp;
alter function redeem_invitation(text)                                    set search_path = public, pg_temp;
alter function public_business(text)                                      set search_path = public, pg_temp;
alter function public_hours(text)                                         set search_path = public, pg_temp;
alter function public_busy(text, text)                                    set search_path = public, pg_temp;

-- ── Misma causa raíz que H1: quitar el EXECUTE que PUBLIC trae de fábrica ──
-- Estas tres ya se defienden solas comprobando `auth.uid()`, así que esto no
-- cambia el comportamiento de nadie real. Es defensa en profundidad: que el
-- permiso diga lo que de verdad queremos, en vez de depender de un `raise`.
revoke execute on function create_business(text)   from public;
revoke execute on function create_invitation()     from public;
revoke execute on function redeem_invitation(text) from public;
grant  execute on function create_business(text)   to authenticated;
grant  execute on function create_invitation()     to authenticated;
grant  execute on function redeem_invitation(text) to authenticated;

-- `is_member` se queda accesible para anon a propósito: las policies RLS la
-- evalúan como el usuario que consulta. Revocarla convertiría "no ves nada" en
-- un error de permisos. No filtra nada: para un anónimo siempre devuelve false.
