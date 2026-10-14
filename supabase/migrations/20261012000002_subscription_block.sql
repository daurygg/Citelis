-- Bloqueo en el servidor (S3 de odd/tasks/saas-subscriptions.md). S2 guardó y calculó
-- el ESTADO de la suscripción; esta migración lo APLICA: un negocio BLOQUEADO deja de
-- ver y de escribir sus datos, y su portal público se cierra.
--
-- QUÉ HACE
--   1. `is_member(b)` exige además `business_operational(b)`. Es el ÚNICO punto de
--      cambio: 21 policies RLS en 19 tablas (más tres de Storage, `business-logos`)
--      llaman a esta función, así que con el negocio bloqueado todo eso queda
--      invisible e inescribible sin tocar ninguna policy. Un negocio EXENTO, en
--      PRUEBA, ACTIVO o en GRACIA sigue exactamente igual que antes.
--   2. Las RPC públicas de reserva (`public_business`, `public_hours`, `public_busy`,
--      `public_request_booking`, `resolve_public_slug`) añaden la misma condición que
--      ya tenían para el portal cerrado. Un negocio bloqueado se ve IGUAL que uno con
--      el portal cerrado: mismas filas vacías, mismo mensaje. No hay forma nueva de
--      error ni se filtra que el negocio existe pero no pagó.
--   3. `my_subscription()`: lo que la pantalla de bloqueo necesita. Ver abajo.
--
-- LO QUE NO SE TOCA, A PROPÓSITO
--   · La policy `member_select` de `business_member` usa `user_id = auth.uid()`, NO
--     `is_member`. Es la salida de emergencia: la dueña bloqueada sigue leyendo su
--     membresía y así sabe su `business_id`. Cambiarla la dejaría sin forma de saber por
--     qué está bloqueada.
--   · `public_receipt(token)` ni mira la suscripción: el recibo es el comprobante de
--     la clienta, no una función del negocio. El bucket `business-logos` es público (URL
--     directa, sin RLS), así que el recibo conserva su logo.
--
-- COSTE: `business_operational` es una lectura por llave primaria que se añade a cada
-- evaluación de `is_member`. Es `security definer` (S2), así que lee
-- `business_subscription` sin pasar por su propia policy y no puede recursar.
--
-- ADITIVA en datos: no cambia ni borra una fila. Revertir = restaurar el cuerpo
-- anterior de `is_member` y de las cinco RPC.

-- ── 1 · is_member ───────────────────────────────────────────────────────────
-- Mismo cuerpo que la baseline; solo cambia la segunda condición. Se repite el
-- `search_path` fijo que 20260918000003 le puso: `create or replace` lo reiniciaría.
create or replace function is_member(b bigint)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $$
  select exists (
    select 1 from business_member m
    where m.business_id = b and m.user_id = auth.uid()
  ) and business_operational(b);
$$;

-- ── 2 · RPC públicas ────────────────────────────────────────────────────────
-- Cada una parte del texto vigente; el ÚNICO cambio es `and business_operational(...)`
-- junto a la comprobación de portal abierto. Permisos intactos (create or replace los
-- conserva).

-- Texto vigente: 20261010000003.
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
     and business_operational(p.business_id)
     and s.duration_min > 0
   order by s.name;
$$;

-- Texto vigente: 20260918000002 (+ search_path de 20260918000003).
create or replace function public_hours(p_slug text)
returns table (weekday integer, opens_at text, closes_at text)
language sql security definer stable
set search_path = public, pg_temp as $$
  select h.weekday, h.opens_at, h.closes_at
    from booking_policy p
    join business_hours h on h.business_id = p.business_id
   where p.public_slug = p_slug and p.enabled
     and business_operational(p.business_id);
$$;

-- Texto vigente: 20260929000002.
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
     and business_operational(p.business_id)
     and a.datetime like p_date || 'T%'
     and a.status in ('REQUESTED', 'PENDING', 'IN_PROGRESS', 'COMPLETED')
  union all
  select t.starts_at,
         greatest(1, (extract(epoch from (t.ends_at::timestamp - t.starts_at::timestamp)) / 60)::integer)
    from booking_policy p
    join time_block t on t.business_id = p.business_id
   where p.public_slug = p_slug
     and p.enabled
     and business_operational(p.business_id)
     and t.starts_at like p_date || 'T%';
$$;

-- Texto vigente: 20260923000001.
create or replace function resolve_public_slug(p_slug text)
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select p.public_slug
    from booking_slug_history h
    join booking_policy p on p.business_id = h.business_id
   where h.slug = p_slug
     and p.enabled
     and business_operational(p.business_id);
$$;

-- public_request_booking: texto vigente de 20261010000003, SIN reescribir las
-- validaciones H1–H6 (se escribieron a mano para espejar availability.ts tras fallos
-- reales en producción). El ÚNICO cambio es la línea marcada con "S3" en la primera
-- consulta: un negocio bloqueado cae en el mismo "no acepta reservas en línea" que un
-- portal cerrado.
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
    from booking_policy where public_slug = p_slug and enabled
      and business_operational(business_id); -- S3: bloqueado = portal cerrado
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

-- ── 3 · my_subscription ─────────────────────────────────────────────────────
-- Lo que la pantalla de bloqueo (y el aviso de prueba/gracia) necesita, y que la dueña
-- bloqueada no podría leer por RLS: `business_subscription` se rige por `is_member`.
--
-- NO llama a `is_member`: resuelve el negocio de quien pregunta con `business_member` +
-- `auth.uid()` directamente. Si pasara por `is_member`, una dueña bloqueada nunca
-- podría leer su propio estado y la pantalla de bloqueo no tendría nada que mostrar.
--
-- FORMA (una fila; vacía si quien llama no es miembro de ningún negocio):
--   business_id    bigint       el negocio de la dueña
--   status         text         'TRIAL' | 'ACTIVE' | 'GRACE' | 'BLOCKED' | 'EXEMPT'
--   operational    boolean      false solo con BLOCKED
--   days_left      integer      días hasta `ends_at`, contando un día empezado como
--                               entero (ceil); 0 con BLOCKED y EXEMPT
--   ends_at        timestamptz  fin de lo vigente: paid_until (ACTIVE), trial_ends_at
--                               (TRIAL) o el último día de gracia (GRACE); nulo con
--                               BLOCKED y EXEMPT
--   trial_ends_at  timestamptz  fecha guardada, tal cual
--   paid_until     timestamptz  fecha guardada, tal cual (nula si nunca pagó)
--   exempt         boolean
-- Espejo de `subscriptionStatus` en src/lib/domain/subscription.ts: si cambia una regla,
-- cambian las dos (y `subscription_status`).
--
-- Si la dueña perteneciera a varios negocios, devuelve el de menor id (hoy cada cuenta
-- crea uno solo). Un negocio sin fila de suscripción devuelve vacío.
create or replace function my_subscription()
returns table (
  business_id   bigint,
  status        text,
  operational   boolean,
  days_left     integer,
  ends_at       timestamptz,
  trial_ends_at timestamptz,
  paid_until    timestamptz,
  exempt        boolean
) language sql stable security definer
set search_path = public, pg_temp as $$
  select m.business_id,
         st.status,
         st.status <> 'BLOCKED',
         case when st.end_at is null then 0
              else ceil(extract(epoch from (st.end_at - now())) / 86400.0)::integer end,
         st.end_at,
         s.trial_ends_at,
         s.paid_until,
         s.exempt
    from (select bm.business_id
            from business_member bm
           where bm.user_id = auth.uid()
           order by bm.business_id
           limit 1) m
    join business_subscription s on s.business_id = m.business_id
    cross join lateral (
      select subscription_status(m.business_id) as status,
             case subscription_status(m.business_id)
               when 'ACTIVE' then s.paid_until
               when 'TRIAL'  then s.trial_ends_at
               when 'GRACE'  then greatest(s.trial_ends_at, coalesce(s.paid_until, s.trial_ends_at))
                                  + interval '7 days'
               else null
             end as end_at
    ) st;
$$;

revoke execute on function my_subscription() from public, anon;
grant  execute on function my_subscription() to authenticated;
