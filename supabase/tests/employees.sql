-- Regresión de P1 (odd/tasks/payments-and-receipt.md): empleadas y `employee_id`
-- en las líneas de cobro. Ver supabase/migrations/20261010000008_employees.sql.
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (la tabla no existe).
--
-- QUÉ PRUEBA
--   1 · RLS (INVARIANTE 1): una dueña ve y crea empleadas de SU negocio, y no ve
--       ni puede crear las de otro.
--   2 · Cobrar con empleada por línea guarda `employee_id` en cada línea.
--   3 · Cobrar SIN empleadas sigue funcionando (`employee_id` queda null).
--   4 · Una empleada de otro negocio se rechaza (mensaje exacto) y la cita sigue PENDING.
--   5 · Una empleada desactivada no se puede asignar (mensaje exacto).
--   6 · Desactivar a una empleada NO toca el historial ya cobrado.
--   7 · El nombre vacío lo rechaza la base.
--
-- Usuarias propias: ...0009aa y ...0009ab. Datos 9997xx. Se borran al final.

do $$
declare
  v_uid   uuid := '00000000-0000-0000-0000-0000000009aa';
  v_uid2  uuid := '00000000-0000-0000-0000-0000000009ab';
  v_biz   bigint;
  v_otro  bigint;
  v_svc1  bigint := 999711;
  v_svc2  bigint := 999712;
  v_emp1  bigint := 999721;
  v_emp2  bigint := 999722;
  v_emp_o bigint := 999723;
  v_emp_x bigint := 999724;
  v_apt1  bigint := 999731;
  v_apt2  bigint := 999732;
  v_apt3  bigint := 999733;
  v_apt4  bigint := 999734;
  v_msg   text;
  v_n     integer;
begin
  if to_regclass('public.employee') is null then
    raise exception 'FALLÓ 0: la tabla employee no existe. ¿Aplicaste la migración?';
  end if;

  delete from business where created_by in (v_uid, v_uid2);
  delete from auth.users where id in (v_uid, v_uid2);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid,  'authenticated', 'authenticated', 'prueba-aa@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-ab@citelis.test', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_biz := create_business('PRUEBA Empleadas', '#e11d48', 'prueba-empleadas');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_otro := create_business('PRUEBA Empleadas Ajeno', '#e11d48', 'prueba-empleadas-ajeno');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc1, v_biz, 'Cejas', 5000, 1000, null, 30, false),
         (v_svc2, v_biz, 'Ondas', 4000,  500, null, 45, false);

  -- Siembra saltándose la RLS (somos el propietario de la tabla).
  insert into employee (id, business_id, name, active) values
    (v_emp1,  v_biz,  'Marta',  true),
    (v_emp2,  v_biz,  'Lucía',  true),
    (v_emp_x, v_biz,  'Baja',   false),
    (v_emp_o, v_otro, 'Ajena',  true);

  insert into appointment (id, business_id, service_id, client, datetime, status,
                           quoted_price, deposit, charged_price, actual_cost, profit)
  values (v_apt1, v_biz, v_svc1, 'Ana',  '2026-10-12T10:00', 'PENDING', null, null, null, null, null),
         (v_apt2, v_biz, v_svc1, 'Rosa', '2026-10-12T11:00', 'PENDING', null, null, null, null, null),
         (v_apt3, v_biz, v_svc1, 'Eva',  '2026-10-12T12:00', 'PENDING', null, null, null, null, null),
         (v_apt4, v_biz, v_svc1, 'Zoe',  '2026-10-12T13:00', 'PENDING', null, null, null, null, null);
  insert into appointment_service (appointment_id, service_id, business_id)
  values (v_apt1, v_svc1, v_biz), (v_apt1, v_svc2, v_biz);

  -- 1 · RLS: como dueña de v_biz.
  execute 'set local role authenticated';
  if not exists (select 1 from employee where id = v_emp1) then
    raise exception 'FALLÓ 1: la dueña no ve ni a su propia empleada';
  end if;
  if exists (select 1 from employee where id = v_emp_o) then
    raise exception 'FALLÓ 1: viola INVARIANTE 1, la dueña ve una empleada de otro negocio';
  end if;
  begin
    insert into employee (id, business_id, name) values (999725, v_otro, 'Intrusa');
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'new row violates row-level security policy for table "employee"' then
    raise exception 'FALLÓ 1: crear una empleada en otro negocio dio "%"', coalesce(v_msg, 'éxito');
  end if;
  insert into employee (id, business_id, name) values (999726, v_biz, 'Nueva');
  execute 'reset role';

  -- 7 · Nombre vacío.
  begin
    insert into employee (id, business_id, name) values (999727, v_biz, '   ');
    v_msg := null;
  exception when check_violation then v_msg := 'check'; end;
  if v_msg is distinct from 'check' then
    raise exception 'FALLÓ 7: la base aceptó una empleada sin nombre';
  end if;

  -- 2 · Una empleada distinta por línea.
  perform complete_appointment(v_biz, v_apt1, 9000, 1500, 7500,
    ('[{"service_id":999711,"charged_price":5000,"actual_cost":1000,"profit":4000,"employee_id":' || v_emp1 || '},
       {"service_id":999712,"charged_price":4000,"actual_cost":500,"profit":3500,"employee_id":' || v_emp2 || '}]')::jsonb);
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt1
     and ((service_id = v_svc1 and employee_id = v_emp1) or (service_id = v_svc2 and employee_id = v_emp2));
  if v_n <> 2 then
    raise exception 'FALLÓ 2: las líneas no guardaron su empleada (% de 2)', v_n;
  end if;

  -- 3 · Sin empleadas.
  perform complete_appointment(v_biz, v_apt2, 5000, 1000, 4000,
    '[{"service_id":999711,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb);
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt2 and employee_id is null and charged_price = 5000;
  if v_n <> 1 then
    raise exception 'FALLÓ 3: cobrar sin empleada no dejó la línea con employee_id null';
  end if;

  -- 4 · De otro negocio.
  begin
    perform complete_appointment(v_biz, v_apt3, 5000, 1000, 4000,
      ('[{"service_id":999711,"charged_price":5000,"actual_cost":1000,"profit":4000,"employee_id":' || v_emp_o || '}]')::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Una empleada no pertenece a tu negocio.' then
    raise exception 'FALLÓ 4: empleada ajena dio "%"', coalesce(v_msg, 'éxito');
  end if;
  if (select status from appointment where id = v_apt3) <> 'PENDING' then
    raise exception 'FALLÓ 4: el rechazo dejó la cita a medias';
  end if;

  -- 5 · Desactivada.
  begin
    perform complete_appointment(v_biz, v_apt3, 5000, 1000, 4000,
      ('[{"service_id":999711,"charged_price":5000,"actual_cost":1000,"profit":4000,"employee_id":' || v_emp_x || '}]')::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Una empleada está dada de baja y no se puede asignar.' then
    raise exception 'FALLÓ 5: empleada desactivada dio "%"', coalesce(v_msg, 'éxito');
  end if;
  if (select status from appointment where id = v_apt3) <> 'PENDING' then
    raise exception 'FALLÓ 5: el rechazo dejó la cita a medias';
  end if;

  -- 6 · Desactivar después de cobrar no reescribe la historia.
  update employee set active = false where id = v_emp1;
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt1 and service_id = v_svc1 and employee_id = v_emp1
     and charged_price = 5000 and profit = 4000;
  if v_n <> 1 then
    raise exception 'FALLÓ 6: desactivar a la empleada cambió una línea ya cobrada';
  end if;

  delete from business where id in (v_biz, v_otro);
  delete from auth.users where id in (v_uid, v_uid2);
end $$;

select 'VERDE: las 7 aserciones de empleadas pasaron' as resultado;
