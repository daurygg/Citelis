-- Regresión de S3 (odd/tasks/saas-subscriptions.md): el bloqueo en el servidor.
-- Ver supabase/migrations/20261012000002_subscription_block.sql
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (falta my_subscription).
--
-- POR QUÉ ES LA SUITE MÁS IMPORTANTE DE LA FASE: `is_member` sostiene 21 policies RLS
-- en 19 tablas más Storage. Cambiarla toca TODO el sistema. Aquí se prueba, para cada
-- uno de los 5 estados, lo que ve y hace la dueña y lo que ve la visitante anónima.
--
-- QUÉ PRUEBA (por cada estado: TRIAL, ACTIVE, GRACE, BLOCKED, EXEMPT)
--   1 · LEER: la dueña ve su negocio y sus servicios (BLOCKED: cero filas, sin error).
--   2 · ESCRIBIR: INSERT y UPDATE funcionan (BLOCKED: el INSERT se rechaza por RLS y
--       el UPDATE no toca ninguna fila).
--   3 · Su fila de business_member SIGUE legible en todos los estados: es la salida de
--       emergencia con la que una dueña bloqueada descubre su business_id.
--   4 · my_subscription() responde en los cinco, BLOCKED incluido, con el estado y los
--       días que corresponden.
--   5 · Portal público: public_business, public_hours, public_busy,
--       resolve_public_slug y public_request_booking responden (BLOCKED: igual que un
--       portal cerrado, mismo mensaje, sin filtrar que el negocio existe pero no pagó).
--   6 · EXEMPT y TRIAL se comportan EXACTAMENTE como antes de S3: es la regresión que
--       importa, porque todo negocio existente es EXENTO.
--   7 · GRACE sigue operando: la gracia es un aviso, no un corte.
--   8 · El recibo público sigue resolviendo con el negocio BLOQUEADO (es el comprobante
--       de la clienta); la dueña bloqueada no lee la tabla `receipt`.
--   9 · Al pagar, el negocio vuelve a operar sin perder nada.
--  10 · my_subscription(): sin sesión, anon no la ejecuta; sin negocio, devuelve vacío.
--
-- Usuarias propias: ...0009f1 a ...0009f8. Negocios "PRUEBA Bloqueo ...", ids 9998xx.
-- Se borran al final.

do $$
declare
  v_states text[]        := array['TRIAL', 'ACTIVE', 'GRACE', 'BLOCKED', 'EXEMPT'];
  v_trial  timestamptz[] := array[now() + interval '5 days',  now() - interval '30 days', now() - interval '3 days',
                                  now() - interval '20 days', now() - interval '90 days'];
  v_paid   timestamptz[] := array[null, now() + interval '10 days', null, null, null];
  v_exempt boolean[]     := array[false, false, false, false, true];
  v_days   integer[]     := array[5, 10, 4, 0, 0];

  v_state  text;
  v_ok     boolean;
  v_i      integer;
  v_uid    uuid;
  v_biz    bigint;
  v_svc    bigint;
  v_slug   text;
  v_old    text;
  v_day    text;
  v_n      integer;
  v_wrote  boolean;
  v_text   text;
  v_msg    text;
  v_closed_msg text;
  v_id     bigint;
  v_sub    record;

  v_closed bigint := 999806;
  v_rbiz   bigint := 999807;
  v_ruid   uuid   := '00000000-0000-0000-0000-0000000009f7';
  v_nouid  uuid   := '00000000-0000-0000-0000-0000000009f8';
  v_rsvc   bigint := 999841;
  v_rapt   bigint := 999842;
  v_tok    uuid;
  v_json   jsonb;
begin
  if to_regprocedure('public.my_subscription()') is null then
    raise exception 'FALLÓ 0: falta my_subscription. ¿Aplicaste la migración?';
  end if;

  -- Limpieza previa por si una corrida anterior murió a medias.
  delete from business where name like 'PRUEBA Bloqueo%';
  delete from auth.users where id::text like '00000000-0000-0000-0000-0000000009f_';
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  select ('00000000-0000-0000-0000-0000000009f' || n)::uuid, 'authenticated', 'authenticated',
         'prueba-f' || n || '@citelis.test', now(), now()
    from generate_series(1, 8) as n;

  -- "Mañana + 3" en la hora del negocio: todos los días abren, así que no cae en cerrado.
  v_day := to_char((now() at time zone 'America/Santo_Domingo')::date + 3, 'YYYY-MM-DD');

  -- ── Fixtures: un negocio por estado, hablando como postgres ──────────────
  for v_i in 1 .. 5 loop
    v_biz := 999800 + v_i;
    v_uid := ('00000000-0000-0000-0000-0000000009f' || v_i)::uuid;
    insert into business (id, name, plan) values (v_biz, 'PRUEBA Bloqueo ' || v_states[v_i], 'mvp');
    insert into business_member (user_id, business_id) values (v_uid, v_biz);
    insert into business_subscription (business_id, trial_ends_at, paid_until, exempt)
    values (v_biz, v_trial[v_i], v_paid[v_i], v_exempt[v_i]);
    if subscription_status(v_biz) is distinct from v_states[v_i] then
      raise exception 'FALLÓ 0: el fixture % quedó en estado %, la suite parte mal', v_states[v_i], subscription_status(v_biz);
    end if;
    insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
    values (999810 + v_i, v_biz, 'Servicio ' || v_states[v_i], 5000, 0, null, 60, false);
    insert into booking_policy (business_id, public_slug, enabled, slot_step_min, buffer_min,
                                min_notice_hours, max_horizon_days, max_requests_per_phone_per_day, timezone)
    values (v_biz, 'prueba-bloqueo-' || lower(v_states[v_i]), true, 30, 0, 2, 30, 50, 'America/Santo_Domingo');
    insert into business_hours (id, business_id, weekday, opens_at, closes_at)
    select 999820 + v_i * 10 + wd, v_biz, wd, '09:00', '18:00' from generate_series(0, 6) as wd;
    insert into time_block (id, business_id, starts_at, ends_at, reason)
    values (999830 + v_i, v_biz, v_day || 'T11:00', v_day || 'T12:00', 'prueba');
    insert into booking_slug_history (slug, business_id)
    values ('prueba-bloqueo-viejo-' || lower(v_states[v_i]), v_biz);
  end loop;

  -- Control: un portal CERRADO de un negocio exento. Un negocio bloqueado debe verse
  -- exactamente así desde fuera (INVARIANTE de S3: sin forma nueva de error ni filtración).
  insert into business (id, name, plan) values (v_closed, 'PRUEBA Bloqueo cerrado', 'mvp');
  insert into business_subscription (business_id, trial_ends_at, exempt) values (v_closed, now(), true);
  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (999816, v_closed, 'Servicio cerrado', 5000, 0, null, 60, false);
  insert into booking_policy (business_id, public_slug, enabled, slot_step_min, buffer_min,
                              min_notice_hours, max_horizon_days, max_requests_per_phone_per_day, timezone)
  values (v_closed, 'prueba-bloqueo-cerrado', false, 30, 0, 2, 30, 50, 'America/Santo_Domingo');

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public_request_booking('prueba-bloqueo-cerrado', array[999816::bigint], v_day || 'T10:00', 'Prueba', '809-000-0000');
    raise exception 'FALLÓ 0: el portal cerrado de control aceptó una reserva';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FALLÓ %' then raise; end if;
    v_closed_msg := sqlerrm;
  end;
  execute 'reset role';

  -- ── Por estado ───────────────────────────────────────────────────────────
  for v_i in 1 .. 5 loop
    v_state := v_states[v_i];
    v_ok    := v_state <> 'BLOCKED';
    v_biz   := 999800 + v_i;
    v_svc   := 999810 + v_i;
    v_uid   := ('00000000-0000-0000-0000-0000000009f' || v_i)::uuid;
    v_slug  := 'prueba-bloqueo-' || lower(v_state);
    v_old   := 'prueba-bloqueo-viejo-' || lower(v_state);

    -- Hablando como la dueña.
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
    execute 'set local role authenticated';

    -- 1 · LEER. BLOCKED: cero filas, no un error.
    select count(*) into v_n from service where business_id = v_biz;
    if v_n <> (case when v_ok then 1 else 0 end) then
      raise exception 'FALLÓ 1 [%]: la dueña debía ver % servicios y vio % (is_member debe cortar solo BLOCKED)',
        v_state, case when v_ok then 1 else 0 end, v_n;
    end if;
    select count(*) into v_n from business where id = v_biz;
    if v_n <> (case when v_ok then 1 else 0 end) then
      raise exception 'FALLÓ 1 [%]: la dueña debía ver % filas de business y vio %',
        v_state, case when v_ok then 1 else 0 end, v_n;
    end if;
    select count(*) into v_n from business_hours where business_id = v_biz;
    if v_n <> (case when v_ok then 7 else 0 end) then
      raise exception 'FALLÓ 1 [%]: business_hours visibles %, esperaba %', v_state, v_n, case when v_ok then 7 else 0 end;
    end if;
    select count(*) into v_n from business_subscription where business_id = v_biz;
    if v_n <> (case when v_ok then 1 else 0 end) then
      raise exception 'FALLÓ 1 [%]: la policy de business_subscription debía dar % filas y dio %',
        v_state, case when v_ok then 1 else 0 end, v_n;
    end if;

    -- 2 · ESCRIBIR.
    v_wrote := true;
    begin
      insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
      values (999850 + v_i, v_biz, 'Nuevo ' || v_state, 1000, 0, null, 30, false);
    exception when insufficient_privilege then v_wrote := false;
    end;
    if v_wrote is distinct from v_ok then
      raise exception 'FALLÓ 2 [%]: INSERT permitido=% pero debía ser %', v_state, v_wrote, v_ok;
    end if;
    update service set name = 'Editado ' || v_state where id = v_svc;
    get diagnostics v_n = row_count;
    if v_n <> (case when v_ok then 1 else 0 end) then
      raise exception 'FALLÓ 2 [%]: UPDATE tocó % filas, esperaba %', v_state, v_n, case when v_ok then 1 else 0 end;
    end if;

    -- 3 · La salida de emergencia: member_select (user_id = auth.uid()) NO pasa por is_member.
    select count(*), min(business_id) into v_n, v_id from business_member where user_id = v_uid;
    if v_n <> 1 or v_id <> v_biz then
      raise exception 'FALLÓ 3 [%]: la dueña debe leer SU membresía en todos los estados (vio % filas, business_id %). Sin esto la dueña bloqueada no puede saber por qué', v_state, v_n, v_id;
    end if;

    -- 4 · my_subscription() responde en los cinco.
    select * into v_sub from my_subscription();
    if v_sub is null or v_sub.business_id is distinct from v_biz then
      raise exception 'FALLÓ 4 [%]: my_subscription no devolvió el negocio de la dueña', v_state;
    end if;
    if v_sub.status is distinct from v_state then
      raise exception 'FALLÓ 4 [%]: my_subscription dijo %', v_state, v_sub.status;
    end if;
    if v_sub.operational is distinct from v_ok then
      raise exception 'FALLÓ 4 [%]: operational=% pero debía ser %', v_state, v_sub.operational, v_ok;
    end if;
    if v_sub.days_left is distinct from v_days[v_i] then
      raise exception 'FALLÓ 4 [%]: days_left=% pero esperaba %', v_state, v_sub.days_left, v_days[v_i];
    end if;
    if v_sub.exempt is distinct from v_exempt[v_i]
       or v_sub.trial_ends_at is distinct from v_trial[v_i]
       or v_sub.paid_until is distinct from v_paid[v_i] then
      raise exception 'FALLÓ 4 [%]: my_subscription debe devolver las fechas tal cual están guardadas', v_state;
    end if;
    if (v_state in ('TRIAL', 'ACTIVE', 'GRACE')) <> (v_sub.ends_at is not null) then
      raise exception 'FALLÓ 4 [%]: ends_at=% (nulo solo en BLOCKED y EXEMPT)', v_state, v_sub.ends_at;
    end if;
    execute 'reset role';

    -- 5 · Portal público, hablando como anon.
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';

    -- Una fila por servicio; lo que importa es si el negocio se ve o no.
    select count(distinct business_id) into v_n from public_business(v_slug);
    if v_n <> (case when v_ok then 1 else 0 end) then
      raise exception 'FALLÓ 5 [%]: public_business mostró % negocios, esperaba %', v_state, v_n, case when v_ok then 1 else 0 end;
    end if;
    select count(*) into v_n from public_hours(v_slug);
    if v_n <> (case when v_ok then 7 else 0 end) then
      raise exception 'FALLÓ 5 [%]: public_hours devolvió % filas, esperaba %', v_state, v_n, case when v_ok then 7 else 0 end;
    end if;
    select count(*) into v_n from public_busy(v_slug, v_day);
    if v_n <> (case when v_ok then 1 else 0 end) then
      raise exception 'FALLÓ 5 [%]: public_busy devolvió % filas, esperaba %', v_state, v_n, case when v_ok then 1 else 0 end;
    end if;
    v_text := resolve_public_slug(v_old);
    if v_text is distinct from (case when v_ok then v_slug else null end) then
      raise exception 'FALLÓ 5 [%]: resolve_public_slug devolvió %, esperaba %', v_state, coalesce(v_text, '(nulo)'),
        case when v_ok then v_slug else '(nulo)' end;
    end if;

    v_msg := null; v_id := null;
    begin
      v_id := public_request_booking(v_slug, array[v_svc], v_day || 'T10:00', 'Prueba', '809-111-000' || v_i);
    exception when sqlstate 'P0001' then
      if sqlerrm like 'FALLÓ %' then raise; end if;
      v_msg := sqlerrm;
    end;
    if v_ok and v_id is null then
      raise exception 'FALLÓ 5 [%]: la reserva pública debía aceptarse y falló con "%"', v_state, v_msg;
    end if;
    if not v_ok then
      if v_id is not null then
        raise exception 'FALLÓ 5 [BLOCKED]: un negocio bloqueado aceptó una reserva pública';
      end if;
      if v_msg is distinct from v_closed_msg then
        raise exception 'FALLÓ 5 [BLOCKED]: debe rechazar IGUAL que un portal cerrado ("%"), pero dijo "%"', v_closed_msg, v_msg;
      end if;
    end if;
    execute 'reset role';
  end loop;

  -- 5 · Un portal bloqueado es indistinguible de uno cerrado: ni el negocio ni su
  -- dirección vieja se filtran.
  execute 'set local role anon';
  if exists (select 1 from public_business('prueba-bloqueo-blocked'))
     or exists (select 1 from public_business('prueba-bloqueo-cerrado')) then
    raise exception 'FALLÓ 5: public_business no debe devolver nada ni del cerrado ni del bloqueado';
  end if;
  execute 'reset role';

  -- 6 · Regresión de EXENTO y TRIAL: el flujo completo de la dueña funciona como antes
  -- (la reserva pública quedó como cita REQUESTED y la dueña la ve).
  for v_i in 1 .. 5 loop
    v_state := v_states[v_i];
    if v_state = 'BLOCKED' then continue; end if;
    perform set_config('request.jwt.claims',
      json_build_object('sub', ('00000000-0000-0000-0000-0000000009f' || v_i)::uuid)::text, true);
    execute 'set local role authenticated';
    select count(*) into v_n from appointment where business_id = 999800 + v_i and status = 'REQUESTED';
    if v_n <> 1 then
      raise exception 'FALLÓ 6 [%]: la dueña debía ver 1 solicitud entrante y vio %. Un estado operativo debe funcionar igual que antes de S3', v_state, v_n;
    end if;
    execute 'reset role';
  end loop;
  -- ...y la de BLOCKED no se creó.
  select count(*) into v_n from appointment where business_id = 999804;
  if v_n <> 0 then
    raise exception 'FALLÓ 6: el negocio BLOQUEADO recibió % citas', v_n;
  end if;

  -- ── 8 · El recibo público con el negocio BLOQUEADO ───────────────────────
  insert into business (id, name, plan, address, phone)
  values (v_rbiz, 'PRUEBA Bloqueo recibo', 'mvp', 'Calle 1 #23', '809-555-0101');
  insert into business_member (user_id, business_id) values (v_ruid, v_rbiz);
  insert into business_subscription (business_id, trial_ends_at, exempt) values (v_rbiz, now(), true);
  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_rsvc, v_rbiz, 'Cejas', 5000, 1000, null, 30, false);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ruid)::text, true);
  perform schedule_appointment(v_rbiz, v_rapt, 'Clienta Recibo', '2026-10-12T10:00', null, null, array[v_rsvc], null);
  perform complete_appointment(v_rbiz, v_rapt, 5000, 1000, 4000,
    '[{"service_id":999841,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb, '[]'::jsonb);
  execute 'set local role authenticated';
  select r.public_token into v_tok from issue_receipt(v_rbiz, v_rapt) r;
  execute 'reset role';
  if v_tok is null then
    raise exception 'FALLÓ 8: el negocio exento no pudo emitir su recibo (la preparación está rota)';
  end if;

  -- Ahora el negocio pasa a BLOQUEADO (como postgres, lo hará el vencimiento del tiempo).
  update business_subscription set exempt = false, trial_ends_at = now() - interval '30 days', paid_until = null
   where business_id = v_rbiz;
  if subscription_status(v_rbiz) is distinct from 'BLOCKED' then
    raise exception 'FALLÓ 8: la preparación no dejó el negocio BLOQUEADO (%)', subscription_status(v_rbiz);
  end if;

  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  v_json := public_receipt(v_tok);
  execute 'reset role';
  if v_json is null or v_json #>> '{business,name}' is distinct from 'PRUEBA Bloqueo recibo'
     or v_json #>> '{appointment,client}' is distinct from 'Clienta Recibo' then
    raise exception 'FALLÓ 8: el recibo público dejó de resolver con el negocio BLOQUEADO (devolvió %). Es el comprobante de la clienta, no una función del negocio', v_json;
  end if;

  -- La dueña bloqueada no lee la tabla `receipt` (RLS por membresía), pero sí su estado.
  perform set_config('request.jwt.claims', json_build_object('sub', v_ruid)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from receipt where business_id = v_rbiz;
  if v_n <> 0 then
    raise exception 'FALLÓ 8: la dueña bloqueada leyó % recibos de la tabla', v_n;
  end if;
  select * into v_sub from my_subscription();
  if v_sub.status is distinct from 'BLOCKED' then
    raise exception 'FALLÓ 8: my_subscription de la dueña bloqueada dijo %', v_sub.status;
  end if;
  execute 'reset role';

  -- 9 · Al pagar, el negocio vuelve a operar y no perdió nada.
  update business_subscription set paid_until = now() + interval '30 days' where business_id = v_rbiz;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ruid)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from receipt where business_id = v_rbiz;
  if v_n <> 1 then
    raise exception 'FALLÓ 9: tras pagar, la dueña debía recuperar su recibo (vio % filas)', v_n;
  end if;
  select count(*) into v_n from appointment where business_id = v_rbiz and status = 'COMPLETED';
  if v_n <> 1 then
    raise exception 'FALLÓ 9: el historial completado debe seguir intacto tras el bloqueo (% citas)', v_n;
  end if;
  execute 'reset role';

  -- 10 · my_subscription(): fronteras de acceso.
  perform set_config('request.jwt.claims', json_build_object('sub', v_nouid)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from my_subscription();
  if v_n <> 0 then
    raise exception 'FALLÓ 10: una usuaria sin negocio no debe recibir suscripción alguna (% filas)', v_n;
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  v_msg := null;
  begin
    perform my_subscription();
  exception when insufficient_privilege then v_msg := 'denegado';
  end;
  execute 'reset role';
  if v_msg is distinct from 'denegado' then
    raise exception 'FALLÓ 10: anon pudo ejecutar my_subscription';
  end if;

  -- Limpieza final.
  delete from business where name like 'PRUEBA Bloqueo%';
  delete from auth.users where id::text like '00000000-0000-0000-0000-0000000009f_';

  raise notice 'subscription-block: todas las aserciones pasaron';
end $$;
