-- Regresión de S4 (odd/tasks/saas-subscriptions.md): las RPC del administrador.
-- Ver supabase/migrations/20261012000003_subscription_admin.sql
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (falta admin_list_businesses).
--
-- QUÉ PRUEBA
--   1 · Quien NO es administrador no puede llamar a ninguna de las tres: recibe el error
--       "No autorizado" y no cambia nada. anon ni siquiera puede ejecutarlas.
--   2 · El administrador lista los negocios con el estado correcto, el slug y el último
--       pago (nulo mientras no hay pagos).
--   3 · Registrar un pago mueve un negocio BLOQUEADO y uno en GRACIA a ACTIVO, inserta
--       la fila (recorded_by = el administrador) y mueve paid_until; la lista lo refleja.
--   4 · Se rechaza un monto <= 0 o nulo, una fecha que no sea posterior a la actual (no
--       se acorta ni se repite), una vía inválida y un negocio que no existe; y lo
--       rechazado no deja pagos ni mueve paid_until (atomicidad).
--   5 · admin_set_exempt: quitar la exención deja el estado que toca por las fechas;
--       ponerla lo vuelve EXENTO. Negocio inexistente: error.
--   6 · Los pagos siguen append-only: ni la API (sin privilegios) ni postgres (trigger)
--       los editan o borran.
--   7 · Endurecimiento: `subscription_status` y `business_operational` ya no las ejecuta
--       `authenticated`, y aun así la RLS de la dueña sigue funcionando (is_member las
--       llama como security definer).
--
-- Usuarias propias: ...0009d1 (administradora) a ...0009d3. Negocios "PRUEBA Admin ...",
-- ids 9997xx. Se borran al final.

do $$
declare
  v_admin  uuid   := '00000000-0000-0000-0000-0000000009d1';
  v_owner  uuid   := '00000000-0000-0000-0000-0000000009d2';
  v_other  uuid   := '00000000-0000-0000-0000-0000000009d3';
  v_blk    bigint := 999701;  -- BLOQUEADO
  v_grc    bigint := 999702;  -- GRACIA
  v_tri    bigint := 999703;  -- PRUEBA (de la dueña normal, con portal y slug)
  v_exe    bigint := 999704;  -- EXENTO
  v_none   bigint := 999799;  -- no existe
  v_until  timestamptz;
  v_until2 timestamptz;
  v_msg    text;
  v_n      integer;
  v_after  integer;
  v_id     bigint;
  v_text   text;
  v_row    record;
  v_pay    record;
  v_paid   timestamptz;
begin
  if to_regprocedure('public.admin_list_businesses()') is null then
    raise exception 'FALLÓ 0: falta admin_list_businesses. ¿Aplicaste la migración?';
  end if;
  if to_regprocedure('public.admin_register_payment(bigint,bigint,timestamptz,text,text)') is null then
    raise exception 'FALLÓ 0: falta admin_register_payment. ¿Aplicaste la migración?';
  end if;
  if to_regprocedure('public.admin_set_exempt(bigint,boolean)') is null then
    raise exception 'FALLÓ 0: falta admin_set_exempt. ¿Aplicaste la migración?';
  end if;

  -- Limpieza previa por si una corrida anterior murió a medias.
  delete from business where name like 'PRUEBA Admin%';
  delete from platform_admin where user_id in (v_admin, v_owner, v_other);
  delete from auth.users where id in (v_admin, v_owner, v_other);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_admin, 'authenticated', 'authenticated', 'prueba-d1@citelis.test', now(), now()),
    (v_owner, 'authenticated', 'authenticated', 'prueba-d2@citelis.test', now(), now()),
    (v_other, 'authenticated', 'authenticated', 'prueba-d3@citelis.test', now(), now());
  insert into platform_admin (user_id) values (v_admin);

  -- Fixtures (como postgres): un negocio por estado.
  insert into business (id, name, plan) values
    (v_blk, 'PRUEBA Admin bloqueado', 'mvp'),
    (v_grc, 'PRUEBA Admin gracia',    'mvp'),
    (v_tri, 'PRUEBA Admin prueba',    'mvp'),
    (v_exe, 'PRUEBA Admin exento',    'mvp');
  insert into business_subscription (business_id, trial_ends_at, paid_until, exempt) values
    (v_blk, now() - interval '30 days', null, false),
    (v_grc, now() - interval '3 days',  null, false),
    (v_tri, now() + interval '5 days',  null, false),
    (v_exe, now() - interval '90 days', null, true);
  insert into business_member (user_id, business_id) values (v_owner, v_tri);
  insert into booking_policy (business_id, public_slug, enabled, slot_step_min, buffer_min,
                              min_notice_hours, max_horizon_days, max_requests_per_phone_per_day, timezone)
  values (v_tri, 'prueba-admin-prueba', true, 30, 0, 2, 30, 50, 'America/Santo_Domingo');

  if subscription_status(v_blk) is distinct from 'BLOCKED'
     or subscription_status(v_grc) is distinct from 'GRACE'
     or subscription_status(v_tri) is distinct from 'TRIAL'
     or subscription_status(v_exe) is distinct from 'EXEMPT' then
    raise exception 'FALLÓ 0: los fixtures no quedaron en los estados esperados';
  end if;

  v_until := now() + interval '30 days';

  -- ── 1 · Quien no es administrador no puede llamar a ninguna ──────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  execute 'set local role authenticated';

  v_msg := null;
  begin
    perform * from admin_list_businesses();
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'No autorizado' then
    raise exception 'FALLÓ 1: admin_list_businesses debe dar "No autorizado" a una dueña, llegó: %', coalesce(v_msg, '(sin error)');
  end if;

  v_msg := null;
  begin
    perform admin_register_payment(v_tri, 150000, v_until, 'TRANSFER', 'intento');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'No autorizado' then
    raise exception 'FALLÓ 1: admin_register_payment debe dar "No autorizado" a una dueña, llegó: %', coalesce(v_msg, '(sin error)');
  end if;

  v_msg := null;
  begin
    perform admin_set_exempt(v_tri, true);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'No autorizado' then
    raise exception 'FALLÓ 1: admin_set_exempt debe dar "No autorizado" a una dueña, llegó: %', coalesce(v_msg, '(sin error)');
  end if;
  execute 'reset role';

  -- Y no cambió nada.
  select count(*) into v_n from subscription_payment where business_id = v_tri;
  if v_n <> 0 then
    raise exception 'FALLÓ 1: el intento de una dueña dejó % pagos', v_n;
  end if;
  select s.paid_until into v_paid from business_subscription s where s.business_id = v_tri;
  if v_paid is not null or subscription_status(v_tri) is distinct from 'TRIAL' then
    raise exception 'FALLÓ 1: el intento de una dueña cambió la suscripción';
  end if;

  -- Una usuaria sin negocio tampoco.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  execute 'set local role authenticated';
  v_msg := null;
  begin
    perform admin_set_exempt(v_blk, true);
  exception when others then v_msg := sqlerrm;
  end;
  execute 'reset role';
  if v_msg is distinct from 'No autorizado' then
    raise exception 'FALLÓ 1: una usuaria sin negocio pudo llegar más allá del control, llegó: %', coalesce(v_msg, '(sin error)');
  end if;

  -- anon no puede ni ejecutarlas.
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  v_msg := null;
  begin
    perform * from admin_list_businesses();
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 1: anon pudo ejecutar admin_list_businesses';
  end if;
  v_msg := null;
  begin
    perform admin_register_payment(v_tri, 1, v_until, 'CASH', null);
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 1: anon pudo ejecutar admin_register_payment';
  end if;
  v_msg := null;
  begin
    perform admin_set_exempt(v_tri, true);
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 1: anon pudo ejecutar admin_set_exempt';
  end if;
  execute 'reset role';

  -- ── 2 · El administrador lista con el estado correcto ────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from admin_list_businesses() l where l.name like 'PRUEBA Admin%';
  if v_n <> 4 then
    raise exception 'FALLÓ 2: el administrador debía ver los 4 negocios de prueba, vio %', v_n;
  end if;

  for v_row in
    select * from (values
      (v_blk, 'BLOCKED'), (v_grc, 'GRACE'), (v_tri, 'TRIAL'), (v_exe, 'EXEMPT')
    ) as t(id, expected)
  loop
    select l.status into v_text from admin_list_businesses() l where l.business_id = v_row.id;
    if v_text is distinct from v_row.expected then
      raise exception 'FALLÓ 2: el negocio % debía listarse %, salió %', v_row.id, v_row.expected, v_text;
    end if;
  end loop;

  select * into v_pay from admin_list_businesses() l where l.business_id = v_tri;
  if v_pay.slug is distinct from 'prueba-admin-prueba' then
    raise exception 'FALLÓ 2: el slug debía listarse, salió %', v_pay.slug;
  end if;
  if v_pay.plan is distinct from 'standard' or v_pay.exempt is distinct from false
     or v_pay.trial_ends_at is null or v_pay.paid_until is not null then
    raise exception 'FALLÓ 2: los campos de suscripción de la fila no cuadran';
  end if;
  if v_pay.last_payment_at is not null or v_pay.last_payment_cents is not null then
    raise exception 'FALLÓ 2: sin pagos, el último pago debe ser nulo';
  end if;
  select l.slug into v_text from admin_list_businesses() l where l.business_id = v_blk;
  if v_text is not null then
    raise exception 'FALLÓ 2: un negocio sin portal debe salir con slug nulo';
  end if;
  -- Una fila por negocio: sin duplicados.
  select count(*) - count(distinct l.business_id) into v_n from admin_list_businesses() l;
  if v_n <> 0 then
    raise exception 'FALLÓ 2: la lista tiene negocios repetidos';
  end if;

  -- ── 3 · Registrar un pago: BLOQUEADO y GRACIA pasan a ACTIVO ─────────────
  v_id := admin_register_payment(v_blk, 150000, v_until, 'TRANSFER', '  Transferencia de octubre  ');
  v_until2 := now() + interval '15 days';
  perform admin_register_payment(v_grc, 80000, v_until2, 'CASH', null);
  execute 'reset role';

  if subscription_status(v_blk) is distinct from 'ACTIVE' then
    raise exception 'FALLÓ 3: el negocio BLOQUEADO debía quedar ACTIVO, quedó %', subscription_status(v_blk);
  end if;
  if subscription_status(v_grc) is distinct from 'ACTIVE' then
    raise exception 'FALLÓ 3: el negocio en GRACIA debía quedar ACTIVO, quedó %', subscription_status(v_grc);
  end if;

  select * into v_pay from subscription_payment p where p.id = v_id;
  if v_pay.business_id is distinct from v_blk or v_pay.amount_cents is distinct from 150000
     or v_pay.paid_until is distinct from v_until or v_pay.method is distinct from 'TRANSFER'
     or v_pay.note is distinct from 'Transferencia de octubre'
     or v_pay.recorded_by is distinct from v_admin then
    raise exception 'FALLÓ 3: la fila del pago no cuadra (negocio %, monto %, vía %, nota %, registró %)',
      v_pay.business_id, v_pay.amount_cents, v_pay.method, v_pay.note, v_pay.recorded_by;
  end if;
  select s.paid_until into v_paid from business_subscription s where s.business_id = v_blk;
  if v_paid is distinct from v_until then
    raise exception 'FALLÓ 3: paid_until debía moverse a %, quedó %', v_until, v_paid;
  end if;
  select count(*) into v_n from subscription_payment where business_id in (v_blk, v_grc);
  if v_n <> 2 then
    raise exception 'FALLÓ 3: debía haber 2 pagos, hay %', v_n;
  end if;
  -- La nota vacía se guarda nula.
  if (select p.note from subscription_payment p where p.business_id = v_grc) is not null then
    raise exception 'FALLÓ 3: una nota vacía debía guardarse nula';
  end if;

  -- La lista refleja el último pago.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  execute 'set local role authenticated';
  select * into v_pay from admin_list_businesses() l where l.business_id = v_blk;
  if v_pay.status is distinct from 'ACTIVE' or v_pay.last_payment_cents is distinct from 150000
     or v_pay.last_payment_at is null or v_pay.paid_until is distinct from v_until then
    raise exception 'FALLÓ 3: la lista no refleja el pago (estado %, monto %)', v_pay.status, v_pay.last_payment_cents;
  end if;

  -- Un segundo pago POSTERIOR extiende; la lista muestra el más reciente.
  perform admin_register_payment(v_blk, 150000, v_until + interval '30 days', 'CARD', 'Segundo mes');
  select * into v_pay from admin_list_businesses() l where l.business_id = v_blk;
  if v_pay.paid_until is distinct from v_until + interval '30 days' then
    raise exception 'FALLÓ 3: el segundo pago debía extender paid_until, quedó %', v_pay.paid_until;
  end if;
  execute 'reset role';
  select count(*) into v_n from subscription_payment where business_id = v_blk;
  if v_n <> 2 then
    raise exception 'FALLÓ 3: el negocio debía tener 2 pagos (append-only), tiene %', v_n;
  end if;

  -- ── 4 · Rechazos, y lo rechazado no deja rastro ──────────────────────────
  select count(*) into v_n from subscription_payment;
  select s.paid_until into v_paid from business_subscription s where s.business_id = v_blk;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  execute 'set local role authenticated';

  for v_row in
    select * from (values
      ('monto cero',          v_blk,  0::bigint,     v_paid + interval '60 days', 'CASH',     'monto'),
      ('monto negativo',      v_blk,  (-500)::bigint, v_paid + interval '60 days', 'CASH',     'monto'),
      ('monto nulo',          v_blk,  null::bigint,  v_paid + interval '60 days', 'CASH',     'monto'),
      ('fecha más corta',     v_blk,  100::bigint,   v_paid - interval '1 day',   'CASH',     'posterior'),
      ('misma fecha',         v_blk,  100::bigint,   v_paid,                      'CASH',     'posterior'),
      ('fecha nula',          v_blk,  100::bigint,   null::timestamptz,           'CASH',     'fecha'),
      ('vía inválida',        v_blk,  100::bigint,   v_paid + interval '60 days', 'BITCOIN',  'Vía'),
      ('vía nula',            v_blk,  100::bigint,   v_paid + interval '60 days', null::text, 'Vía'),
      ('negocio inexistente', v_none, 100::bigint,   v_paid + interval '60 days', 'CASH',     'no existe')
    ) as t(label, biz, amount, until_at, method, expected)
  loop
    v_msg := null;
    begin
      perform admin_register_payment(v_row.biz, v_row.amount, v_row.until_at, v_row.method, null);
    exception when others then v_msg := sqlerrm;
    end;
    if v_msg is null then
      raise exception 'FALLÓ 4: "%" debía rechazarse y se aceptó', v_row.label;
    end if;
    if position(v_row.expected in v_msg) = 0 then
      raise exception 'FALLÓ 4: "%" se rechazó con otro mensaje: %', v_row.label, v_msg;
    end if;
  end loop;
  execute 'reset role';

  select count(*) into v_after from subscription_payment;
  if v_after <> v_n then
    raise exception 'FALLÓ 4: lo rechazado dejó pagos (antes %, ahora %)', v_n, v_after;
  end if;
  if (select s.paid_until from business_subscription s where s.business_id = v_blk) is distinct from v_paid then
    raise exception 'FALLÓ 4: un pago rechazado movió paid_until';
  end if;
  if exists (select 1 from business_subscription s where s.business_id = v_none) then
    raise exception 'FALLÓ 4: un pago a un negocio inexistente creó una suscripción';
  end if;

  -- ── 5 · admin_set_exempt ─────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  execute 'set local role authenticated';

  -- El exento (prueba vencida hace 90 días) pierde la exención: queda BLOQUEADO.
  v_text := admin_set_exempt(v_exe, false);
  if v_text is distinct from 'BLOCKED' then
    raise exception 'FALLÓ 5: quitar la exención debía dejarlo BLOCKED, devolvió %', v_text;
  end if;
  select l.status into v_text from admin_list_businesses() l where l.business_id = v_exe;
  if v_text is distinct from 'BLOCKED' then
    raise exception 'FALLÓ 5: la lista debía mostrarlo BLOCKED, mostró %', v_text;
  end if;

  -- Ponerla de nuevo: EXENTO, aunque tenga fechas vencidas.
  v_text := admin_set_exempt(v_exe, true);
  if v_text is distinct from 'EXEMPT' then
    raise exception 'FALLÓ 5: poner la exención debía dejarlo EXEMPT, devolvió %', v_text;
  end if;

  -- Un negocio en prueba exento y de vuelta: no pierde la prueba.
  perform admin_set_exempt(v_tri, true);
  -- Se lee el estado que devuelve la RPC: authenticated ya no ejecuta subscription_status.
  v_text := admin_set_exempt(v_tri, false);
  if v_text is distinct from 'TRIAL' then
    raise exception 'FALLÓ 5: tras exentar y quitar, la prueba debía seguir vigente (%)', v_text;
  end if;

  -- Rechazos.
  v_msg := null;
  begin
    perform admin_set_exempt(v_none, true);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or position('no existe' in v_msg) = 0 then
    raise exception 'FALLÓ 5: negocio inexistente debía dar "no existe", llegó: %', coalesce(v_msg, '(sin error)');
  end if;
  v_msg := null;
  begin
    perform admin_set_exempt(v_tri, null);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'FALLÓ 5: p_exempt nulo debía rechazarse';
  end if;
  execute 'reset role';

  -- Un negocio exento sigue exento aunque reciba un pago (el pago se registra igual).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  execute 'set local role authenticated';
  perform admin_register_payment(v_exe, 50000, now() + interval '30 days', 'OTHER', 'Pago de un exento');
  execute 'reset role';
  if subscription_status(v_exe) is distinct from 'EXEMPT' then
    raise exception 'FALLÓ 5: un pago no debe quitar la exención (%)', subscription_status(v_exe);
  end if;

  -- ── 6 · Los pagos siguen append-only ─────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  execute 'set local role authenticated';
  v_msg := null;
  begin
    update subscription_payment set amount_cents = 1 where business_id = v_blk;
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 6: el administrador pudo hacer UPDATE directo en subscription_payment';
  end if;
  v_msg := null;
  begin
    delete from subscription_payment where business_id = v_blk;
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 6: el administrador pudo hacer DELETE directo en subscription_payment';
  end if;
  v_msg := null;
  begin
    insert into subscription_payment (business_id, amount_cents, paid_until, method)
    values (v_blk, 1, now() + interval '400 days', 'CASH');
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 6: el administrador pudo hacer INSERT directo (solo por la RPC)';
  end if;
  execute 'reset role';

  v_msg := null;
  begin
    update subscription_payment set amount_cents = 1 where business_id = v_blk;
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like '%no se edita ni se borra%' then
    raise exception 'FALLÓ 6: UPDATE como postgres debía rechazarlo el trigger, llegó: %', coalesce(v_msg, '(sin error)');
  end if;
  v_msg := null;
  begin
    delete from subscription_payment where business_id = v_blk;
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like '%no se edita ni se borra%' then
    raise exception 'FALLÓ 6: DELETE como postgres debía rechazarlo el trigger, llegó: %', coalesce(v_msg, '(sin error)');
  end if;
  select count(*) into v_n from subscription_payment where business_id = v_blk;
  if v_n <> 2 then
    raise exception 'FALLÓ 6: los pagos debían seguir intactos (% filas)', v_n;
  end if;

  -- ── 7 · Endurecimiento de las funciones de estado ────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  execute 'set local role authenticated';
  v_msg := null;
  begin
    perform subscription_status(v_blk);
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: authenticated aún puede ejecutar subscription_status';
  end if;
  v_msg := null;
  begin
    perform business_operational(v_blk);
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: authenticated aún puede ejecutar business_operational';
  end if;

  -- La RLS de la dueña sigue andando: is_member las llama como security definer.
  select count(*) into v_n from business where id = v_tri;
  if v_n <> 1 then
    raise exception 'FALLÓ 7: tras el REVOKE la dueña dejó de ver su negocio (% filas)', v_n;
  end if;
  select count(*) into v_n from my_subscription();
  if v_n <> 1 then
    raise exception 'FALLÓ 7: my_subscription() debía seguir respondiendo (% filas)', v_n;
  end if;
  execute 'reset role';

  -- Limpieza final.
  delete from business where name like 'PRUEBA Admin%';
  delete from platform_admin where user_id in (v_admin, v_owner, v_other);
  delete from auth.users where id in (v_admin, v_owner, v_other);

  raise notice 'subscription-admin: todas las aserciones pasaron';
end $$;
