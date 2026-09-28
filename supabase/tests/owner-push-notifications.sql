-- Regresión: avisos push a la dueña cuando entra una solicitud.
-- Ver odd/tasks/owner-push-notifications.md (T2).
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP (`execute_sql`) o psql. Pégalo entero.
--   NO corre en CI: el workflow solo ejecuta vitest, sin base de datos.
--
-- Trabaja sobre negocios de prueba y los borra al final; el borrado en cascada
-- se lleva servicios, citas y suscripciones. Si crea la configuración de Vault
-- para la aserción 4, también la borra.

do $$
declare
  v_uid       uuid;
  v_mine      bigint;
  v_foreign   bigint;
  v_service   bigint;
  v_count     int;
  v_ok        boolean;
  v_had_cfg   boolean;
  v_queue_max bigint;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  if v_uid is null then
    raise exception 'FALLÓ preparación: no hay usuario en auth.users con el que impersonar a la dueña';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  v_mine := create_business('PRUEBA Push propio', '#e11d48');
  -- Negocio ajeno: se crea como la dueña y se le quita la membresía.
  v_foreign := create_business('PRUEBA Push ajeno', '#e11d48');
  delete from business_member where business_id = v_foreign and user_id = v_uid;

  -- 1 · Guardar la suscripción del dispositivo, y volver a guardarla (el
  --     navegador rota las claves) la reemplaza en vez de duplicarla.
  perform save_push_subscription(v_mine, 'https://push.example/prueba-1', 'p256dh-a', 'auth-a');
  perform save_push_subscription(v_mine, 'https://push.example/prueba-1', 'p256dh-b', 'auth-b');
  select count(*) into v_count from push_subscription where endpoint = 'https://push.example/prueba-1';
  if v_count <> 1 then
    raise exception 'FALLÓ 1: hay % filas para el mismo dispositivo', v_count;
  end if;
  if not exists (select 1 from push_subscription
                  where endpoint = 'https://push.example/prueba-1'
                    and p256dh = 'p256dh-b' and user_id = v_uid and business_id = v_mine) then
    raise exception 'FALLÓ 1: la segunda suscripción no reemplazó las claves';
  end if;

  -- 2 · No se puede suscribir a los avisos de un negocio ajeno (INVARIANTE 1).
  v_ok := false;
  begin
    perform save_push_subscription(v_foreign, 'https://push.example/prueba-2', 'x', 'y');
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FALLÓ 2: se suscribió a los avisos de un negocio al que no pertenece';
  end if;

  -- `service` no tiene secuencia: los ids los asigna el cliente.
  select coalesce(max(id), 0) + 1 into v_service from service;
  insert into service (id, business_id, name, duration_min) values (v_service, v_mine, 'PRUEBA Servicio', 30);

  select exists (select 1 from vault.decrypted_secrets
                  where name in ('notify_new_booking_url', 'notify_new_booking_secret'))
    into v_had_cfg;

  -- 3 · Sin configuración, la reserva entra igual. El aviso nunca tumba una cita.
  if not v_had_cfg then
    insert into appointment (id, business_id, service_id, client, datetime, status, source, requested_at)
    values (nextval('public_appointment_id_seq'), v_mine, v_service, 'Clienta 3', '2030-01-07T10:00',
            'REQUESTED', 'SELF', now());
  else
    raise notice 'OMITIDA 3: este entorno ya tiene la configuración de avisos';
  end if;

  -- 4 · Con configuración, una solicitud encola UNA llamada a la función; una
  --     cita que agenda la dueña (PENDING) no avisa a nadie.
  if not v_had_cfg then
    perform vault.create_secret('https://avisos.example/notify', 'notify_new_booking_url');
    perform vault.create_secret('secreto-de-prueba', 'notify_new_booking_secret');
  end if;
  select coalesce(max(id), 0) into v_queue_max from net.http_request_queue;

  insert into appointment (id, business_id, service_id, client, datetime, status, source, requested_at)
  values (nextval('public_appointment_id_seq'), v_mine, v_service, 'Clienta 4', '2030-01-07T11:00',
          'REQUESTED', 'SELF', now());
  insert into appointment (id, business_id, service_id, client, datetime, status)
  values (nextval('public_appointment_id_seq'), v_mine, v_service, 'Clienta 4b', '2030-01-07T12:00', 'PENDING');

  select count(*) into v_count from net.http_request_queue where id > v_queue_max;
  if v_count <> 1 then
    raise exception 'FALLÓ 4: se encolaron % llamadas, se esperaba 1', v_count;
  end if;

  if not v_had_cfg then
    delete from vault.secrets where name in ('notify_new_booking_url', 'notify_new_booking_secret');
    delete from net.http_request_queue where id > v_queue_max;
  end if;

  delete from business where id in (v_mine, v_foreign);
end $$;

-- 5 · Desde el cliente, la dueña solo ve SUS suscripciones; y no puede
--     insertar directo, saltándose la función que comprueba la membresía.
do $$
declare v_uid uuid; v_ok boolean := false;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from push_subscription where user_id <> v_uid) then
    raise exception 'FALLÓ 5: la dueña ve suscripciones de otras personas';
  end if;
  begin
    insert into push_subscription (business_id, user_id, endpoint, p256dh, auth)
    values (1, v_uid, 'https://push.example/prueba-5', 'x', 'y');
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FALLÓ 5: se pudo insertar directo, saltándose save_push_subscription';
  end if;
end $$;

-- 6 · Superficie cero desde fuera. `revoke ... from public` no basta en
--     Supabase: sus privilegios por defecto dan EXECUTE a anon y authenticated.
--     Cazó 20260927000001; lo corrige 20260927000002.
do $$
begin
  if has_function_privilege('anon', 'notify_new_booking()', 'execute')
     or has_function_privilege('authenticated', 'notify_new_booking()', 'execute') then
    raise exception 'FALLÓ 6: el disparador se puede llamar por RPC';
  end if;
  if has_function_privilege('anon', 'save_push_subscription(bigint,text,text,text)', 'execute') then
    raise exception 'FALLÓ 6: alguien sin sesión puede llamar a save_push_subscription';
  end if;
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
              where e.extname = 'pg_net' and n.nspname = 'public') then
    raise exception 'FALLÓ 6: pg_net está en public';
  end if;
end $$;

select 'VERDE: las 6 aserciones pasaron' as resultado;
