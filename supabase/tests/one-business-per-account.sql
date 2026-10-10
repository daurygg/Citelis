-- Regresión: una cuenta solo puede CREAR un negocio (las invitaciones no cuentan).
-- Ver supabase/migrations/20261010000005_one_business_per_account.sql
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP (`execute_sql`) o psql. Pégalo entero, DESPUÉS de
--   la migración. NO corre en CI: el workflow solo ejecuta vitest.
--
-- Usa SUS PROPIAS usuarias (insertadas en auth.users) y las borra al final, junto
-- con los negocios de prueba; no toca datos reales.

do $$
declare
  v_a      uuid := '00000000-0000-0000-0000-0000000009a1';
  v_b      uuid := '00000000-0000-0000-0000-0000000009a2';
  v_biz_a  bigint;
  v_biz_b  bigint;
  v_ajena  bigint;
  v_code   text;
  v_creada uuid;
  v_msg    text;
begin
  -- Limpieza previa por si una corrida anterior murió a medias.
  delete from business where created_by in (v_a, v_b);
  delete from auth.users where id in (v_a, v_b);
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (v_a, 'authenticated', 'authenticated', 'prueba-9a1@citelis.test', now(), now()),
         (v_b, 'authenticated', 'authenticated', 'prueba-9a2@citelis.test', now(), now());

  -- 1 · La primera alta funciona y deja constancia de quién creó el negocio.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a)::text, true);
  v_biz_a := create_business('PRUEBA Uno Por Cuenta A', '#e11d48', 'prueba-uno-por-cuenta-a');
  select created_by into v_creada from business where id = v_biz_a;
  if v_creada is distinct from v_a then
    raise exception 'FALLÓ 1: created_by quedó en %, esperaba %', v_creada, v_a;
  end if;

  -- 2 · La segunda alta de la MISMA cuenta se rechaza con el mensaje esperado
  --     (no cualquier excepción: una falla distinta no debe pasar por buena).
  v_msg := null;
  begin
    perform create_business('PRUEBA Uno Por Cuenta A2', '#e11d48', 'prueba-uno-por-cuenta-a2');
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Tu cuenta ya creó un negocio. Cada cuenta puede crear uno solo.' then
    raise exception 'FALLÓ 2: el rechazo llegó con el mensaje "%"', coalesce(v_msg, '(no hubo error)');
  end if;
  if exists (select 1 from business where name = 'PRUEBA Uno Por Cuenta A2') then
    raise exception 'FALLÓ 2: el negocio rechazado quedó creado igual';
  end if;

  -- 3 · El índice único es la garantía real, aunque se salte la función: un
  --     insert directo con la misma creadora choca con ese índice.
  v_msg := null;
  begin
    insert into business (id, name, plan, created_by)
    values (nextval('business_id_seq'), 'PRUEBA Directo', 'mvp', v_a);
  exception when unique_violation then
    v_msg := 'unique_violation';
  end;
  if v_msg is distinct from 'unique_violation' then
    raise exception 'FALLÓ 3: el índice no impidió un segundo negocio creado por la misma cuenta';
  end if;

  -- 4 · Otra cuenta SÍ puede crear el suyo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_b)::text, true);
  v_biz_b := create_business('PRUEBA Uno Por Cuenta B', '#e11d48', 'prueba-uno-por-cuenta-b');
  select created_by into v_creada from business where id = v_biz_b;
  if v_creada is distinct from v_b then
    raise exception 'FALLÓ 4: created_by quedó en %, esperaba %', v_creada, v_b;
  end if;

  -- 5 · Que te inviten NO es crear: A, que ya creó el suyo, entra al negocio de B
  --     por invitación, y sigue sin poder crear otro.
  v_code := create_invitation();            -- como B, dueña de v_biz_b
  perform set_config('request.jwt.claims', json_build_object('sub', v_a)::text, true);
  v_ajena := redeem_invitation(v_code);
  if v_ajena is distinct from v_biz_b then
    raise exception 'FALLÓ 5: la invitación llevó a % en vez de a %', v_ajena, v_biz_b;
  end if;
  if not exists (select 1 from business_member where user_id = v_a and business_id = v_biz_b) then
    raise exception 'FALLÓ 5: la invitada no quedó como miembro';
  end if;
  if (select count(*) from business where created_by = v_a) <> 1 then
    raise exception 'FALLÓ 5: canjear una invitación cambió quién creó qué';
  end if;

  v_msg := null;
  begin
    perform create_business('PRUEBA Uno Por Cuenta A3', '#e11d48', 'prueba-uno-por-cuenta-a3');
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Tu cuenta ya creó un negocio. Cada cuenta puede crear uno solo.' then
    raise exception 'FALLÓ 5: tras la invitación, el alta no se rechazó con el mensaje esperado ("%")',
      coalesce(v_msg, '(no hubo error)');
  end if;

  -- Limpieza (cascade se lleva booking_policy, membresías e invitaciones).
  delete from business where id in (v_biz_a, v_biz_b);
  delete from auth.users where id in (v_a, v_b);
end $$;

select 'VERDE: una cuenta crea un solo negocio; las invitaciones no cuentan' as resultado;
