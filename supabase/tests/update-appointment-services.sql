-- Regresión de `update_appointment_services`: cambiar los servicios de una cita
-- ya agendada. Ver supabase/migrations/20261010000007_update_appointment_services.sql.
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP o psql. Pégalo entero, DESPUÉS de la migración
--   (y de la 20261010000001 y la 20261010000002, que usan las pruebas 5 y 6).
--   En CI corre solo (job `sql-regression`).
--
-- PARA VER EL ROJO (recomendado antes de aplicar la migración)
--   Córrelo ANTES: debe fallar en la aserción 0 diciendo que la función no existe.
--
-- QUÉ PRUEBA
--   1 · agregar servicios a una cita PENDING: líneas reemplazadas exactamente, sin
--       dinero, y `service_id` = el primero de la lista.
--   2 · quitar servicios (queda uno) y reordenar: el principal sigue al primero.
--   3 · una cita REQUESTED (solicitud del portal) también se puede editar.
--   4 · una cita COMPLETED se rechaza y NADA cambia: ni líneas, ni dinero
--       (INVARIANTE 2). CANCELED, NO_SHOW y REJECTED también.
--   5 · un servicio de OTRO negocio: rechazado y las líneas siguen intactas
--       (INVARIANTE 1).
--   6 · repetido, lista vacía, lista null, elemento null y servicio con duración 0:
--       rechazados, con su mensaje, y las líneas siguen intactas.
--   7 · quien no es miembro del negocio no puede editar; ni siquiera una dueña de
--       OTRO negocio, ni pasando su propio negocio con la cita ajena
--       (INVARIANTE 1).
--   8 · los permisos: `anon` no puede ejecutarla; `authenticated` sí.
--   9 · no toca el dinero acordado, el abono, el estado ni la fecha.
--
-- Crea sus propios datos (ids 9998xx / 9999xx) y los borra al final.
--
-- Usa SUS PROPIAS usuarias (cada cuenta solo puede crear un negocio,
-- 20261010000005): 00000000-0000-0000-0000-0000000009f3 y ...09f4. Se borran al final.

do $$
declare
  v_uid     uuid := '00000000-0000-0000-0000-0000000009f3';
  v_uid2    uuid := '00000000-0000-0000-0000-0000000009f4';
  v_biz     bigint;
  v_otro    bigint;
  v_svc1    bigint := 999851;
  v_svc2    bigint := 999852;
  v_svc3    bigint := 999853;
  v_svc_o   bigint := 999854;
  v_svc_0   bigint := 999855;
  v_apt     bigint := 999951;
  v_apt_req bigint := 999952;
  v_apt_done bigint := 999953;
  v_apt_can bigint := 999954;
  v_apt_ns  bigint := 999955;
  v_apt_rej bigint := 999956;
  v_msg     text;
  v_row     appointment%rowtype;
  v_ids     bigint[];
  v_n       integer;
  v_sid     bigint;
  s         text;
begin
  -- 0 · La función existe.
  if to_regprocedure('public.update_appointment_services(bigint,bigint,bigint[])') is null then
    raise exception 'FALLÓ 0: update_appointment_services no existe. ¿Aplicaste la migración?';
  end if;

  -- Limpieza previa por si una corrida murió a medias.
  delete from business where created_by in (v_uid, v_uid2);
  delete from auth.users where id in (v_uid, v_uid2);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid, 'authenticated', 'authenticated', 'prueba-u1@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-u2@citelis.test', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_biz  := create_business('PRUEBA Editar servicios', '#e11d48', 'prueba-editar-servicios');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_otro := create_business('PRUEBA Editar Ajeno', '#e11d48', 'prueba-editar-ajeno');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc1,  v_biz,  'Cejas',        5000, 1000, null, 30, false),
         (v_svc2,  v_biz,  'Ondas',        4000,  500, null, 45, false),
         (v_svc3,  v_biz,  'Pestañas',     6000,  800, null, 60, false),
         (v_svc_o, v_otro, 'Ajeno',        3000,  100, null, 30, false),
         (v_svc_0, v_biz,  'Sin duración', 1000,    0, null,  0, false);

  perform schedule_appointment(v_biz, v_apt, 'Ana', '2026-10-12T10:00', 7000, 1500, array[v_svc1]);

  -- 1 · Agregar servicios: las líneas son EXACTAMENTE las nuevas, sin dinero.
  perform update_appointment_services(v_biz, v_apt, array[v_svc2, v_svc1, v_svc3]);
  select array_agg(service_id order by service_id) into v_ids from appointment_service where appointment_id = v_apt;
  if v_ids is distinct from array[v_svc1, v_svc2, v_svc3] then
    raise exception 'FALLÓ 1: las líneas quedaron %, se esperaban los tres servicios', v_ids;
  end if;
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt and business_id = v_biz
     and charged_price is null and actual_cost is null and profit is null;
  if v_n <> 3 then
    raise exception 'FALLÓ 1: se esperaban 3 líneas sin dinero y hay %', v_n;
  end if;
  select * into v_row from appointment where id = v_apt;
  if v_row.service_id is distinct from v_svc2 then
    raise exception 'FALLÓ 1: el servicio principal es %, no el primero de la lista (%)', v_row.service_id, v_svc2;
  end if;

  -- 9 · No toca lo acordado, ni el estado, ni la fecha, ni el dinero congelado.
  if v_row.quoted_price is distinct from 7000 or v_row.deposit is distinct from 1500 then
    raise exception 'FALLÓ 9: cambió el precio acordado (%) o el abono (%)', v_row.quoted_price, v_row.deposit;
  end if;
  if v_row.status <> 'PENDING' or v_row.datetime <> '2026-10-12T10:00' or v_row.client <> 'Ana' then
    raise exception 'FALLÓ 9: cambió el estado (%), la fecha (%) o la clienta (%)', v_row.status, v_row.datetime, v_row.client;
  end if;
  if v_row.charged_price is not null or v_row.actual_cost is not null or v_row.profit is not null then
    raise exception 'FALLÓ 9: la cita quedó con dinero congelado (INVARIANTE 2)';
  end if;

  -- 2 · Quitar (queda uno) y reordenar.
  perform update_appointment_services(v_biz, v_apt, array[v_svc3]);
  select array_agg(service_id) into v_ids from appointment_service where appointment_id = v_apt;
  if v_ids is distinct from array[v_svc3] then
    raise exception 'FALLÓ 2: tras quitar quedó %, se esperaba solo Pestañas', v_ids;
  end if;
  select service_id into v_sid from appointment where id = v_apt;
  if v_sid is distinct from v_svc3 then
    raise exception 'FALLÓ 2: el principal es %, no Pestañas', v_sid;
  end if;
  perform update_appointment_services(v_biz, v_apt, array[v_svc1, v_svc2]);
  perform update_appointment_services(v_biz, v_apt, array[v_svc2, v_svc1]);
  select service_id into v_sid from appointment where id = v_apt;
  if v_sid is distinct from v_svc2 then
    raise exception 'FALLÓ 2: tras reordenar el principal es %, no Ondas', v_sid;
  end if;
  select count(*) into v_n from appointment_service where appointment_id = v_apt;
  if v_n <> 2 then
    raise exception 'FALLÓ 2: se esperaban 2 líneas y hay %', v_n;
  end if;

  -- 3 · Una solicitud del portal (REQUESTED) también se edita.
  insert into appointment (id, business_id, service_id, client, datetime, status, source, requested_at)
  values (v_apt_req, v_biz, v_svc1, 'Clienta Portal', '2026-10-12T14:00', 'REQUESTED', 'SELF', now());
  insert into appointment_service (appointment_id, service_id, business_id) values (v_apt_req, v_svc1, v_biz);
  perform update_appointment_services(v_biz, v_apt_req, array[v_svc1, v_svc2]);
  select array_agg(service_id order by service_id) into v_ids from appointment_service where appointment_id = v_apt_req;
  if v_ids is distinct from array[v_svc1, v_svc2] then
    raise exception 'FALLÓ 3: las líneas de la solicitud quedaron %', v_ids;
  end if;
  select * into v_row from appointment where id = v_apt_req;
  if v_row.status <> 'REQUESTED' then
    raise exception 'FALLÓ 3: la solicitud cambió de estado a %', v_row.status;
  end if;

  -- 4 · COMPLETED: rechazada y NADA cambia (INVARIANTE 2).
  perform schedule_appointment(v_biz, v_apt_done, 'Cobrada', '2026-10-13T10:00', null, null, array[v_svc1, v_svc2]);
  perform complete_appointment(v_biz, v_apt_done, 9000, 1500, 7500,
    '[{"service_id":999851,"charged_price":5000,"actual_cost":1000,"profit":4000},
      {"service_id":999852,"charged_price":4000,"actual_cost":500,"profit":3500}]'::jsonb);
  v_msg := null;
  begin
    perform update_appointment_services(v_biz, v_apt_done, array[v_svc1, v_svc2, v_svc3]);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Esta cita ya no se puede modificar.' then
    raise exception 'FALLÓ 4: editar una cita COMPLETED dio "%"', v_msg;
  end if;
  select * into v_row from appointment where id = v_apt_done;
  if v_row.status <> 'COMPLETED' or v_row.charged_price is distinct from 9000
     or v_row.actual_cost is distinct from 1500 or v_row.profit is distinct from 7500
     or v_row.service_id is distinct from v_svc1 then
    raise exception 'FALLÓ 4: la cita completada cambió (%, %, %, %, principal %)',
      v_row.status, v_row.charged_price, v_row.actual_cost, v_row.profit, v_row.service_id;
  end if;
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt_done
     and ((service_id = v_svc1 and charged_price = 5000 and actual_cost = 1000 and profit = 4000)
       or (service_id = v_svc2 and charged_price = 4000 and actual_cost = 500 and profit = 3500));
  if v_n <> 2 then
    raise exception 'FALLÓ 4: las líneas congeladas de la cita completada cambiaron (coinciden %)', v_n;
  end if;
  select count(*) into v_n from appointment_service where appointment_id = v_apt_done;
  if v_n <> 2 then
    raise exception 'FALLÓ 4: la cita completada tiene % líneas, se esperaban 2', v_n;
  end if;

  -- 4b · CANCELED, NO_SHOW y REJECTED tampoco.
  perform schedule_appointment(v_biz, v_apt_can, 'Cancelada', '2026-10-14T10:00', null, null, array[v_svc1]);
  update appointment set status = 'CANCELED' where id = v_apt_can;
  perform schedule_appointment(v_biz, v_apt_ns, 'No llegó', '2026-10-14T11:00', null, null, array[v_svc1]);
  update appointment set status = 'NO_SHOW' where id = v_apt_ns;
  insert into appointment (id, business_id, service_id, client, datetime, status, source, requested_at)
  values (v_apt_rej, v_biz, v_svc1, 'Rechazada', '2026-10-14T12:00', 'REJECTED', 'SELF', now());
  insert into appointment_service (appointment_id, service_id, business_id) values (v_apt_rej, v_svc1, v_biz);
  foreach s in array array['999954', '999955', '999956'] loop
    v_msg := null;
    begin
      perform update_appointment_services(v_biz, s::bigint, array[v_svc1, v_svc2]);
    exception when others then v_msg := sqlerrm; end;
    if v_msg is distinct from 'Esta cita ya no se puede modificar.' then
      raise exception 'FALLÓ 4b: editar la cita % dio "%"', s, v_msg;
    end if;
    -- Sigue con su única línea original (Cejas): una sola línea, y es la de Cejas.
    select count(*) into v_n from appointment_service where appointment_id = s::bigint;
    if v_n is distinct from 1 then
      raise exception 'FALLÓ 4b: la cita % quedó con % líneas, esperaba 1', s, v_n;
    end if;
    if not exists (select 1 from appointment_service where appointment_id = s::bigint and service_id = v_svc1) then
      raise exception 'FALLÓ 4b: la línea de la cita % ya no es la original (Cejas)', s;
    end if;
  end loop;

  -- 5 · Un servicio de OTRO negocio (INVARIANTE 1): rechazado, líneas intactas.
  v_msg := null;
  begin
    perform update_appointment_services(v_biz, v_apt, array[v_svc1, v_svc_o]);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Un servicio no pertenece a tu negocio o no tiene duración.' then
    raise exception 'FALLÓ 5: un servicio ajeno dio "%"', v_msg;
  end if;
  select array_agg(service_id order by service_id) into v_ids from appointment_service where appointment_id = v_apt;
  if v_ids is distinct from array[v_svc1, v_svc2] then
    raise exception 'FALLÓ 5: tras el rechazo las líneas quedaron %', v_ids;
  end if;
  select service_id into v_sid from appointment where id = v_apt;
  if v_sid is distinct from v_svc2 then
    raise exception 'FALLÓ 5: tras el rechazo el principal cambió a %', v_sid;
  end if;

  -- 6 · Repetido, vacío, null, elemento null y duración 0.
  v_msg := null;
  begin
    perform update_appointment_services(v_biz, v_apt, array[v_svc1, v_svc1]);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Un servicio aparece repetido en la cita.' then
    raise exception 'FALLÓ 6: un servicio repetido dio "%"', v_msg;
  end if;

  v_msg := null;
  begin
    perform update_appointment_services(v_biz, v_apt, array[]::bigint[]);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Elige al menos un servicio.' then
    raise exception 'FALLÓ 6: la lista vacía dio "%"', v_msg;
  end if;

  v_msg := null;
  begin
    perform update_appointment_services(v_biz, v_apt, null);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Elige al menos un servicio.' then
    raise exception 'FALLÓ 6: la lista null dio "%"', v_msg;
  end if;

  v_msg := null;
  begin
    perform update_appointment_services(v_biz, v_apt, array[v_svc1, null]::bigint[]);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Hay un servicio vacío en la lista.' then
    raise exception 'FALLÓ 6: un elemento null dio "%"', v_msg;
  end if;

  v_msg := null;
  begin
    perform update_appointment_services(v_biz, v_apt, array[v_svc1, v_svc_0]);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Un servicio no pertenece a tu negocio o no tiene duración.' then
    raise exception 'FALLÓ 6: un servicio con duración 0 dio "%"', v_msg;
  end if;

  select array_agg(service_id order by service_id) into v_ids from appointment_service where appointment_id = v_apt;
  if v_ids is distinct from array[v_svc1, v_svc2] then
    raise exception 'FALLÓ 6: tras los rechazos las líneas quedaron %', v_ids;
  end if;

  -- Una cita que no existe en el negocio.
  v_msg := null;
  begin
    perform update_appointment_services(v_biz, 999999999, array[v_svc1]);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'No encontramos esa cita.' then
    raise exception 'FALLÓ 6: una cita inexistente dio "%"', v_msg;
  end if;

  -- 7 · Quien no es miembro NO puede editar (INVARIANTE 1).
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  v_msg := null;
  begin
    perform update_appointment_services(v_biz, v_apt, array[v_svc1]);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Ese negocio no es tuyo.' then
    raise exception 'FALLÓ 7: un desconocido dio "%"', v_msg;
  end if;

  -- 7b · La dueña de OTRO negocio: ni con el negocio ajeno, ni con el suyo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_msg := null;
  begin
    perform update_appointment_services(v_biz, v_apt, array[v_svc1]);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Ese negocio no es tuyo.' then
    raise exception 'FALLÓ 7b: una dueña ajena dio "%" con el negocio de otra', v_msg;
  end if;
  v_msg := null;
  begin
    perform update_appointment_services(v_otro, v_apt, array[v_svc_o]);
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'No encontramos esa cita.' then
    raise exception 'FALLÓ 7b: pasar su negocio con la cita ajena dio "%"', v_msg;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  select array_agg(service_id order by service_id) into v_ids from appointment_service where appointment_id = v_apt;
  if v_ids is distinct from array[v_svc1, v_svc2] then
    raise exception 'FALLÓ 7: tras los intentos ajenos las líneas quedaron %', v_ids;
  end if;

  -- 8 · `anon` no puede ejecutarla; `authenticated` sí.
  if has_function_privilege('anon', 'public.update_appointment_services(bigint,bigint,bigint[])', 'execute') then
    raise exception 'FALLÓ 8: anon puede ejecutar update_appointment_services';
  end if;
  if not has_function_privilege('authenticated', 'public.update_appointment_services(bigint,bigint,bigint[])', 'execute') then
    raise exception 'FALLÓ 8: authenticated no puede ejecutar update_appointment_services';
  end if;

  -- Limpieza: el borrado en cascada se lleva servicios, citas y líneas.
  delete from business where id in (v_biz, v_otro);
  delete from auth.users where id in (v_uid, v_uid2);
end $$;
