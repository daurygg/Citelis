-- Regresión de T1 de odd/tasks/client-directory.md: registro de clientas por negocio.
-- Ver supabase/migrations/20261103000001_client_directory.sql.
--
-- CÓMO CORRERLO
--   psql, DESPUÉS de las migraciones. Crea sus propios datos (ids 9999xx) y los borra al final.
--
-- QUÉ PRUEBA
--   0 · existen la tabla `client`, `appointment.client_id` y UNA sola `schedule_appointment`.
--   1 · RLS: la dueña ve e inserta clientas de SU negocio y no las de otro (INVARIANTE 1);
--       `anon` no accede a la tabla.
--   2 · agendar con teléfono nuevo crea la clienta y enlaza la cita.
--   3 · agendar con el mismo teléfono con otro formato reutiliza la clienta.
--   4 · agendar con `p_client_id` de OTRO negocio falla y no deja cita.
--   5 · agendar con `p_client_id` propio enlaza y hereda el teléfono si la cita no trae.
--   6 · agendar sin teléfono ni clienta crea una clienta sin teléfono.
--   7 · reserva pública: crea la clienta, y con el mismo teléfono NO la renombra.
--   8 · relleno: una clienta por (negocio, teléfono normalizado) con el nombre más reciente;
--       las citas sin teléfono quedan sin enlace.
--   9 · permisos: `anon` no ejecuta schedule_appointment; las llamadas de 7 y 8 argumentos
--       siguen funcionando.
--  10 · código de país: "+1 809…", "1-809…" y "809…" son la misma clienta (agendando, por el
--       portal y con una clienta ya existente, que es el camino del `on conflict`).
--  11 · cita sin teléfono: reutiliza a la clienta sin teléfono del mismo nombre (sin
--       mayúsculas ni espacios de más; la más antigua si hay varias); otro nombre crea otra.
--       La carrera real entre dos transacciones no se puede simular en un solo script: aquí
--       se cubre que la clienta ya existente se reutiliza en vez de chocar con el índice.

do $$
declare
  v_uid     uuid := '00000000-0000-0000-0000-0000000009f1';
  v_uid2    uuid := '00000000-0000-0000-0000-0000000009f2';
  v_biz     bigint;
  v_otro    bigint;
  v_svc     bigint := 999931;
  v_svc_o   bigint := 999932;
  v_slug    text   := 'prueba-clientas';
  v_fecha   text;
  v_c1      bigint;
  v_c_o     bigint;
  v_cid     bigint;
  v_row     appointment%rowtype;
  v_n       integer;
  v_ok      boolean;
  v_msg     text;
  v_name    text;
  v_a       bigint;
  v_b       bigint;
begin
  -- 0 · La estructura existe y no hay sobrecargas de schedule_appointment.
  if to_regclass('public.client') is null then
    raise exception 'FALLÓ 0: la tabla client no existe. ¿Aplicaste la migración?';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'appointment' and column_name = 'client_id') then
    raise exception 'FALLÓ 0: appointment.client_id no existe';
  end if;
  select count(*) into v_n from pg_proc where proname = 'schedule_appointment' and pronamespace = 'public'::regnamespace;
  if v_n <> 1 then
    raise exception 'FALLÓ 0: hay % firmas de schedule_appointment (debe ser 1, sin sobrecargas)', v_n;
  end if;

  -- Usuarias propias; limpieza previa por si una corrida murió a medias.
  delete from business where created_by in (v_uid, v_uid2);
  delete from auth.users where id in (v_uid, v_uid2);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid,  'authenticated', 'authenticated', 'prueba-cd1@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-cd2@citelis.test', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_biz := create_business('PRUEBA Clientas', '#e11d48', v_slug);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_otro := create_business('PRUEBA Clientas Ajeno', '#e11d48', 'prueba-clientas-ajeno');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc,   v_biz,  'Cejas', 5000, 1000, null, 30, false),
         (v_svc_o, v_otro, 'Ajeno', 3000,  100, null, 30, false);
  update booking_policy
     set enabled = true, min_notice_hours = 0, max_horizon_days = 365, buffer_min = 0,
         max_requests_per_phone_per_day = 20
   where business_id = v_biz;
  insert into business_hours (id, business_id, weekday, opens_at, closes_at)
  select 999940 + d, v_biz, d, '08:00', '20:00' from generate_series(0, 6) d;
  v_fecha := to_char((now() at time zone 'America/Santo_Domingo')::date + 3, 'YYYY-MM-DD');

  -- Una clienta ajena (fixture directo, como superusuaria) para las pruebas 1 y 4.
  insert into client (business_id, name, phone) values (v_otro, 'Clienta Ajena', '809-555-0000')
  returning id into v_c_o;

  -- 1 · RLS. Como dueña de v_biz.
  execute 'set local role authenticated';
  insert into client (business_id, name, phone) values (v_biz, 'Propia', '829-111-0001')
  returning id into v_c1;
  if not exists (select 1 from client where id = v_c1) then
    raise exception 'FALLÓ 1: la dueña no ve a su propia clienta';
  end if;
  if exists (select 1 from client where id = v_c_o) then
    raise exception 'FALLÓ 1: viola INVARIANTE 1, la dueña ve una clienta de otro negocio';
  end if;
  begin
    insert into client (business_id, name) values (v_otro, 'Intrusa');
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'new row violates row-level security policy for table "client"' then
    raise exception 'FALLÓ 1: crear una clienta en otro negocio dio "%"', coalesce(v_msg, 'éxito');
  end if;
  update client set name = 'Hackeada' where id = v_c_o;
  execute 'reset role';
  select name into v_name from client where id = v_c_o;
  if v_name <> 'Clienta Ajena' then
    raise exception 'FALLÓ 1: la dueña editó una clienta de otro negocio';
  end if;
  -- Teléfono duplicado (otro formato) en el mismo negocio: la unicidad lo rechaza.
  begin
    insert into client (business_id, name, phone) values (v_biz, 'Duplicada', '(829) 111 0001');
    v_msg := null;
  exception when unique_violation then v_msg := 'unique'; end;
  if v_msg is distinct from 'unique' then
    raise exception 'FALLÓ 1: se permitió un teléfono repetido en el mismo negocio';
  end if;
  -- Mismo teléfono en OTRO negocio sí se permite (la unicidad es por negocio).
  insert into client (business_id, name, phone) values (v_otro, 'Misma en otro', '8291110001');
  -- `anon` no tiene acceso.
  if has_table_privilege('anon', 'public.client', 'select') then
    raise exception 'FALLÓ 1: anon puede leer client';
  end if;

  -- 2 · Teléfono nuevo: crea la clienta y enlaza.
  perform schedule_appointment(v_biz, 999951, 'Ana', '2026-10-12T10:00', null, null, array[v_svc],
                               null, '829-222-0002', null);
  select * into v_row from appointment where id = 999951;
  if v_row.client_id is null or v_row.client_phone is distinct from '829-222-0002' then
    raise exception 'FALLÓ 2: la cita quedó sin clienta o sin teléfono (client_id %, phone %)',
      v_row.client_id, v_row.client_phone;
  end if;
  select count(*) into v_n from client
   where business_id = v_biz and phone_digits = '8292220002' and name = 'Ana' and id = v_row.client_id;
  if v_n <> 1 then raise exception 'FALLÓ 2: no se creó la clienta Ana con su teléfono'; end if;

  -- 3 · Mismo teléfono con otro formato: reutiliza, sin duplicar ni renombrar.
  perform schedule_appointment(v_biz, 999952, 'Ana María', '2026-10-12T11:00', null, null, array[v_svc],
                               null, ' (829) 222 0002 ', null);
  select client_id into v_cid from appointment where id = 999952;
  if v_cid is distinct from v_row.client_id then
    raise exception 'FALLÓ 3: no reutilizó la clienta existente';
  end if;
  select count(*) into v_n from client where business_id = v_biz and phone_digits = '8292220002';
  if v_n <> 1 then raise exception 'FALLÓ 3: se duplicó la clienta (%)', v_n; end if;
  select name into v_name from client where id = v_cid;
  if v_name <> 'Ana' then raise exception 'FALLÓ 3: se renombró a la clienta (%)', v_name; end if;

  -- 4 · client_id de OTRO negocio: rechazado y sin cita.
  v_ok := false;
  begin
    perform schedule_appointment(v_biz, 999953, 'Intrusa', '2026-10-12T12:00', null, null, array[v_svc],
                                 null, null, v_c_o);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALLÓ 4: se agendó con una clienta de otro negocio'; end if;
  select count(*) into v_n from appointment where id = 999953;
  if v_n <> 0 then raise exception 'FALLÓ 4: quedó una cita tras el rechazo'; end if;

  -- 5 · client_id propio: enlaza y hereda el teléfono.
  perform schedule_appointment(v_biz, 999954, 'Propia', '2026-10-12T13:00', null, null, array[v_svc],
                               null, null, v_c1);
  select * into v_row from appointment where id = 999954;
  if v_row.client_id is distinct from v_c1 or v_row.client_phone is distinct from '829-111-0001' then
    raise exception 'FALLÓ 5: no enlazó o no heredó el teléfono (client_id %, phone %)',
      v_row.client_id, v_row.client_phone;
  end if;

  -- 6 · Sin teléfono ni clienta: crea una clienta sin teléfono.
  perform schedule_appointment(v_biz, 999955, 'Sin Teléfono', '2026-10-12T14:00', null, null, array[v_svc]);
  select * into v_row from appointment where id = 999955;
  select count(*) into v_n from client
   where id = v_row.client_id and business_id = v_biz and phone is null and name = 'Sin Teléfono';
  if v_row.client_phone is not null or v_n <> 1 then
    raise exception 'FALLÓ 6: no creó una clienta sin teléfono enlazada';
  end if;

  -- 7 · Reserva pública: crea la clienta; con el mismo teléfono no la renombra.
  v_cid := public_request_booking(v_slug, array[v_svc], v_fecha || 'T10:00', '  Luz  ', '849-333-0003');
  select * into v_row from appointment where id = v_cid;
  select name into v_name from client where id = v_row.client_id;
  if v_row.client_id is null or v_name <> 'Luz' or v_row.business_id <> v_biz then
    raise exception 'FALLÓ 7a: la reserva pública no creó la clienta (id %, nombre %)', v_row.client_id, v_name;
  end if;
  v_c1 := v_row.client_id;
  v_cid := public_request_booking(v_slug, array[v_svc], v_fecha || 'T12:00', 'Otra Luz', '(849) 333-0003');
  select * into v_row from appointment where id = v_cid;
  select name into v_name from client where id = v_row.client_id;
  if v_row.client_id is distinct from v_c1 or v_name <> 'Luz' then
    raise exception 'FALLÓ 7b: la reserva pública duplicó o renombró a la clienta (id %, nombre %)',
      v_row.client_id, v_name;
  end if;
  if v_row.client <> 'Otra Luz' then
    raise exception 'FALLÓ 7b: la cita debe conservar el nombre que se escribió en ella';
  end if;

  -- 8 · Relleno: citas antiguas con teléfono y sin enlace (como existían antes de la migración).
  insert into appointment (id, business_id, service_id, client, client_phone, datetime, status) values
    (999961, v_biz, v_svc, 'Vieja Uno',  '809-444-0004', '2026-01-10T10:00', 'COMPLETED'),
    (999962, v_biz, v_svc, 'Nueva Uno',  '(809) 444 0004', '2026-02-10T10:00', 'COMPLETED'),
    (999963, v_biz, v_svc, 'Sin Tel',    null,            '2026-02-11T10:00', 'COMPLETED'),
    (999964, v_biz, v_svc, 'Vacía',      '   ',           '2026-02-12T10:00', 'COMPLETED'),
    (999965, v_otro, v_svc_o, 'Otro Neg', '809-444-0004', '2026-03-10T10:00', 'COMPLETED');
  perform backfill_client_directory();
  select count(*) into v_n from client where business_id = v_biz and phone_digits = '8094440004';
  if v_n <> 1 then raise exception 'FALLÓ 8a: relleno creó % clientas para el mismo teléfono', v_n; end if;
  select c.name into v_name from appointment a join client c on c.id = a.client_id where a.id = 999961;
  if v_name is distinct from 'Nueva Uno' then
    raise exception 'FALLÓ 8b: el relleno debe usar el nombre de la cita más reciente (%)', v_name;
  end if;
  select count(*) into v_n from appointment where id in (999961, 999962) and client_id is not null
     and client_id = (select client_id from appointment where id = 999961);
  if v_n <> 2 then raise exception 'FALLÓ 8c: las citas del mismo teléfono no comparten clienta'; end if;
  select count(*) into v_n from appointment where id in (999963, 999964) and client_id is not null;
  if v_n <> 0 then raise exception 'FALLÓ 8d: citas sin teléfono quedaron enlazadas'; end if;
  select count(*) into v_n from appointment a join client c on c.id = a.client_id
   where a.id = 999965 and c.business_id = v_otro;
  if v_n <> 1 then raise exception 'FALLÓ 8e: el mismo teléfono en otro negocio debe dar otra clienta de ese negocio'; end if;
  -- Idempotente: segunda corrida no duplica.
  select count(*) into v_n from client;
  perform backfill_client_directory();
  if (select count(*) from client) <> v_n then
    raise exception 'FALLÓ 8f: el relleno no es idempotente';
  end if;

  -- 9 · Permisos y compatibilidad de firmas.
  if has_function_privilege('anon', 'public.schedule_appointment(bigint,bigint,text,text,bigint,bigint,bigint[],text,text,bigint)', 'execute') then
    raise exception 'FALLÓ 9: anon puede ejecutar schedule_appointment';
  end if;
  if not has_function_privilege('authenticated', 'public.schedule_appointment(bigint,bigint,text,text,bigint,bigint,bigint[],text,text,bigint)', 'execute') then
    raise exception 'FALLÓ 9: authenticated no puede ejecutar schedule_appointment';
  end if;
  perform schedule_appointment(v_biz, 999956, 'Siete', '2026-10-12T15:00', null, null, array[v_svc]);
  perform schedule_appointment(v_biz, 999957, 'Ocho', '2026-10-12T16:00', null, null, array[v_svc], 'cash');

  -- 10 · Código de país. La función es la regla única.
  if client_phone_digits('+1 809 555 1234') is distinct from '8095551234'
     or client_phone_digits('1-809-555-1234') is distinct from '8095551234'
     or client_phone_digits('809-555-1234') is distinct from '8095551234'
     or client_phone_digits('1234567') is distinct from '1234567'
     or client_phone_digits('2 809 555 1234') is distinct from '28095551234'
     or client_phone_digits('---') is not null
     or client_phone_digits(null) is not null then
    raise exception 'FALLÓ 10a: client_phone_digits no normaliza como se esperaba';
  end if;
  -- "+1 809…" crea; "809…" y "1-809…" reutilizan a la misma clienta.
  perform schedule_appointment(v_biz, 999971, 'Marta', '2026-10-13T10:00', null, null, array[v_svc],
                               null, '+1 809 777 0005', null);
  perform schedule_appointment(v_biz, 999972, 'Marta Dos', '2026-10-13T11:00', null, null, array[v_svc],
                               null, '809-777-0005', null);
  perform schedule_appointment(v_biz, 999973, 'Marta Tres', '2026-10-13T12:00', null, null, array[v_svc],
                               null, '1-809-777-0005', null);
  select count(*) into v_n from client where business_id = v_biz and phone_digits = '8097770005';
  if v_n <> 1 then raise exception 'FALLÓ 10b: +1 / 1- / sin código crearon % clientas (debe ser 1)', v_n; end if;
  select count(distinct client_id) into v_n from appointment where id in (999971, 999972, 999973);
  if v_n <> 1 then raise exception 'FALLÓ 10b: las tres citas no comparten clienta'; end if;
  select name into v_name from client where business_id = v_biz and phone_digits = '8097770005';
  if v_name <> 'Marta' then raise exception 'FALLÓ 10b: se renombró a la clienta (%)', v_name; end if;
  -- Clienta que ya existe (guardada con +1, como si otra transacción la hubiera creado antes):
  -- la RPC la reutiliza en vez de chocar con el índice único.
  insert into client (business_id, name, phone) values (v_biz, 'Preexistente', '+1 (809) 888-0006')
  returning id into v_a;
  perform schedule_appointment(v_biz, 999974, 'Otro Nombre', '2026-10-13T13:00', null, null, array[v_svc],
                               null, '809 888 0006', null);
  select client_id into v_b from appointment where id = 999974;
  if v_b is distinct from v_a then raise exception 'FALLÓ 10c: no reutilizó a la clienta preexistente'; end if;
  select count(*) into v_n from client where business_id = v_biz and phone_digits = '8098880006';
  if v_n <> 1 then raise exception 'FALLÓ 10c: se duplicó la clienta preexistente'; end if;
  -- Portal: "+1 849…" encuentra a la clienta de "849-333-0003" (creada en la prueba 7).
  v_cid := public_request_booking(v_slug, array[v_svc], v_fecha || 'T14:00', 'Luz Tres', '+1 849 333 0003');
  select client_id into v_b from appointment where id = v_cid;
  select count(*) into v_n from client where business_id = v_biz and phone_digits = '8493330003';
  if v_n <> 1 or v_b is distinct from (select id from client where business_id = v_biz and phone_digits = '8493330003') then
    raise exception 'FALLÓ 10d: el portal duplicó a la clienta por el código de país (% clientas)', v_n;
  end if;

  -- 11 · Citas sin teléfono: reutilizan a la clienta sin teléfono del mismo nombre.
  perform schedule_appointment(v_biz, 999981, 'Rosa Díaz', '2026-10-14T10:00', null, null, array[v_svc]);
  perform schedule_appointment(v_biz, 999982, '  rosa   DÍAZ ', '2026-10-14T11:00', null, null, array[v_svc]);
  select count(*) into v_n from client
   where business_id = v_biz and phone is null and lower(btrim(name)) like 'rosa%';
  if v_n <> 1 then raise exception 'FALLÓ 11a: la misma clienta sin teléfono se duplicó (% filas)', v_n; end if;
  select count(distinct client_id) into v_n from appointment where id in (999981, 999982);
  if v_n <> 1 then raise exception 'FALLÓ 11a: las dos citas no comparten clienta'; end if;
  -- Otro nombre crea otra clienta.
  perform schedule_appointment(v_biz, 999983, 'Rosa Pérez', '2026-10-14T12:00', null, null, array[v_svc]);
  select count(*) into v_n from client
   where business_id = v_biz and phone is null and lower(btrim(name)) like 'rosa%';
  if v_n <> 2 then raise exception 'FALLÓ 11b: otro nombre debía crear otra clienta (% filas)', v_n; end if;
  -- Con varias del mismo nombre, gana la más antigua (menor id).
  insert into client (business_id, name, phone) values (v_biz, 'Elena Ruiz', null) returning id into v_a;
  insert into client (business_id, name, phone) values (v_biz, 'elena ruiz', null);
  perform schedule_appointment(v_biz, 999984, 'ELENA  RUIZ', '2026-10-14T13:00', null, null, array[v_svc]);
  select client_id into v_b from appointment where id = 999984;
  if v_b is distinct from v_a then raise exception 'FALLÓ 11c: no eligió la clienta más antigua'; end if;
  -- Una clienta del mismo nombre en OTRO negocio no se reutiliza (INVARIANTE 1).
  insert into client (business_id, name, phone) values (v_otro, 'Zoila Ajena', null) returning id into v_a;
  perform schedule_appointment(v_biz, 999985, 'Zoila Ajena', '2026-10-14T14:00', null, null, array[v_svc]);
  select client_id into v_b from appointment where id = 999985;
  if v_b = v_a or (select business_id from client where id = v_b) <> v_biz then
    raise exception 'FALLÓ 11d: reutilizó una clienta de otro negocio';
  end if;
  -- Una clienta CON teléfono del mismo nombre no cuenta como "sin teléfono".
  perform schedule_appointment(v_biz, 999986, 'Ana', '2026-10-14T15:00', null, null, array[v_svc]);
  select client_id into v_b from appointment where id = 999986;
  if (select phone from client where id = v_b) is not null then
    raise exception 'FALLÓ 11e: una cita sin teléfono se enlazó a una clienta con teléfono';
  end if;


  -- Limpieza: el borrado en cascada se lleva servicios, citas y clientas.
  delete from business where id in (v_biz, v_otro);
  delete from auth.users where id in (v_uid, v_uid2);
end $$;
