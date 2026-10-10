-- Regresión de P6 (odd/tasks/payments-and-receipt.md): recibo digital público.
-- Ver supabase/migrations/20261010000013_public_receipt.sql.
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (falta public_receipt).
--
-- QUÉ PRUEBA
--   1 · anon, con un token válido, recibe lo que el papel muestra (negocio, número,
--       cliente, cajero, líneas con empleada, total, pagos por vía, crédito).
--   2 · Un token desconocido devuelve null (no un error).
--   3 · El JSON NO trae costos, ganancia, teléfono de la clienta ni ids (claves exactas).
--   4 · INVARIANTE 1: el token del negocio A nunca expone datos del negocio B.
--   5 · anon no puede leer la tabla `receipt` directamente.
--   6 · Sin nombre de cajero, `cashier` es null (el cliente muestra el del negocio).
--
-- Usuarias propias: ...0009da y ...0009db. Datos 9994xx. Se borran al final.

do $$
declare
  v_uid   uuid := '00000000-0000-0000-0000-0000000009da';
  v_uid2  uuid := '00000000-0000-0000-0000-0000000009db';
  v_biz   bigint;
  v_otro  bigint;
  v_svc   bigint := 999411;
  v_svc2  bigint := 999412;
  v_emp   bigint := 999431;
  v_apt1  bigint := 999421;
  v_apt2  bigint := 999422; -- del otro negocio
  v_tok   uuid;
  v_tok2  uuid;
  v_json  jsonb;
  v_json2 jsonb;
  v_rows  integer;
  v_msg   text;
begin
  if to_regprocedure('public.public_receipt(uuid)') is null then
    raise exception 'FALLÓ 0: falta public_receipt. ¿Aplicaste la migración?';
  end if;

  delete from business where created_by in (v_uid, v_uid2);
  delete from auth.users where id in (v_uid, v_uid2);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid,  'authenticated', 'authenticated', 'prueba-da@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-db@citelis.test', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_biz := create_business('PRUEBA Recibo Público', '#e11d48', 'prueba-recibo-publico');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_otro := create_business('PRUEBA Recibo Ajeno', '#e11d48', 'prueba-recibo-ajeno');

  update business set address = 'Calle 1 #23', phone = '809-555-0101', logo_path = '999/logo.png' where id = v_biz;
  update business_member set display_name = 'Ana Cajera' where business_id = v_biz and user_id = v_uid;
  insert into employee (id, business_id, name) values (v_emp, v_biz, 'Marta');
  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price) values
    (v_svc,  v_biz,  'Cejas', 5000, 1000, null, 30, false),
    (v_svc2, v_otro, 'Uñas',  8000, 2000, null, 30, false);

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  perform schedule_appointment(v_biz, v_apt1, 'Clienta Uno', '2026-10-12T10:00', null, null, array[v_svc], null);
  perform complete_appointment(v_biz, v_apt1, 5000, 1000, 4000,
    '[{"service_id":999411,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb, '[]'::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  perform schedule_appointment(v_otro, v_apt2, 'Clienta Ajena', '2026-10-12T10:00', null, null, array[v_svc2], null);
  perform complete_appointment(v_otro, v_apt2, 8000, 2000, 6000,
    '[{"service_id":999412,"charged_price":8000,"actual_cost":2000,"profit":6000}]'::jsonb, '[]'::jsonb);

  -- Datos que NO deben salir: teléfono de la clienta. Línea con empleada. Pagos: dos
  -- en efectivo, uno histórico sin vía (null); falta 1500 de crédito.
  update appointment set client_phone = '809-777-1234' where id = v_apt1;
  update appointment_service set employee_id = v_emp, list_price = 5000, discount = 0 where appointment_id = v_apt1;
  insert into appointment_payment (business_id, appointment_id, amount, method, kind) values
    (v_biz, v_apt1, 2000, 'cash', 'charge'),
    (v_biz, v_apt1, 1000, 'cash', 'charge'),
    (v_biz, v_apt1, 500,  null,   'deposit');

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  execute 'set local role authenticated';
  select r.public_token into v_tok from issue_receipt(v_biz, v_apt1) r;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  select r.public_token into v_tok2 from issue_receipt(v_otro, v_apt2) r;
  execute 'reset role';

  -- ── Hablando como anon: sin sesión ni claims ─────────────────────────────
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';

  -- 1 · Lo que muestra el papel.
  v_json := public_receipt(v_tok);
  if v_json is null then
    raise exception 'FALLÓ 1: anon no obtuvo el recibo con un token válido';
  end if;
  if v_json #>> '{business,name}' is distinct from 'PRUEBA Recibo Público'
     or v_json #>> '{business,address}' is distinct from 'Calle 1 #23'
     or v_json #>> '{business,phone}' is distinct from '809-555-0101'
     or v_json #>> '{business,logo_path}' is distinct from '999/logo.png' then
    raise exception 'FALLÓ 1: encabezado del negocio incorrecto: %', v_json -> 'business';
  end if;
  if (v_json #>> '{receipt,number}')::int is distinct from 1 or v_json #>> '{appointment,client}' is distinct from 'Clienta Uno'
     or v_json #>> '{appointment,datetime}' is distinct from '2026-10-12T10:00' then
    raise exception 'FALLÓ 1: número, cliente o fecha incorrectos: %', v_json;
  end if;
  if v_json ->> 'cashier' is distinct from 'Ana Cajera' then
    raise exception 'FALLÓ 1: cajero incorrecto: %', coalesce(v_json ->> 'cashier', '(nulo)');
  end if;
  if jsonb_array_length(v_json -> 'lines') <> 1
     or v_json #>> '{lines,0,service_name}' is distinct from 'Cejas'
     or v_json #>> '{lines,0,employee_name}' is distinct from 'Marta'
     or (v_json #>> '{lines,0,charged_price}')::int is distinct from 5000 then
    raise exception 'FALLÓ 1: líneas incorrectas: %', v_json -> 'lines';
  end if;
  if (v_json ->> 'total')::int is distinct from 5000 then
    raise exception 'FALLÓ 1: total incorrecto: %', v_json ->> 'total';
  end if;
  -- Pagos sumados por vía: efectivo 3000 y el histórico (null) 500.
  if v_json -> 'payments' is distinct from
     '[{"method":"cash","amount":3000},{"method":null,"amount":500}]'::jsonb then
    raise exception 'FALLÓ 1: pagos por vía incorrectos: %', v_json -> 'payments';
  end if;
  if (v_json ->> 'credit')::int is distinct from 1500 then
    raise exception 'FALLÓ 1: crédito incorrecto: %', v_json ->> 'credit';
  end if;

  -- 2 · Token desconocido: null, sin error.
  if public_receipt('00000000-0000-0000-0000-000000000000') is not null then
    raise exception 'FALLÓ 2: un token desconocido devolvió datos';
  end if;

  -- 3 · Nada de costos, ganancia ni datos de la clienta: claves EXACTAS.
  if (select array_agg(k order by k) from jsonb_object_keys(v_json) k)
     is distinct from array['appointment','business','cashier','credit','lines','payments','receipt','total'] then
    raise exception 'FALLÓ 3: claves de primer nivel inesperadas: %', (select array_agg(k) from jsonb_object_keys(v_json) k);
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_json -> 'appointment') k) is distinct from array['client','datetime']
     or (select array_agg(k order by k) from jsonb_object_keys(v_json -> 'business') k) is distinct from array['address','logo_path','name','phone']
     or (select array_agg(k order by k) from jsonb_object_keys(v_json #> '{lines,0}') k)
        is distinct from array['charged_price','discount','employee_name','list_price','service_name'] then
    raise exception 'FALLÓ 3: claves anidadas inesperadas: %', v_json;
  end if;
  if v_json::text like '%809-777-1234%' or v_json::text ~* '(cost|profit|actual)' then
    raise exception 'FALLÓ 3: el recibo público filtra costos, ganancia o el teléfono de la clienta';
  end if;

  -- 4 · INVARIANTE 1: cada token solo da SU recibo.
  v_json2 := public_receipt(v_tok2);
  if v_json2 #>> '{business,name}' is distinct from 'PRUEBA Recibo Ajeno'
     or v_json2 #>> '{appointment,client}' is distinct from 'Clienta Ajena'
     or v_json2::text like '%Clienta Uno%' or v_json::text like '%Clienta Ajena%' or v_json::text like '%Uñas%' then
    raise exception 'FALLÓ 4: viola INVARIANTE 1, un token expone datos de otro negocio';
  end if;

  -- 5 · anon no lee la tabla: ni con privilegio ni por RLS.
  begin
    select count(*) into v_rows from receipt; v_msg := 'sin error: ' || v_rows;
  exception when insufficient_privilege then v_msg := 'denegado'; end;
  if v_msg is distinct from 'denegado' and v_rows <> 0 then
    raise exception 'FALLÓ 5: anon pudo leer receipt (%)', v_msg;
  end if;

  -- 6 · Sin nombre de cajero → null.
  execute 'reset role';
  update business_member set display_name = null where business_id = v_biz and user_id = v_uid;
  execute 'set local role anon';
  if public_receipt(v_tok) -> 'cashier' is distinct from 'null'::jsonb then
    raise exception 'FALLÓ 6: sin nombre de cajero esperaba null, dio %', public_receipt(v_tok) -> 'cashier';
  end if;

  -- Limpieza (siempre como propietario).
  execute 'reset role';
  delete from business where id in (v_biz, v_otro);
  delete from auth.users where id in (v_uid, v_uid2);
end $$;

select 'VERDE: las aserciones del recibo digital público pasaron' as resultado;
