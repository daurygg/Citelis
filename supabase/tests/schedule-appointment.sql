-- Regresión de T6c: `schedule_appointment` crea la cita y sus líneas juntas.
-- Ver supabase/migrations/20261010000002_schedule_appointment.sql.
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP o psql. Pégalo entero, DESPUÉS de la migración
--   (y de la 20261010000001, que usa la prueba 7).
--
-- PARA VER EL ROJO (recomendado antes de aplicar la migración)
--   Córrelo ANTES: debe fallar en la aserción 0 diciendo que la función no existe.
--
-- QUÉ PRUEBA
--   1 · agendar con DOS servicios: nace PENDING, sin dinero, con service_id = el
--       primero de la lista y una línea por servicio (también con uno solo).
--   2 · un servicio de OTRO negocio: rechazado y NO queda ni la cita (INVARIANTE 1).
--   3 · un servicio repetido: rechazado y no queda la cita.
--   4 · lista vacía (y null): rechazado.
--   5 · un servicio con duración 0: rechazado.
--   6 · quien no es miembro del negocio no puede agendar (INVARIANTE 1).
--   7 · de punta a punta: agendar 2 servicios y completar con `complete_appointment`
--       (2 líneas) funciona, y las líneas quedan con su dinero.
--   8 · un id de cita repetido no pisa la cita existente.
--   9 · los permisos: `anon` no puede ejecutarla.
--
-- Crea sus propios datos (ids 999xxx) y los borra al final.

-- Usa SUS PROPIAS usuarias: cada cuenta solo puede crear un negocio (20261010000005),
-- y esta prueba crea dos. Se borran al final.

do $$
declare
  v_uid     uuid;
  v_uid2    uuid;
  v_biz     bigint;
  v_otro    bigint;
  v_svc1    bigint := 999821;
  v_svc2    bigint := 999822;
  v_svc_o   bigint := 999823;
  v_svc_0   bigint := 999824;
  v_apt1    bigint := 999921;
  v_apt2    bigint := 999922;
  v_apt_x   bigint := 999923;
  v_apt_e2e bigint := 999924;
  v_ok      boolean;
  v_row     appointment%rowtype;
  v_n       integer;
  v_chg     bigint;
begin
  -- 0 · La función existe.
  if to_regprocedure('public.schedule_appointment(bigint,bigint,text,text,bigint,bigint,bigint[])') is null then
    raise exception 'FALLÓ 0: schedule_appointment no existe. ¿Aplicaste la migración?';
  end if;

  -- Usuarias propias de la prueba (ver cabecera); limpieza previa por si una corrida murió a medias.
  v_uid := '00000000-0000-0000-0000-0000000009e3';
  v_uid2 := '00000000-0000-0000-0000-0000000009e4';
  delete from business where created_by in (v_uid, v_uid2);
  delete from auth.users where id in (v_uid, v_uid2);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid, 'authenticated', 'authenticated', 'prueba-i1@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-i2@citelis.test', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  v_biz  := create_business('PRUEBA Agendar', '#e11d48', 'prueba-agendar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_otro := create_business('PRUEBA Agendar Ajeno', '#e11d48', 'prueba-agendar-ajeno');
  -- Como antes de la regla de un negocio por cuenta: la dueña también es miembro del segundo.
  insert into business_member (user_id, business_id) values (v_uid, v_otro);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc1,  v_biz,  'Cejas',   5000, 1000, null, 30, false),
         (v_svc2,  v_biz,  'Ondas',   4000,  500, null, 45, false),
         (v_svc_o, v_otro, 'Ajeno',   3000,  100, null, 30, false),
         (v_svc_0, v_biz,  'Sin duración', 1000, 0, null, 0, false);

  -- 1 · Dos servicios: nace PENDING, sin dinero, principal = el primero.
  perform schedule_appointment(v_biz, v_apt1, 'Ana', '2026-10-12T10:00', null, 1500,
                               array[v_svc2, v_svc1]);
  select * into v_row from appointment where id = v_apt1;
  if v_row.status <> 'PENDING' then
    raise exception 'FALLÓ 1: la cita nació %, no PENDING', v_row.status;
  end if;
  if v_row.service_id <> v_svc2 then
    raise exception 'FALLÓ 1: el servicio principal es %, no el primero de la lista', v_row.service_id;
  end if;
  if v_row.charged_price is not null or v_row.actual_cost is not null or v_row.profit is not null then
    raise exception 'FALLÓ 1: la cita nació con dinero congelado (INVARIANTE 2)';
  end if;
  if v_row.deposit is distinct from 1500 or v_row.quoted_price is not null or v_row.business_id <> v_biz then
    raise exception 'FALLÓ 1: abono, precio acordado o negocio mal guardados';
  end if;
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt1 and business_id = v_biz
     and service_id in (v_svc1, v_svc2)
     and charged_price is null and actual_cost is null and profit is null;
  if v_n <> 2 then
    raise exception 'FALLÓ 1: se esperaban 2 líneas sin dinero y hay %', v_n;
  end if;

  -- 1b · Con UN solo servicio también nace su línea.
  perform schedule_appointment(v_biz, v_apt2, 'Rosa', '2026-10-12T11:00', 7000, null,
                               array[v_svc1]);
  select count(*) into v_n from appointment_service where appointment_id = v_apt2 and service_id = v_svc1;
  if v_n <> 1 then
    raise exception 'FALLÓ 1b: la cita de un servicio no tiene su línea';
  end if;

  -- 2 · Un servicio de OTRO negocio: rechazado y no queda ni la cita.
  v_ok := false;
  begin
    perform schedule_appointment(v_biz, v_apt_x, 'Intrusa', '2026-10-12T12:00', null, null,
                                 array[v_svc1, v_svc_o]);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 2: se agendó una cita con un servicio de otro negocio';
  end if;
  select count(*) into v_n from appointment where id = v_apt_x;
  if v_n <> 0 then
    raise exception 'FALLÓ 2: quedó una cita a medias tras el rechazo';
  end if;
  select count(*) into v_n from appointment_service where appointment_id = v_apt_x;
  if v_n <> 0 then
    raise exception 'FALLÓ 2: quedaron líneas tras el rechazo';
  end if;

  -- 3 · Un servicio repetido.
  v_ok := false;
  begin
    perform schedule_appointment(v_biz, v_apt_x, 'Repetida', '2026-10-12T12:00', null, null,
                                 array[v_svc1, v_svc1]);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 3: se agendó una cita con un servicio repetido';
  end if;
  select count(*) into v_n from appointment where id = v_apt_x;
  if v_n <> 0 then
    raise exception 'FALLÓ 3: quedó una cita tras el rechazo';
  end if;

  -- 4 · Lista vacía y lista null.
  v_ok := false;
  begin
    perform schedule_appointment(v_biz, v_apt_x, 'Vacía', '2026-10-12T12:00', null, null,
                                 array[]::bigint[]);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 4: se agendó una cita sin servicios';
  end if;
  v_ok := false;
  begin
    perform schedule_appointment(v_biz, v_apt_x, 'Nula', '2026-10-12T12:00', null, null, null);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 4: se agendó una cita con la lista null';
  end if;
  select count(*) into v_n from appointment where id = v_apt_x;
  if v_n <> 0 then
    raise exception 'FALLÓ 4: quedó una cita tras el rechazo';
  end if;

  -- 5 · Un servicio con duración 0.
  v_ok := false;
  begin
    perform schedule_appointment(v_biz, v_apt_x, 'Cero', '2026-10-12T12:00', null, null,
                                 array[v_svc1, v_svc_0]);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 5: se agendó una cita con un servicio de duración 0';
  end if;
  select count(*) into v_n from appointment where id = v_apt_x;
  if v_n <> 0 then
    raise exception 'FALLÓ 5: quedó una cita tras el rechazo';
  end if;

  -- 7 · De punta a punta: agendar 2 servicios y completar con 2 líneas.
  perform schedule_appointment(v_biz, v_apt_e2e, 'Extremo', '2026-10-13T10:00', null, null,
                               array[v_svc1, v_svc2]);
  perform complete_appointment(v_biz, v_apt_e2e, 9000, 1500, 7500,
    '[{"service_id":999821,"charged_price":5000,"actual_cost":1000,"profit":4000},
      {"service_id":999822,"charged_price":4000,"actual_cost":500,"profit":3500}]'::jsonb);
  select * into v_row from appointment where id = v_apt_e2e;
  if v_row.status <> 'COMPLETED' or v_row.charged_price <> 9000 or v_row.profit <> 7500 then
    raise exception 'FALLÓ 7: la cita agendada y completada quedó %, %, %', v_row.status, v_row.charged_price, v_row.profit;
  end if;
  select count(*), sum(charged_price) into v_n, v_chg from appointment_service where appointment_id = v_apt_e2e;
  if v_n <> 2 or v_chg is distinct from 9000 then
    raise exception 'FALLÓ 7: se esperaban 2 líneas que sumen 9000 y hay % (suman %)', v_n, v_chg;
  end if;

  -- 8 · Un id de cita repetido NO pisa la existente.
  v_ok := false;
  begin
    perform schedule_appointment(v_biz, v_apt1, 'Pisada', '2026-10-14T10:00', null, null,
                                 array[v_svc1]);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 8: un id repetido se aceptó';
  end if;
  select * into v_row from appointment where id = v_apt1;
  if v_row.client <> 'Ana' then
    raise exception 'FALLÓ 8: la cita existente fue pisada por %', v_row.client;
  end if;

  -- 6 · Quien no es miembro NO puede agendar. Se impersona a un usuario cualquiera.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  v_ok := false;
  begin
    perform schedule_appointment(v_biz, v_apt_x, 'Intruso', '2026-10-12T15:00', null, null,
                                 array[v_svc1]);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 6: un usuario que no es miembro agendó una cita en el negocio';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  select count(*) into v_n from appointment where id = v_apt_x;
  if v_n <> 0 then
    raise exception 'FALLÓ 6: el intruso dejó una cita';
  end if;

  -- 9 · `anon` no puede ejecutarla; `authenticated` sí.
  if has_function_privilege('anon', 'public.schedule_appointment(bigint,bigint,text,text,bigint,bigint,bigint[])', 'execute') then
    raise exception 'FALLÓ 9: anon puede ejecutar schedule_appointment';
  end if;
  if not has_function_privilege('authenticated', 'public.schedule_appointment(bigint,bigint,text,text,bigint,bigint,bigint[])', 'execute') then
    raise exception 'FALLÓ 9: authenticated no puede ejecutar schedule_appointment';
  end if;

  -- Limpieza: el borrado en cascada se lleva servicios, citas y líneas.
  delete from business where id in (v_biz, v_otro);
  delete from auth.users where id in (v_uid, v_uid2);
end $$;
