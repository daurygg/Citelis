-- Regresión de P5 (odd/tasks/payments-and-receipt.md): numeración y emisión del recibo.
-- Ver supabase/migrations/20261010000012_receipts.sql.
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (falta issue_receipt).
--
-- QUÉ PRUEBA
--   1 · Emitir sobre una cita COMPLETED numera 1, 2 en orden dentro del negocio.
--   2 · Es idempotente: repetir devuelve el mismo número, fecha y token, y no gasta número.
--   3 · Una cita que no está COMPLETED se rechaza (mensaje exacto).
--   4 · INVARIANTE 1: otro negocio no puede emitir ni ver el recibo ajeno.
--   5 · La numeración es independiente por negocio (el otro también arranca en 1).
--   6 · El token público es único y distinto del número.
--   7 · Los clientes no pueden insertar/actualizar/borrar en `receipt` ni leer el contador.
--
-- Usuarias propias: ...0009ca y ...0009cb. Datos 9999xx. Se borran al final.

do $$
declare
  v_uid   uuid := '00000000-0000-0000-0000-0000000009ca';
  v_uid2  uuid := '00000000-0000-0000-0000-0000000009cb';
  v_biz   bigint;
  v_otro  bigint;
  v_svc   bigint := 999911;
  v_svc2  bigint := 999912;
  v_apt1  bigint := 999921;
  v_apt2  bigint := 999922;
  v_apt3  bigint := 999923; -- queda PENDING
  v_apt4  bigint := 999924; -- del otro negocio
  v_n     integer;
  v_at    timestamptz;
  v_tok   uuid;
  v_n2    integer;
  v_at2   timestamptz;
  v_tok2  uuid;
  v_rows  integer;
  v_msg   text;
begin
  if to_regprocedure('public.issue_receipt(bigint,bigint)') is null then
    raise exception 'FALLÓ 0: falta issue_receipt. ¿Aplicaste la migración?';
  end if;

  delete from business where created_by in (v_uid, v_uid2);
  delete from auth.users where id in (v_uid, v_uid2);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid,  'authenticated', 'authenticated', 'prueba-ca@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-cb@citelis.test', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_biz := create_business('PRUEBA Numeración', '#e11d48', 'prueba-numeracion');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_otro := create_business('PRUEBA Numeración Ajena', '#e11d48', 'prueba-numeracion-ajena');

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price) values
    (v_svc,  v_biz,  'Cejas', 5000, 1000, null, 30, false),
    (v_svc2, v_otro, 'Uñas',  8000, 2000, null, 30, false);

  -- Citas: tres del negocio propio (dos se cobran) y una del ajeno (cobrada).
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  perform schedule_appointment(v_biz, v_apt1, 'Clienta Uno',  '2026-10-12T10:00', null, null, array[v_svc], null);
  perform schedule_appointment(v_biz, v_apt2, 'Clienta Dos',  '2026-10-12T11:00', null, null, array[v_svc], null);
  perform schedule_appointment(v_biz, v_apt3, 'Clienta Tres', '2026-10-12T12:00', null, null, array[v_svc], null);
  perform complete_appointment(v_biz, v_apt1, 5000, 1000, 4000,
    '[{"service_id":999911,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb, '[]'::jsonb);
  perform complete_appointment(v_biz, v_apt2, 5000, 1000, 4000,
    '[{"service_id":999911,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb, '[]'::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  perform schedule_appointment(v_otro, v_apt4, 'Clienta Ajena', '2026-10-12T10:00', null, null, array[v_svc2], null);
  perform complete_appointment(v_otro, v_apt4, 8000, 2000, 6000,
    '[{"service_id":999912,"charged_price":8000,"actual_cost":2000,"profit":6000}]'::jsonb, '[]'::jsonb);

  -- ── Hablando como authenticated (sin esto la RLS no se evalúa) ───────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  execute 'set local role authenticated';

  -- 1 · Numeración secuencial por negocio, en orden de emisión (no de cita).
  select r.number, r.issued_at, r.public_token into v_n2, v_at2, v_tok2 from issue_receipt(v_biz, v_apt2) r;
  if v_n2 is distinct from 1 then
    raise exception 'FALLÓ 1: la primera emisión del negocio dio el número %, esperaba 1', coalesce(v_n2::text, '(nulo)');
  end if;
  select r.number, r.issued_at, r.public_token into v_n, v_at, v_tok from issue_receipt(v_biz, v_apt1) r;
  if v_n is distinct from 2 then
    raise exception 'FALLÓ 1: la segunda emisión dio el número %, esperaba 2', coalesce(v_n::text, '(nulo)');
  end if;

  -- 2 · Idempotente: mismo número, misma fecha, mismo token; y no se gasta número.
  select r.number, r.issued_at, r.public_token into v_n, v_at2, v_tok2 from issue_receipt(v_biz, v_apt1) r;
  if v_n is distinct from 2 or v_at2 is distinct from v_at or v_tok2 is distinct from v_tok then
    raise exception 'FALLÓ 2: repetir la emisión cambió número, fecha o token';
  end if;
  execute 'reset role';
  if (select last_number from receipt_counter where business_id = v_biz) is distinct from 2 then
    raise exception 'FALLÓ 2: repetir la emisión gastó un número del contador';
  end if;
  if (select count(*) from receipt where business_id = v_biz) <> 2 then
    raise exception 'FALLÓ 2: hay un número de recibos distinto de 2';
  end if;
  execute 'set local role authenticated';

  -- 3 · Una cita que no está COMPLETED no tiene recibo.
  begin
    perform * from issue_receipt(v_biz, v_apt3); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Solo las citas completadas tienen recibo.' then
    raise exception 'FALLÓ 3: emitir sobre una cita pendiente dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform * from issue_receipt(v_biz, 999999999); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Esa cita no es de tu negocio.' then
    raise exception 'FALLÓ 3: emitir sobre una cita inexistente dio "%"', coalesce(v_msg, 'éxito');
  end if;

  -- 4 · INVARIANTE 1: el negocio ajeno no se toca ni se ve.
  begin
    perform * from issue_receipt(v_otro, v_apt4); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Ese negocio no es tuyo.' then
    raise exception 'FALLÓ 4: viola INVARIANTE 1, emitir en el negocio ajeno dio "%"', coalesce(v_msg, 'éxito');
  end if;
  -- Un negocio propio con la cita de otro: tampoco.
  begin
    perform * from issue_receipt(v_biz, v_apt4); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Esa cita no es de tu negocio.' then
    raise exception 'FALLÓ 4: viola INVARIANTE 1, emitir la cita ajena en mi negocio dio "%"', coalesce(v_msg, 'éxito');
  end if;

  -- 5 · La otra dueña emite el suyo: arranca en 1, independiente. Y no ve los míos.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  select r.number into v_n2 from issue_receipt(v_otro, v_apt4) r;
  if v_n2 is distinct from 1 then
    raise exception 'FALLÓ 5: la numeración del otro negocio dio %, esperaba 1 (independiente)', coalesce(v_n2::text, '(nulo)');
  end if;
  select count(*) into v_rows from receipt where business_id = v_biz;
  if v_rows <> 0 then
    raise exception 'FALLÓ 4: viola INVARIANTE 1, la otra dueña ve % recibo(s) ajeno(s)', v_rows;
  end if;
  select count(*) into v_rows from receipt;
  if v_rows <> 1 then
    raise exception 'FALLÓ 4: la otra dueña ve % recibos, esperaba solo el suyo', v_rows;
  end if;

  -- 6 · Token único y distinto del número.
  execute 'reset role';
  if (select count(distinct public_token) from receipt where business_id in (v_biz, v_otro)) <> 3 then
    raise exception 'FALLÓ 6: los tokens públicos no son únicos';
  end if;
  if exists (select 1 from receipt where business_id in (v_biz, v_otro) and public_token::text = number::text) then
    raise exception 'FALLÓ 6: un token público coincide con el número';
  end if;

  -- 7 · Los clientes no escriben en `receipt` ni leen el contador.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  execute 'set local role authenticated';
  begin
    insert into receipt (business_id, appointment_id, number) values (v_biz, v_apt3, 99); v_msg := null;
  exception when insufficient_privilege then v_msg := 'denegado'; end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: un cliente pudo insertar en receipt';
  end if;
  begin
    update receipt set number = 77 where business_id = v_biz; v_msg := null;
  exception when insufficient_privilege then v_msg := 'denegado'; end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: un cliente pudo actualizar receipt';
  end if;
  begin
    delete from receipt where business_id = v_biz; v_msg := null;
  exception when insufficient_privilege then v_msg := 'denegado'; end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: un cliente pudo borrar de receipt';
  end if;
  begin
    perform 1 from receipt_counter; v_msg := null;
  exception when insufficient_privilege then v_msg := 'denegado'; end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: un cliente pudo leer receipt_counter';
  end if;
  -- anon no ejecuta la RPC.
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform * from issue_receipt(v_biz, v_apt1); v_msg := null;
  exception when insufficient_privilege then v_msg := 'denegado'; end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: anon pudo ejecutar issue_receipt';
  end if;

  -- Limpieza (siempre como propietario).
  execute 'reset role';
  delete from business where id in (v_biz, v_otro);
  delete from auth.users where id in (v_uid, v_uid2);
end $$;

select 'VERDE: las aserciones de numeración del recibo pasaron' as resultado;
