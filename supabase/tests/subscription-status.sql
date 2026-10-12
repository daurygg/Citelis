-- Regresión de S2 (odd/tasks/saas-subscriptions.md): estado de la suscripción en la base.
-- Ver supabase/migrations/20261012000001_saas_subscriptions.sql
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (falta subscription_status).
--
-- QUÉ PRUEBA
--   1 · subscription_status devuelve los 5 estados, con los bordes de la gracia
--       (vencido hace 6 días: GRACE; hace 7 exactos u 8: BLOCKED) y espejo de
--       src/lib/domain/subscription.ts.
--   2 · Un pago que termina ANTES que la prueba no le quita la prueba.
--   3 · business_operational es false solo con BLOCKED; un negocio sin fila es operativo.
--   4 · create_business crea la prueba de 14 días, no exenta.
--   5 · El backfill deja a los negocios existentes EXENTOS.
--   6 · RLS: la dueña lee su suscripción y sus pagos; una ajena ve cero filas.
--   7 · Ni la dueña ni anon pueden escribir suscripción ni pagos.
--   8 · subscription_payment es append-only (UPDATE y DELETE se rechazan, incluso
--       para postgres), pero borrar el negocio sí se lleva sus pagos.
--   9 · is_platform_admin: false para una usuaria normal, true tras entrar en la tabla;
--       platform_admin no se lee desde la API.
--  10 · anon no puede ejecutar las funciones de estado ni is_platform_admin.
--
-- Usuarias propias: ...0009e1 y ...0009e2. Negocios "PRUEBA Suscripción ...". Se borran al final.

do $$
declare
  v_uid    uuid := '00000000-0000-0000-0000-0000000009e1';
  v_uid2   uuid := '00000000-0000-0000-0000-0000000009e2';
  v_biz    bigint;
  v_ajeno  bigint;
  v_b      bigint;
  v_back   bigint;
  v_sin    bigint;
  v_n      integer;
  v_text   text;
  v_bool   boolean;
  v_trial  timestamptz;
  v_exempt boolean;
  v_msg    text;
  v_case   record;
begin
  if to_regprocedure('public.subscription_status(bigint)') is null then
    raise exception 'FALLÓ 0: falta subscription_status. ¿Aplicaste la migración?';
  end if;

  -- Limpieza previa por si una corrida anterior murió a medias.
  delete from business where name like 'PRUEBA Suscripción%';
  delete from platform_admin where user_id in (v_uid, v_uid2);
  delete from auth.users where id in (v_uid, v_uid2);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid,  'authenticated', 'authenticated', 'prueba-e1@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-e2@citelis.test', now(), now());

  -- 1 y 2 · Estados con filas fabricadas (como postgres). Un negocio por caso.
  for v_case in
    select * from (values
      ('TRIAL: prueba vigente',                  now() + interval '5 days',  null::timestamptz,         false, 'TRIAL'),
      ('ACTIVE: pago vigente, prueba vencida',   now() - interval '30 days', now() + interval '10 days', false, 'ACTIVE'),
      ('ACTIVE gana a TRIAL (ambos vigentes)',   now() + interval '5 days',  now() + interval '10 days', false, 'ACTIVE'),
      ('GRACE: prueba vencida hace 6 días',      now() - interval '6 days',  null::timestamptz,         false, 'GRACE'),
      ('BLOCKED: prueba vencida hace 7 exactos', now() - interval '7 days',  null::timestamptz,         false, 'BLOCKED'),
      ('BLOCKED: prueba vencida hace 8 días',    now() - interval '8 days',  null::timestamptz,         false, 'BLOCKED'),
      ('GRACE: pago vencido hace 3 (prueba hace 20)', now() - interval '20 days', now() - interval '3 days', false, 'GRACE'),
      ('BLOCKED: pago vencido hace 9 (prueba hace 20)', now() - interval '20 days', now() - interval '9 days', false, 'BLOCKED'),
      ('TRIAL: un pago que termina antes que la prueba no la quita', now() + interval '5 days', now() - interval '3 days', false, 'TRIAL'),
      ('GRACE: pago viejo no acorta la gracia de la prueba', now() - interval '2 days', now() - interval '40 days', false, 'GRACE'),
      ('EXEMPT: exento aunque todo esté vencido', now() - interval '90 days', now() - interval '60 days', true, 'EXEMPT')
    ) as t(label, trial, paid, exempt, expected)
  loop
    v_b := nextval('business_id_seq');
    insert into business (id, name, plan) values (v_b, 'PRUEBA Suscripción ' || v_b, 'mvp');
    insert into business_subscription (business_id, trial_ends_at, paid_until, exempt)
    values (v_b, v_case.trial, v_case.paid, v_case.exempt);

    v_text := subscription_status(v_b);
    if v_text is distinct from v_case.expected then
      raise exception 'FALLÓ 1: caso "%": esperaba %, devolvió %', v_case.label, v_case.expected, coalesce(v_text, '(nulo)');
    end if;

    -- 3 · operativo solo si no está BLOQUEADO.
    v_bool := business_operational(v_b);
    if v_bool is distinct from (v_case.expected <> 'BLOCKED') then
      raise exception 'FALLÓ 3: caso "%": business_operational devolvió %', v_case.label, v_bool;
    end if;
  end loop;

  -- 3 · Sin fila de suscripción el negocio cuenta como operativo (default seguro).
  v_sin := nextval('business_id_seq');
  insert into business (id, name, plan) values (v_sin, 'PRUEBA Suscripción sin fila', 'mvp');
  if business_operational(v_sin) is distinct from true then
    raise exception 'FALLÓ 3: un negocio sin fila de suscripción debe ser operativo';
  end if;
  if subscription_status(v_sin) is not null then
    raise exception 'FALLÓ 3: sin fila, subscription_status debe ser nulo, no %', subscription_status(v_sin);
  end if;

  -- 5 · Backfill: la misma sentencia de la migración deja EXENTO al negocio existente.
  v_back := nextval('business_id_seq');
  insert into business (id, name, plan) values (v_back, 'PRUEBA Suscripción existente', 'mvp');
  insert into business_subscription (business_id, trial_ends_at, exempt)
  select b.id, now(), true from business b
  on conflict (business_id) do nothing;
  select exempt into v_exempt from business_subscription where business_id = v_back;
  if v_exempt is distinct from true or subscription_status(v_back) is distinct from 'EXEMPT' then
    raise exception 'FALLÓ 5: el negocio existente no quedó exento tras el backfill';
  end if;
  if exists (select 1 from business b
              where not exists (select 1 from business_subscription s where s.business_id = b.id)) then
    raise exception 'FALLÓ 5: quedó un negocio sin fila de suscripción tras el backfill';
  end if;

  -- 4 · create_business: prueba de 14 días, no exenta.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_biz := create_business('PRUEBA Suscripción nueva', '#e11d48', 'prueba-suscripcion-nueva');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_ajeno := create_business('PRUEBA Suscripción ajena', '#e11d48', 'prueba-suscripcion-ajena');

  select trial_ends_at, exempt into v_trial, v_exempt from business_subscription where business_id = v_biz;
  if v_trial is null then
    raise exception 'FALLÓ 4: create_business no creó la fila de suscripción';
  end if;
  if v_exempt is distinct from false then
    raise exception 'FALLÓ 4: un negocio nuevo no debe nacer exento';
  end if;
  if abs(extract(epoch from (v_trial - (now() + interval '14 days')))) > 60 then
    raise exception 'FALLÓ 4: trial_ends_at debe ser ahora + 14 días, quedó %', v_trial;
  end if;
  if subscription_status(v_biz) is distinct from 'TRIAL' then
    raise exception 'FALLÓ 4: el negocio nuevo debe estar en TRIAL, está %', subscription_status(v_biz);
  end if;

  -- Un pago para probar lectura y escritura (como postgres).
  insert into subscription_payment (business_id, amount_cents, paid_until, method, note)
  values (v_biz, 150000, now() + interval '30 days', 'TRANSFER', 'prueba');
  insert into subscription_payment (business_id, amount_cents, paid_until, method)
  values (v_ajeno, 150000, now() + interval '30 days', 'CASH');

  -- 6 · RLS de lectura, hablando como la dueña.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from business_subscription where business_id = v_biz;
  if v_n <> 1 then
    raise exception 'FALLÓ 6: la dueña debe ver su suscripción (vio % filas)', v_n;
  end if;
  select count(*) into v_n from business_subscription where business_id = v_ajeno;
  if v_n <> 0 then
    raise exception 'FALLÓ 6: la dueña vio la suscripción de otro negocio (% filas)', v_n;
  end if;
  select count(*) into v_n from subscription_payment where business_id = v_biz;
  if v_n <> 1 then
    raise exception 'FALLÓ 6: la dueña debe ver sus pagos (vio % filas)', v_n;
  end if;
  select count(*) into v_n from subscription_payment where business_id = v_ajeno;
  if v_n <> 0 then
    raise exception 'FALLÓ 6: la dueña vio pagos de otro negocio (% filas)', v_n;
  end if;

  -- 7 · La dueña no escribe: cada intento debe chocar con falta de privilegio.
  v_msg := null;
  begin
    update business_subscription set exempt = true where business_id = v_biz;
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: la dueña pudo hacer UPDATE en business_subscription';
  end if;

  v_msg := null;
  begin
    insert into business_subscription (business_id, trial_ends_at) values (v_biz, now());
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: la dueña pudo hacer INSERT en business_subscription';
  end if;

  v_msg := null;
  begin
    delete from business_subscription where business_id = v_biz;
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: la dueña pudo hacer DELETE en business_subscription';
  end if;

  v_msg := null;
  begin
    insert into subscription_payment (business_id, amount_cents, paid_until, method)
    values (v_biz, 1, now() + interval '365 days', 'CASH');
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: la dueña pudo hacer INSERT en subscription_payment';
  end if;

  v_msg := null;
  begin
    update subscription_payment set amount_cents = 0 where business_id = v_biz;
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: la dueña pudo hacer UPDATE en subscription_payment';
  end if;

  v_msg := null;
  begin
    delete from subscription_payment where business_id = v_biz;
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 7: la dueña pudo hacer DELETE en subscription_payment';
  end if;

  -- 9 · platform_admin no se lee ni se escribe desde la API.
  v_msg := null;
  begin
    perform 1 from platform_admin;
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 9: una usuaria autenticada pudo leer platform_admin';
  end if;
  v_msg := null;
  begin
    insert into platform_admin (user_id) values (v_uid);
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 9: una usuaria autenticada pudo darse permiso de administradora';
  end if;

  -- 9 · is_platform_admin: false para una usuaria normal.
  if is_platform_admin() is distinct from false then
    raise exception 'FALLÓ 9: una usuaria normal no es administradora de la plataforma';
  end if;
  execute 'reset role';

  -- ...y true una vez que postgres la mete en la tabla.
  insert into platform_admin (user_id) values (v_uid);
  execute 'set local role authenticated';
  if is_platform_admin() is distinct from true then
    raise exception 'FALLÓ 9: is_platform_admin debe ser true para quien está en platform_admin';
  end if;
  -- La otra usuaria sigue sin serlo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  if is_platform_admin() is distinct from false then
    raise exception 'FALLÓ 9: is_platform_admin no debe ser true para otra usuaria';
  end if;
  execute 'reset role';

  -- 8 · Append-only: ni postgres edita ni borra un pago.
  v_msg := null;
  begin
    update subscription_payment set amount_cents = 1 where business_id = v_biz;
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like '%no se edita ni se borra%' then
    raise exception 'FALLÓ 8: UPDATE de un pago debe rechazarse por el trigger, llegó: %', coalesce(v_msg, '(sin error)');
  end if;
  v_msg := null;
  begin
    delete from subscription_payment where business_id = v_biz;
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like '%no se edita ni se borra%' then
    raise exception 'FALLÓ 8: DELETE de un pago debe rechazarse por el trigger, llegó: %', coalesce(v_msg, '(sin error)');
  end if;
  select count(*) into v_n from subscription_payment where business_id = v_biz;
  if v_n <> 1 then
    raise exception 'FALLÓ 8: el pago debía seguir intacto (% filas)', v_n;
  end if;

  -- 10 · anon no ejecuta las funciones de estado.
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  v_msg := null;
  begin
    perform is_platform_admin();
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 10: anon pudo ejecutar is_platform_admin';
  end if;
  v_msg := null;
  begin
    perform subscription_status(v_biz);
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 10: anon pudo ejecutar subscription_status';
  end if;
  v_msg := null;
  begin
    perform business_operational(v_biz);
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 10: anon pudo ejecutar business_operational';
  end if;
  execute 'reset role';

  -- 8 · Borrar el negocio SÍ se lleva sus pagos (la cascada no choca con el trigger).
  delete from business where id = v_biz;
  select count(*) into v_n from subscription_payment where business_id = v_biz;
  if v_n <> 0 then
    raise exception 'FALLÓ 8: al borrar el negocio sus pagos debían irse con él (% filas)', v_n;
  end if;

  -- Limpieza final.
  delete from business where name like 'PRUEBA Suscripción%';
  delete from platform_admin where user_id in (v_uid, v_uid2);
  delete from auth.users where id in (v_uid, v_uid2);

  raise notice 'subscription-status: todas las aserciones pasaron';
end $$;
