-- Regresión de T6b: `complete_appointment` congela la cita y sus líneas juntas.
-- Ver supabase/migrations/20261010000001_complete_appointment.sql.
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP o psql. Pégalo entero, DESPUÉS de la migración.
--
-- PARA VER EL ROJO (recomendado antes de aplicar la migración)
--   Córrelo ANTES: debe fallar en la aserción 0 diciendo que la función no existe.
--
-- QUÉ PRUEBA
--   1 · una cita de UN servicio sin filas en appointment_service: se completa y
--       la línea se crea (es lo que agenda hoy la dueña).
--   2 · una cita de DOS servicios: se completa y las dos líneas llevan su dinero.
--   3 · llamar otra vez sobre una COMPLETED se rechaza y NO cambia sus números
--       (INVARIANTE 2).
--   4 · una cita CANCELED no se puede completar (INVARIANTE 7).
--   5 · servicios distintos a los de la cita: rechazado, y la cita sigue PENDING.
--   6 · líneas que no suman el total: rechazado, y la cita sigue PENDING.
--   7 · una línea con ganancia ≠ precio − costo: rechazado.
--   8 · quien no es miembro del negocio no puede completar (INVARIANTE 1).
--   9 · pedir la cita de OTRO negocio con mi propio negocio: no la encuentra.
--  10 · los permisos: `anon` no puede ejecutarla.
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
  v_svc1    bigint := 999811;
  v_svc2    bigint := 999812;
  v_svc_o   bigint := 999813;
  v_apt1    bigint := 999911;
  v_apt2    bigint := 999912;
  v_apt_c   bigint := 999913;
  v_apt_o   bigint := 999914;
  v_apt_i   bigint := 999915;
  v_ok      boolean;
  v_row     appointment%rowtype;
  v_n       integer;
  v_chg     bigint;
begin
  -- 0 · La función existe.
  if to_regprocedure('public.complete_appointment(bigint,bigint,bigint,bigint,bigint,jsonb)') is null then
    raise exception 'FALLÓ 0: complete_appointment no existe. ¿Aplicaste la migración?';
  end if;

  -- Usuarias propias de la prueba (ver cabecera); limpieza previa por si una corrida murió a medias.
  v_uid := '00000000-0000-0000-0000-0000000009e1';
  v_uid2 := '00000000-0000-0000-0000-0000000009e2';
  delete from business where created_by in (v_uid, v_uid2);
  delete from auth.users where id in (v_uid, v_uid2);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid, 'authenticated', 'authenticated', 'prueba-e1@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-e2@citelis.test', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  v_biz  := create_business('PRUEBA Cobro', '#e11d48', 'prueba-cobro');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_otro := create_business('PRUEBA Cobro Ajeno', '#e11d48', 'prueba-cobro-ajeno');
  -- Como antes de la regla de un negocio por cuenta: la dueña también es miembro del segundo.
  insert into business_member (user_id, business_id) values (v_uid, v_otro);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc1,  v_biz,  'Cejas',  5000, 1000, null, 30, false),
         (v_svc2,  v_biz,  'Ondas',  4000,  500, null, 45, false),
         (v_svc_o, v_otro, 'Ajeno',  3000,  100, null, 30, false);

  insert into appointment (id, business_id, service_id, client, datetime, status,
                           quoted_price, deposit, charged_price, actual_cost, profit)
  values (v_apt1,  v_biz,  v_svc1,  'Ana',   '2026-10-12T10:00', 'PENDING',  null, null, null, null, null),
         (v_apt2,  v_biz,  v_svc1,  'Rosa',  '2026-10-12T11:00', 'PENDING',  null, null, null, null, null),
         (v_apt_c, v_biz,  v_svc1,  'Cancel','2026-10-12T12:00', 'CANCELED', null, null, null, null, null),
         (v_apt_o, v_otro, v_svc_o, 'Ajena', '2026-10-12T10:00', 'PENDING',  null, null, null, null, null),
         (v_apt_i, v_biz,  v_svc1,  'Intruso','2026-10-12T13:00', 'PENDING', null, null, null, null, null);

  -- La cita 2 lleva DOS servicios (filas en appointment_service).
  insert into appointment_service (appointment_id, service_id, business_id)
  values (v_apt2, v_svc1, v_biz), (v_apt2, v_svc2, v_biz);

  -- 1 · Un servicio y SIN filas previas: se completa y nace su línea.
  perform complete_appointment(v_biz, v_apt1, 5000, 1000, 4000,
    '[{"service_id":999811,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb);
  select * into v_row from appointment where id = v_apt1;
  if v_row.status <> 'COMPLETED' or v_row.charged_price <> 5000
     or v_row.actual_cost <> 1000 or v_row.profit <> 4000 then
    raise exception 'FALLÓ 1: la cita quedó %, % / % / %', v_row.status, v_row.charged_price, v_row.actual_cost, v_row.profit;
  end if;
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt1 and service_id = v_svc1
     and charged_price = 5000 and actual_cost = 1000 and profit = 4000;
  if v_n <> 1 then
    raise exception 'FALLÓ 1: la línea de la cita de un servicio no se creó con su dinero';
  end if;

  -- 5 · (antes de completar la 2) Servicios distintos a los de la cita: rechazado.
  v_ok := false;
  begin
    perform complete_appointment(v_biz, v_apt2, 5000, 1000, 4000,
      '[{"service_id":999811,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 5: se aceptó completar una cita de dos servicios con la línea de uno solo';
  end if;
  select * into v_row from appointment where id = v_apt2;
  if v_row.status <> 'PENDING' or v_row.charged_price is not null then
    raise exception 'FALLÓ 5: el rechazo dejó la cita a medias (%, %)', v_row.status, v_row.charged_price;
  end if;

  -- 6 · Líneas que no suman el total: rechazado y nada cambia.
  v_ok := false;
  begin
    perform complete_appointment(v_biz, v_apt2, 9000, 1500, 7500,
      '[{"service_id":999811,"charged_price":5000,"actual_cost":1000,"profit":4000},
        {"service_id":999812,"charged_price":3000,"actual_cost":500,"profit":2500}]'::jsonb);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 6: se aceptaron líneas que suman 8000 para un total de 9000';
  end if;
  select * into v_row from appointment where id = v_apt2;
  if v_row.status <> 'PENDING' then
    raise exception 'FALLÓ 6: el rechazo cambió el estado a %', v_row.status;
  end if;

  -- 7 · Una línea con la ganancia mal derivada: rechazado.
  v_ok := false;
  begin
    perform complete_appointment(v_biz, v_apt2, 9000, 1500, 7500,
      '[{"service_id":999811,"charged_price":5000,"actual_cost":1000,"profit":3000},
        {"service_id":999812,"charged_price":4000,"actual_cost":500,"profit":4500}]'::jsonb);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 7: se aceptó una línea cuya ganancia no es precio menos costo';
  end if;

  -- 2 · Dos servicios: se completa y cada línea lleva su dinero.
  perform complete_appointment(v_biz, v_apt2, 9000, 1500, 7500,
    '[{"service_id":999811,"charged_price":5000,"actual_cost":1000,"profit":4000},
      {"service_id":999812,"charged_price":4000,"actual_cost":500,"profit":3500}]'::jsonb);
  select * into v_row from appointment where id = v_apt2;
  if v_row.status <> 'COMPLETED' or v_row.charged_price <> 9000 or v_row.profit <> 7500 then
    raise exception 'FALLÓ 2: la cita de dos servicios quedó %, %, %', v_row.status, v_row.charged_price, v_row.profit;
  end if;
  select sum(charged_price) into v_chg from appointment_service where appointment_id = v_apt2;
  if v_chg is distinct from 9000 then
    raise exception 'FALLÓ 2: las líneas suman % y la cita cobró 9000', v_chg;
  end if;
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt2 and service_id = v_svc2 and charged_price = 4000 and profit = 3500;
  if v_n <> 1 then
    raise exception 'FALLÓ 2: la línea de Ondas no quedó con su dinero';
  end if;

  -- 3 · Llamar otra vez sobre una COMPLETED: rechazado y los números NO cambian.
  v_ok := false;
  begin
    perform complete_appointment(v_biz, v_apt2, 100, 0, 100,
      '[{"service_id":999811,"charged_price":50,"actual_cost":0,"profit":50},
        {"service_id":999812,"charged_price":50,"actual_cost":0,"profit":50}]'::jsonb);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 3: se pudo volver a completar una cita COMPLETED (historia reescrita)';
  end if;
  select * into v_row from appointment where id = v_apt2;
  select sum(charged_price) into v_chg from appointment_service where appointment_id = v_apt2;
  if v_row.charged_price <> 9000 or v_row.profit <> 7500 or v_chg <> 9000 then
    raise exception 'FALLÓ 3: los números de una cita COMPLETED cambiaron (%, %, líneas %)', v_row.charged_price, v_row.profit, v_chg;
  end if;

  -- 4 · Una CANCELED no se completa.
  v_ok := false;
  begin
    perform complete_appointment(v_biz, v_apt_c, 5000, 1000, 4000,
      '[{"service_id":999811,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 4: se completó una cita CANCELED';
  end if;

  -- 9 · La cita de OTRO negocio, pedida con mi negocio: no existe para mí.
  v_ok := false;
  begin
    perform complete_appointment(v_biz, v_apt_o, 3000, 100, 2900,
      '[{"service_id":999813,"charged_price":3000,"actual_cost":100,"profit":2900}]'::jsonb);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 9: se completó la cita de otro negocio pasando el mío';
  end if;
  select * into v_row from appointment where id = v_apt_o;
  if v_row.status <> 'PENDING' then
    raise exception 'FALLÓ 9: la cita ajena cambió a %', v_row.status;
  end if;

  -- 8 · Quien no es miembro NO puede completar, ni siquiera la cita correcta.
  --     Se impersona a un usuario cualquiera que no pertenece a ningún negocio.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  v_ok := false;
  begin
    perform complete_appointment(v_biz, v_apt_i, 5000, 1000, 4000,
      '[{"service_id":999811,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb);
  exception when others then v_ok := true; end;
  if not v_ok then
    raise exception 'FALLÓ 8: un usuario que no es miembro completó una cita del negocio';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  select * into v_row from appointment where id = v_apt_i;
  if v_row.status <> 'PENDING' then
    raise exception 'FALLÓ 8: el intruso dejó la cita en %', v_row.status;
  end if;

  -- 10 · `anon` no puede ejecutarla; `authenticated` sí.
  if has_function_privilege('anon', 'public.complete_appointment(bigint,bigint,bigint,bigint,bigint,jsonb)', 'execute') then
    raise exception 'FALLÓ 10: anon puede ejecutar complete_appointment';
  end if;
  if not has_function_privilege('authenticated', 'public.complete_appointment(bigint,bigint,bigint,bigint,bigint,jsonb)', 'execute') then
    raise exception 'FALLÓ 10: authenticated no puede ejecutar complete_appointment';
  end if;

  -- Limpieza: el borrado en cascada se lleva servicios, citas y líneas.
  delete from business where id in (v_biz, v_otro);
  delete from auth.users where id in (v_uid, v_uid2);
end $$;
