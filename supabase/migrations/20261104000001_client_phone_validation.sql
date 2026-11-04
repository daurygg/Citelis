-- Validación del teléfono de la clienta (odd/tasks/phone-validation.md).
--
-- POR QUÉ
--   `client-directory` solo normalizaba el teléfono: "abc 123" pasaba como "123" y el portal solo
--   exigía que no estuviera vacío. Ahora el servidor rechaza lo que no es un teléfono.
--
-- LA REGLA (misma que `isValidPhone` en src/lib/domain/clients.ts; si una cambia, cambia la otra)
--   · Solo dígitos, espacios, "-", ".", "(", ")" y un "+" al inicio. Cualquier otra cosa: inválido.
--   · Sin "+": dominicano, 10 dígitos u 11 empezando en 1.
--   · Con "+": internacional, de 8 a 15 dígitos.
--   · Vacío o null: inválido (quien llama decide si el teléfono es opcional).
--
-- QUÉ NO HACE: no toca ni limpia teléfonos ya guardados; `client_phone_digits` no cambia.
-- Las dos RPC se recrean con el texto vigente de 20261103000001 y UN solo cambio: la validación.

create or replace function client_phone_is_valid(p_phone text)
returns boolean language sql immutable parallel safe as $$
  select coalesce(
    btrim(p_phone) ~ '^\+?[0-9 ().-]+$'
    and case
          when btrim(p_phone) like '+%'
            then length(regexp_replace(p_phone, '\D', '', 'g')) between 8 and 15
          else regexp_replace(p_phone, '\D', '', 'g') ~ '^1?[0-9]{10}$'
        end,
    false)
$$;

create or replace function schedule_appointment(
  p_business_id     bigint,
  p_appointment_id  bigint,
  p_client          text,
  p_datetime        text,
  p_quoted_price    bigint,
  p_deposit         bigint,
  p_service_ids     bigint[],
  p_deposit_method  text   default null,
  p_client_phone    text   default null,
  p_client_id       bigint default null
)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_n        integer;
  v_distinct integer;
  v_valid    integer;
  v_phone    text;
  v_digits   text;
  v_client   bigint;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;

  if p_client is null or btrim(p_client) = '' then
    raise exception 'Falta el nombre de la clienta.';
  end if;
  if p_datetime is null or btrim(p_datetime) = '' then
    raise exception 'Falta la fecha y hora de la cita.';
  end if;
  if (p_quoted_price is not null and p_quoted_price < 0)
     or (p_deposit is not null and p_deposit < 0) then
    raise exception 'Los montos de la cita no son válidos.';
  end if;
  if p_deposit_method is not null and p_deposit_method not in ('cash', 'transfer', 'card') then
    raise exception 'La vía de pago no es válida.';
  end if;

  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Elige al menos un servicio.';
  end if;
  if array_position(p_service_ids, null) is not null then
    raise exception 'Hay un servicio vacío en la lista.';
  end if;

  select count(*), count(distinct s) into v_n, v_distinct from unnest(p_service_ids) as s;
  if v_n <> v_distinct then raise exception 'Un servicio aparece repetido en la cita.'; end if;

  select count(*) into v_valid
    from service
   where business_id = p_business_id
     and id = any (p_service_ids)
     and duration_min > 0;
  if v_valid <> v_n then
    raise exception 'Un servicio no pertenece a tu negocio o no tiene duración.';
  end if;

  -- Clienta (INVARIANTE 1: siempre dentro de ESTE negocio).
  v_phone := nullif(btrim(p_client_phone), '');
  if v_phone is not null then
    v_digits := client_phone_digits(v_phone);
    if v_digits is null then raise exception 'El teléfono no es válido.'; end if;
    -- Regla completa (letras, largo). Con una clienta elegida, su teléfono ya guardado se
    -- acepta tal cual aunque sea anterior a esta regla: no se le bloquea agendarla.
    if not client_phone_is_valid(v_phone)
       and not (p_client_id is not null
                and exists (select 1 from client
                             where id = p_client_id and business_id = p_business_id
                               and btrim(phone) is not distinct from v_phone)) then
      raise exception 'El teléfono no es válido.';
    end if;
  end if;

  if p_client_id is not null then
    select id, coalesce(v_phone, phone) into v_client, v_phone
      from client where id = p_client_id and business_id = p_business_id;
    if v_client is null then
      raise exception 'Esa clienta no pertenece a tu negocio.';
    end if;
  elsif v_phone is not null then
    select id into v_client from client
     where business_id = p_business_id and phone_digits = v_digits;
    if v_client is null then
      -- Alta idempotente: si dos primeras reservas con el mismo teléfono corren a la vez,
      -- la segunda chocaría con el índice único y fallaría toda la cita. Con `do nothing`
      -- no falla: no devuelve fila y se reutiliza la que ganó la carrera. El destino del
      -- `on conflict` repite EXACTO el índice parcial client_business_phone_digits_uidx.
      insert into client (business_id, name, phone)
      values (p_business_id, btrim(p_client), v_phone)
      on conflict (business_id, phone_digits) where phone_digits is not null do nothing
      returning id into v_client;
      if v_client is null then
        select id into v_client from client
         where business_id = p_business_id and phone_digits = v_digits;
      end if;
    end if;
  else
    -- Sin teléfono ni clienta elegida: antes cada cita creaba una clienta nueva y la
    -- lista se llenaba de "Ana", "Ana", "Ana". Se reutiliza la clienta SIN teléfono de
    -- este negocio con el mismo nombre (sin mayúsculas ni espacios de más; las tildes
    -- sí cuentan, porque el proyecto no usa `unaccent`). Si hay varias, la más antigua.
    -- Es "mejor esfuerzo": no hay índice único por nombre, así que dos citas simultáneas
    -- de una clienta nueva sin teléfono podrían crear dos filas. Aceptado: es un duplicado
    -- inocuo, no un fallo, y la dueña puede elegirla en el selector.
    select id into v_client from client
     where business_id = p_business_id and phone is null
       and lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
         = lower(regexp_replace(btrim(p_client), '\s+', ' ', 'g'))
     order by id
     limit 1;
    if v_client is null then
      insert into client (business_id, name, phone)
      values (p_business_id, btrim(p_client), null)
      returning id into v_client;
    end if;
  end if;

  insert into appointment (id, business_id, service_id, client, client_phone, client_id, datetime,
                           status, quoted_price, deposit, charged_price, actual_cost, profit)
  values (p_appointment_id, p_business_id, p_service_ids[1], p_client, v_phone, v_client, p_datetime,
          'PENDING', p_quoted_price, p_deposit, null, null, null);

  insert into appointment_service (appointment_id, service_id, business_id)
  select p_appointment_id, s, p_business_id from unnest(p_service_ids) as s;

  -- El abono es un pago: nace con la cita o no nace ninguno. Sin vía (llamadas de 7
  -- argumentos del frontend anterior) queda como "sin vía registrada" (legacy).
  if p_deposit is not null and p_deposit > 0 then
    insert into appointment_payment (business_id, appointment_id, amount, method, kind, legacy)
    values (p_business_id, p_appointment_id, p_deposit, p_deposit_method, 'deposit',
            p_deposit_method is null);
  end if;
end $$;

revoke execute on function schedule_appointment(bigint, bigint, text, text, bigint, bigint, bigint[], text, text, bigint) from public;
revoke execute on function schedule_appointment(bigint, bigint, text, text, bigint, bigint, bigint[], text, text, bigint) from anon;
grant  execute on function schedule_appointment(bigint, bigint, text, text, bigint, bigint, bigint[], text, text, bigint) to authenticated;

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
  v_digits      text;
  v_client      bigint;
begin
  if coalesce(trim(p_client_name), '') = '' then raise exception 'Falta el nombre'; end if;
  if coalesce(trim(p_client_phone), '') = '' then raise exception 'Falta el teléfono'; end if;
  if not client_phone_is_valid(p_client_phone) then raise exception 'El teléfono no es válido.'; end if;
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

  -- CLIENTA: se busca por teléfono (dígitos sin código de país) dentro de ESTE negocio;
  -- si no existe se crea con el nombre que escribió. Si ya existía NO se renombra: manda
  -- lo que guardó la dueña. El lock del negocio ya serializa esto, pero el alta también es
  -- idempotente (`on conflict do nothing` + relectura) por si la clienta la crea la dueña
  -- (schedule_appointment) desde otra transacción que no toma ese lock.
  v_digits := client_phone_digits(p_client_phone);
  if v_digits is not null then
    select id into v_client from client
     where business_id = v_business and phone_digits = v_digits;
  end if;
  if v_client is null then
    insert into client (business_id, name, phone)
    values (v_business, trim(p_client_name), trim(p_client_phone))
    on conflict (business_id, phone_digits) where phone_digits is not null do nothing
    returning id into v_client;
    if v_client is null then
      select id into v_client from client
       where business_id = v_business and phone_digits = v_digits;
    end if;
  end if;

  v_new_id := nextval('public_appointment_id_seq');
  insert into appointment (
    id, business_id, service_id, client, client_phone, client_id, datetime, status,
    source, requested_at, quoted_price, deposit, charged_price, actual_cost, profit
  ) values (
    v_new_id, v_business, p_service_ids[1], trim(p_client_name), trim(p_client_phone), v_client,
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
