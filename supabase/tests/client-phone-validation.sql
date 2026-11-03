-- Regresión de T3 de odd/tasks/phone-validation.md: validación del teléfono de la clienta.
-- Ver supabase/migrations/20261104000001_client_phone_validation.sql.
--
-- CÓMO CORRERLO
--   psql, DESPUÉS de las migraciones. Crea sus propios datos (ids 99996xx) y los borra al final.
--
-- QUÉ PRUEBA
--   0 · `client_phone_is_valid` existe, es inmutable, y las RPC no tienen sobrecargas.
--   1 · la función: letras, "+" fuera del inicio, 9/12 dígitos sin "+", 11 sin 1, "+123" y
--       16 dígitos con "+" son inválidos; los formatos dominicanos, "1-809…", "+34…" y
--       "+1 809…" son válidos; vacío y solo espacios no lo son.
--   2 · `schedule_appointment` rechaza letras y números cortos sin dejar cita ni clienta, y
--       acepta dominicano y "+" internacional.
--   3 · `schedule_appointment` sin teléfono sigue permitido; con una clienta elegida cuyo
--       teléfono guardado es anterior a la regla (inválido) la cita se agenda igual.
--   4 · `public_request_booking` rechaza letras y números cortos ANTES de escribir nada y
--       acepta dominicano y "+" internacional.
--   Toda cita se crea por las RPC (con sus líneas de servicio): una cita sin
--   `appointment_service` haría que el fallo seguro del portal bloquee las reservas siguientes.

do $$
declare
  v_uid   uuid := '00000000-0000-0000-0000-0000000009f5';
  v_biz   bigint;
  v_svc   bigint := 999961;
  v_slug  text   := 'prueba-telefono';
  v_fecha text;
  v_cid   bigint;
  v_n     integer;
  v_n0    integer;
  v_msg   text;
  v_t     text;
begin
  -- 0 · Estructura.
  if to_regprocedure('public.client_phone_is_valid(text)') is null then
    raise exception 'FALLÓ 0: client_phone_is_valid no existe. ¿Aplicaste la migración?';
  end if;
  if (select provolatile from pg_proc where oid = 'public.client_phone_is_valid(text)'::regprocedure) <> 'i' then
    raise exception 'FALLÓ 0: client_phone_is_valid debe ser IMMUTABLE';
  end if;
  select count(*) into v_n from pg_proc
   where proname in ('schedule_appointment', 'public_request_booking') and pronamespace = 'public'::regnamespace;
  if v_n <> 2 then
    raise exception 'FALLÓ 0: hay % firmas de las RPC (deben ser 2, sin sobrecargas)', v_n;
  end if;

  -- 1 · La función.
  foreach v_t in array array[
    'abc', '809abc1234', '8o9-555-1234', '809+5551234', '+34 +612345678',
    '809555123', '180955512345', '2-809-555-1234', '+123', '+1234567', '+1234567890123456',
    '', '   ', '809 555 1234 x', E'809\t555\t1234'
  ] loop
    if client_phone_is_valid(v_t) then
      raise exception 'FALLÓ 1: "%" debía ser inválido', v_t;
    end if;
  end loop;
  if client_phone_is_valid(null) then raise exception 'FALLÓ 1: null debía ser inválido'; end if;
  foreach v_t in array array[
    '8095551234', '809-555-1234', '(809) 555 1234', '809.555.1234', ' 809-555-1234 ',
    '1-809-555-1234', '18095551234', '+34 612 345 678', '+1 809 555 1234',
    '+12345678', '+123456789012345'
  ] loop
    if not client_phone_is_valid(v_t) then
      raise exception 'FALLÓ 1: "%" debía ser válido', v_t;
    end if;
  end loop;

  -- Datos propios; limpieza previa por si una corrida murió a medias.
  delete from business where created_by = v_uid;
  delete from auth.users where id = v_uid;
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (v_uid, 'authenticated', 'authenticated', 'prueba-tel1@citelis.test', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_biz := create_business('PRUEBA Teléfono', '#e11d48', v_slug);
  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc, v_biz, 'Cejas', 5000, 1000, null, 30, false);
  update booking_policy
     set enabled = true, min_notice_hours = 0, max_horizon_days = 365, buffer_min = 0,
         max_requests_per_phone_per_day = 50
   where business_id = v_biz;
  insert into business_hours (id, business_id, weekday, opens_at, closes_at)
  select 999970 + d, v_biz, d, '08:00', '20:00' from generate_series(0, 6) d;
  v_fecha := to_char((now() at time zone 'America/Santo_Domingo')::date + 3, 'YYYY-MM-DD');

  -- 2 · schedule_appointment: inválidos rechazados, sin dejar nada.
  select count(*) into v_n0 from client where business_id = v_biz;
  foreach v_t in array array['abc 123', '809abc1234', '12345', '8o9-555-1234', '+123'] loop
    v_msg := null;
    begin
      perform schedule_appointment(v_biz, 9999601, 'Ana', '2026-10-12T10:00', null, null,
                                   array[v_svc], null, v_t, null);
    exception when others then v_msg := sqlerrm; end;
    if v_msg is distinct from 'El teléfono no es válido.' then
      raise exception 'FALLÓ 2: schedule_appointment con "%" dio "%"', v_t, coalesce(v_msg, 'éxito');
    end if;
  end loop;
  select count(*) into v_n from appointment where business_id = v_biz;
  if v_n <> 0 then raise exception 'FALLÓ 2: quedaron % citas tras rechazos', v_n; end if;
  select count(*) into v_n from client where business_id = v_biz;
  if v_n <> v_n0 then raise exception 'FALLÓ 2: los rechazos crearon clientas'; end if;

  -- 2b · Válidos aceptados: dominicano e internacional.
  perform schedule_appointment(v_biz, 9999602, 'Ana', '2026-10-12T10:00', null, null,
                               array[v_svc], null, '(809) 555 1234', null);
  perform schedule_appointment(v_biz, 9999603, 'Marta', '2026-10-12T11:00', null, null,
                               array[v_svc], null, '+34 612 345 678', null);
  select count(*) into v_n from appointment where id in (9999602, 9999603) and client_id is not null;
  if v_n <> 2 then raise exception 'FALLÓ 2b: no se agendaron los teléfonos válidos (%)', v_n; end if;

  -- 3 · Sin teléfono sigue permitido; una clienta elegida con teléfono viejo inválido también.
  perform schedule_appointment(v_biz, 9999604, 'Sin Tel', '2026-10-12T12:00', null, null, array[v_svc]);
  insert into client (business_id, name, phone) values (v_biz, 'Antigua', '123') returning id into v_cid;
  perform schedule_appointment(v_biz, 9999605, 'Antigua', '2026-10-12T13:00', null, null,
                               array[v_svc], null, '123', v_cid);
  select count(*) into v_n from appointment where id in (9999604, 9999605);
  if v_n <> 2 then raise exception 'FALLÓ 3: no se agendó sin teléfono o con la clienta antigua'; end if;
  -- Pero a una clienta elegida no se le puede colar un teléfono inválido NUEVO.
  v_msg := null;
  begin
    perform schedule_appointment(v_biz, 9999606, 'Antigua', '2026-10-12T14:00', null, null,
                                 array[v_svc], null, '123 abc', v_cid);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El teléfono no es válido.' then
    raise exception 'FALLÓ 3: un teléfono inválido nuevo con clienta elegida dio "%"', coalesce(v_msg, 'éxito');
  end if;

  -- 4 · Portal: inválidos rechazados ANTES de escribir.
  select count(*) into v_n0 from appointment where business_id = v_biz;
  foreach v_t in array array['abc', '809abc1234', '12345', '8o9-555-1234', '+123'] loop
    v_msg := null;
    begin
      perform public_request_booking(v_slug, array[v_svc], v_fecha || 'T10:00', 'Luz', v_t);
    exception when others then v_msg := sqlerrm; end;
    if v_msg is distinct from 'El teléfono no es válido.' then
      raise exception 'FALLÓ 4: public_request_booking con "%" dio "%"', v_t, coalesce(v_msg, 'éxito');
    end if;
  end loop;
  select count(*) into v_n from appointment where business_id = v_biz;
  if v_n <> v_n0 then raise exception 'FALLÓ 4: los rechazos del portal dejaron citas'; end if;
  select count(*) into v_n from client where business_id = v_biz and name = 'Luz';
  if v_n <> 0 then raise exception 'FALLÓ 4: los rechazos del portal crearon clientas'; end if;

  -- 4b · Válidos aceptados (horas distintas para no chocar entre sí).
  perform public_request_booking(v_slug, array[v_svc], v_fecha || 'T10:00', 'Luz', '849-333-0003');
  perform public_request_booking(v_slug, array[v_svc], v_fecha || 'T12:00', 'Pepa', '+1 809 555 9999');
  perform public_request_booking(v_slug, array[v_svc], v_fecha || 'T14:00', 'Ines', '+34 612 345 678');
  select count(*) into v_n from appointment
   where business_id = v_biz and source = 'SELF' and status = 'REQUESTED';
  if v_n <> 3 then raise exception 'FALLÓ 4b: se esperaban 3 solicitudes válidas, hay %', v_n; end if;

  -- Limpieza: el borrado en cascada se lleva servicios, citas y clientas.
  delete from business where id = v_biz;
  delete from auth.users where id = v_uid;
end $$;
