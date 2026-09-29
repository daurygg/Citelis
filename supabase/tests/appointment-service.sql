-- Regresión de T3: la relación cita↔servicios y su relleno.
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP o psql. Pégalo entero, DESPUÉS de la migración
--   20260929000001_appointment_service.sql.
--
-- QUÉ NO ES
--   No corre en CI: el workflow solo ejecuta vitest, sin base de datos. Hay que
--   lanzarlo a mano. Es una red real, pero manual, y conviene no fingir otra cosa.
--
-- PARA VER EL ROJO (recomendado antes de aplicar la migración)
--   Córrelo ANTES de aplicarla: debe fallar en la aserción 0 diciendo que la
--   tabla no existe. Si pasa en rojo, es que la migración ya estaba aplicada.
--
-- Crea sus propios datos (ids 999xxx) y los borra al final.

do $$
declare
  v_uid       uuid;
  v_biz       bigint;
  v_ajeno     bigint;
  v_svc       bigint := 999801;
  v_svc2      bigint := 999802;
  v_apt       bigint := 999901;
  v_lineas    integer;
  v_cobrado   bigint;
  v_ok        boolean;
begin
  -- 0 · La tabla existe.
  if to_regclass('public.appointment_service') is null then
    raise exception 'FALLÓ 0: la tabla appointment_service no existe. ¿Aplicaste la migración?';
  end if;

  select id into v_uid from auth.users order by created_at limit 1;
  if v_uid is null then
    raise exception 'FALLÓ preparación: no hay usuario en auth.users con el que impersonar a la dueña';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  v_biz   := create_business('PRUEBA MultiServicio', '#e11d48', 'prueba-multiservicio');
  v_ajeno := create_business('PRUEBA Ajeno MS', '#e11d48', 'prueba-ajeno-ms');

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc,  v_biz, 'Cejas',  150000, 20000, null, 30, false),
         (v_svc2, v_biz, 'Labios', 400000, 50000, null, 45, false);

  -- 1 · Una cita con dos servicios guarda DOS líneas.
  insert into appointment (id, business_id, service_id, client, datetime, status,
                           quoted_price, deposit, charged_price, actual_cost, profit)
  values (v_apt, v_biz, v_svc, 'Rosa', '2026-10-01T10:00', 'PENDING',
          null, null, null, null, null);

  insert into appointment_service (appointment_id, service_id, business_id)
  values (v_apt, v_svc, v_biz), (v_apt, v_svc2, v_biz);

  select count(*) into v_lineas from appointment_service where appointment_id = v_apt;
  if v_lineas <> 2 then
    raise exception 'FALLÓ 1: la cita quedó con % líneas, esperaba 2', v_lineas;
  end if;

  -- 2 · El mismo servicio no se repite dentro de una cita.
  v_ok := false;
  begin
    insert into appointment_service (appointment_id, service_id, business_id)
    values (v_apt, v_svc, v_biz);
  exception when unique_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FALLÓ 2: se pudo repetir el mismo servicio en la misma cita';
  end if;

  -- 3 · Borrar la cita se lleva sus líneas (no quedan huérfanas).
  delete from appointment where id = v_apt;
  select count(*) into v_lineas from appointment_service where appointment_id = v_apt;
  if v_lineas <> 0 then
    raise exception 'FALLÓ 3: quedaron % líneas huérfanas tras borrar la cita', v_lineas;
  end if;

  delete from service  where id in (v_svc, v_svc2);
  delete from business where id in (v_biz, v_ajeno);
end $$;

-- 4 · EL RELLENO: cada cita que ya existía tiene exactamente una línea, con su
--     mismo dinero congelado. Esto es lo que protege la INVARIANTE 2: si una
--     sola cita histórica cambia de números, la migración es inaceptable.
do $$
declare v_sin_linea integer; v_descuadradas integer;
begin
  select count(*) into v_sin_linea
    from appointment a
   where not exists (select 1 from appointment_service s where s.appointment_id = a.id);
  if v_sin_linea > 0 then
    raise exception 'FALLÓ 4: % citas se quedaron sin ninguna línea', v_sin_linea;
  end if;

  select count(*) into v_descuadradas
    from appointment a
    join appointment_service s on s.appointment_id = a.id
   where a.status = 'COMPLETED'
     and (select count(*) from appointment_service x where x.appointment_id = a.id) = 1
     and (s.charged_price is distinct from a.charged_price
       or s.actual_cost   is distinct from a.actual_cost
       or s.profit        is distinct from a.profit);
  if v_descuadradas > 0 then
    raise exception 'FALLÓ 4: % citas completadas tienen su línea con dinero distinto al de la cita', v_descuadradas;
  end if;
end $$;

-- 5 · Aislamiento por tenant (INVARIANTE 1): hablando como la dueña, no se ven
--     las líneas de otro negocio.
do $$
declare v_uid uuid; v_visibles integer;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_visibles
    from appointment_service s
   where not is_member(s.business_id);
  if v_visibles > 0 then
    raise exception 'FALLÓ 5: viola INVARIANTE 1, se ven % líneas de negocios ajenos', v_visibles;
  end if;
end $$;

select 'VERDE: las 5 aserciones pasaron' as resultado;
