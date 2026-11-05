-- Regresión de odd/tasks/business-modules.md: módulos Tienda y Equipo por negocio.
-- Ver supabase/migrations/20261106000001_business_modules.sql
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (falta admin_set_module).
--
-- QUÉ PRUEBA
--   1 · Un negocio nuevo nace sin módulos; la dueña no puede activárselos (sin UPDATE
--       en esas columnas).
--   2 · Tienda apagada: no se crean productos y los existentes no se ven; encendida,
--       sí; al apagarla otra vez los datos siguen ahí (solo se ocultan).
--   3 · Equipo apagado: no se agrega a nadie, pero se sigue leyendo quién existía
--       (recibos viejos); encendido, sí se agrega.
--   4 · Equipo apagado: cobrar asignando a alguien se rechaza con mensaje claro;
--       cobrar sin asignar funciona.
--   5 · admin_set_module: solo el administrador; módulo o negocio inexistente, error.
--   6 · admin_list_businesses devuelve los módulos.
--
-- Usuarios propios: ...000ac1 (dueña) y ...000ac2 (administrador). Ids 9998xx.

do $$
declare
  v_owner  uuid   := '00000000-0000-0000-0000-000000000ac1';
  v_admin  uuid   := '00000000-0000-0000-0000-000000000ac2';
  v_biz    bigint;
  v_svc    bigint := 999801;
  v_apt1   bigint := 999811;
  v_apt2   bigint := 999812;
  v_emp    bigint := 999821;
  v_msg    text;
  v_n      integer;
  v_row    record;
begin
  if to_regprocedure('public.admin_set_module(bigint,text,boolean)') is null then
    raise exception 'FALLÓ 0: falta admin_set_module. ¿Aplicaste la migración?';
  end if;

  -- Limpieza previa por si una corrida anterior murió a medias.
  delete from business where name like 'PRUEBA Módulos%';
  delete from platform_admin where user_id = v_admin;
  delete from auth.users where id in (v_owner, v_admin);
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (v_owner, 'authenticated', 'authenticated', 'prueba-ac1@citelis.test', now(), now()),
         (v_admin, 'authenticated', 'authenticated', 'prueba-ac2@citelis.test', now(), now());
  insert into platform_admin (user_id) values (v_admin);

  -- ── 1 · Nace sin módulos y la dueña no los cambia ────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  v_biz := create_business('PRUEBA Módulos', '#e11d48', 'prueba-modulos');
  select store_enabled, team_enabled into v_row from business where id = v_biz;
  if v_row.store_enabled or v_row.team_enabled then
    raise exception 'FALLÓ 1: un negocio nuevo nació con módulos (% / %)', v_row.store_enabled, v_row.team_enabled;
  end if;
  if has_column_privilege('authenticated', 'public.business', 'store_enabled', 'UPDATE')
     or has_column_privilege('authenticated', 'public.business', 'team_enabled', 'UPDATE') then
    raise exception 'FALLÓ 1: la dueña puede activarse los módulos sola';
  end if;

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc, v_biz, 'Corte', 5000, 500, null, 30, false);
  insert into appointment (id, business_id, service_id, client, datetime, status,
                           quoted_price, deposit, charged_price, actual_cost, profit)
  values (v_apt1, v_biz, v_svc, 'Luis',  '2026-11-10T10:00', 'PENDING', null, null, null, null, null),
         (v_apt2, v_biz, v_svc, 'Pedro', '2026-11-10T11:00', 'PENDING', null, null, null, null, null);
  insert into appointment_service (appointment_id, service_id, business_id)
  values (v_apt1, v_svc, v_biz), (v_apt2, v_svc, v_biz);

  -- ── 2 · Tienda ───────────────────────────────────────────────────────────
  execute 'set local role authenticated';
  begin
    insert into product (id, business_id, name, price, cost, stock) values (999831, v_biz, 'Gel', 300, 100, 5);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'new row violates row-level security policy for table "product"' then
    raise exception 'FALLÓ 2: con la Tienda apagada crear un producto dio "%"', coalesce(v_msg, 'éxito');
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  perform admin_set_module(v_biz, 'store', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  execute 'set local role authenticated';
  insert into product (id, business_id, name, price, cost, stock) values (999831, v_biz, 'Gel', 300, 100, 5);
  if not exists (select 1 from product where id = 999831) then
    raise exception 'FALLÓ 2: con la Tienda activa no se ve el producto creado';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  perform admin_set_module(v_biz, 'store', false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from product where business_id = v_biz;
  execute 'reset role';
  if v_n <> 0 then raise exception 'FALLÓ 2: con la Tienda apagada se siguen viendo % productos', v_n; end if;
  if not exists (select 1 from product where id = 999831) then
    raise exception 'FALLÓ 2: apagar la Tienda borró los productos';
  end if;

  -- ── 3 · Equipo: personas ─────────────────────────────────────────────────
  insert into employee (id, business_id, name, active) values (v_emp, v_biz, 'Marcos', true);  -- como propietario
  execute 'set local role authenticated';
  if not exists (select 1 from employee where id = v_emp) then
    raise exception 'FALLÓ 3: con el Equipo apagado ya no se ve quién existía';
  end if;
  begin
    insert into employee (id, business_id, name) values (999822, v_biz, 'Nuevo');
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'new row violates row-level security policy for table "employee"' then
    raise exception 'FALLÓ 3: con el Equipo apagado agregar a alguien dio "%"', coalesce(v_msg, 'éxito');
  end if;
  execute 'reset role';

  -- ── 4 · Equipo: asignar al cobrar ────────────────────────────────────────
  begin
    perform complete_appointment(v_biz, v_apt1, 5000, 500, 4500,
      ('[{"service_id":' || v_svc || ',"charged_price":5000,"actual_cost":500,"profit":4500,"employee_id":' || v_emp || '}]')::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El módulo Equipo no está activo en este negocio.' then
    raise exception 'FALLÓ 4: con el Equipo apagado asignar al cobrar dio "%"', coalesce(v_msg, 'éxito');
  end if;
  if (select status from appointment where id = v_apt1) <> 'PENDING' then
    raise exception 'FALLÓ 4: el cobro rechazado dejó la cita cobrada';
  end if;
  perform complete_appointment(v_biz, v_apt2, 5000, 500, 4500,
    ('[{"service_id":' || v_svc || ',"charged_price":5000,"actual_cost":500,"profit":4500}]')::jsonb);
  if (select status from appointment where id = v_apt2) <> 'COMPLETED' then
    raise exception 'FALLÓ 4: con el Equipo apagado no se pudo cobrar sin asignar';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  perform admin_set_module(v_biz, 'team', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  execute 'set local role authenticated';
  insert into employee (id, business_id, name) values (999822, v_biz, 'Nuevo');
  execute 'reset role';
  perform complete_appointment(v_biz, v_apt1, 5000, 500, 4500,
    ('[{"service_id":' || v_svc || ',"charged_price":5000,"actual_cost":500,"profit":4500,"employee_id":' || v_emp || '}]')::jsonb);
  if not exists (select 1 from appointment_service where appointment_id = v_apt1 and employee_id = v_emp) then
    raise exception 'FALLÓ 4: con el Equipo activo no se guardó quién atendió';
  end if;

  -- ── 5 · admin_set_module ─────────────────────────────────────────────────
  begin
    perform admin_set_module(v_biz, 'store', true);   -- como la dueña
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'No autorizado' then
    raise exception 'FALLÓ 5: la dueña se activó un módulo ("%")', coalesce(v_msg, 'éxito');
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  begin
    perform admin_set_module(v_biz, 'reservas', true);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Ese módulo no existe' then
    raise exception 'FALLÓ 5: un módulo desconocido dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform admin_set_module(999899, 'store', true);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El negocio no existe' then
    raise exception 'FALLÓ 5: un negocio inexistente dio "%"', coalesce(v_msg, 'éxito');
  end if;
  if has_function_privilege('anon', 'public.admin_set_module(bigint,text,boolean)', 'EXECUTE') then
    raise exception 'FALLÓ 5: anon puede ejecutar admin_set_module';
  end if;

  -- ── 6 · El administrador ve los módulos ──────────────────────────────────
  select * into v_row from admin_list_businesses() where business_id = v_biz;
  if v_row.store_enabled is distinct from false or v_row.team_enabled is distinct from true then
    raise exception 'FALLÓ 6: el admin ve Tienda=% Equipo=%', v_row.store_enabled, v_row.team_enabled;
  end if;

  -- Limpieza.
  delete from business where id = v_biz;
  delete from platform_admin where user_id = v_admin;
  delete from auth.users where id in (v_owner, v_admin);
end $$;

select 'VERDE: los módulos Tienda y Equipo los controla solo el admin y el servidor los hace cumplir' as resultado;
