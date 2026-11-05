-- Regresión de odd/tasks/owner-profile.md: perfil de quien administra el negocio.
-- Ver supabase/migrations/20261105000001_owner_profile.sql
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (falta owner_profile_pending).
--
-- QUÉ PRUEBA
--   1 · create_business con el perfil completo lo guarda limpio y no queda pendiente.
--   2 · Un perfil incompleto o inválido rechaza el alta con el mensaje claro y no
--       crea nada (ni negocio ni perfil).
--   3 · create_business SIN perfil (front anterior) crea el negocio y lo deja pendiente;
--       save_owner_profile lo completa, y volver a guardarlo lo corrige (no duplica).
--   4 · Quien entró por invitación a un negocio con creador no tiene nada pendiente y
--       no puede guardar el perfil de otro.
--   5 · Un negocio antiguo sin creador conocido se le pide a quien es miembro; una vez
--       guardado, otro miembro no lo puede sobrescribir.
--   6 · Privacidad: authenticated/anon no pueden leer ni escribir la tabla.
--   7 · admin_list_businesses devuelve nombre, WhatsApp y tipo.
--
-- Usuarios propios: ...000ab1 a ...000ab6. Negocios "PRUEBA Perfil ...". Se borran al final.

do $$
declare
  v_a      uuid := '00000000-0000-0000-0000-000000000ab1';  -- registra con perfil
  v_b      uuid := '00000000-0000-0000-0000-000000000ab2';  -- registra con el front anterior
  v_c      uuid := '00000000-0000-0000-0000-000000000ab3';  -- invitada al negocio de B
  v_d      uuid := '00000000-0000-0000-0000-000000000ab4';  -- miembro de un negocio antiguo
  v_admin  uuid := '00000000-0000-0000-0000-000000000ab5';
  v_e      uuid := '00000000-0000-0000-0000-000000000ab6';  -- otro miembro del negocio antiguo
  v_biz_a  bigint;
  v_biz_b  bigint;
  v_old    bigint;
  v_code   text;
  v_msg    text;
  v_n      integer;
  v_row    record;
begin
  if to_regprocedure('public.owner_profile_pending()') is null then
    raise exception 'FALLÓ 0: falta owner_profile_pending. ¿Aplicaste la migración?';
  end if;
  if to_regprocedure('public.save_owner_profile(text,text,text)') is null then
    raise exception 'FALLÓ 0: falta save_owner_profile. ¿Aplicaste la migración?';
  end if;
  if to_regprocedure('public.create_business(text,text,text,text,text,text)') is null then
    raise exception 'FALLÓ 0: create_business no acepta el perfil. ¿Aplicaste la migración?';
  end if;
  if to_regprocedure('public.create_business(text,text,text)') is not null then
    raise exception 'FALLÓ 0: quedó la sobrecarga vieja create_business(text,text,text)';
  end if;

  -- Limpieza previa por si una corrida anterior murió a medias.
  delete from business where name like 'PRUEBA Perfil%';
  delete from platform_admin where user_id = v_admin;
  delete from auth.users where id in (v_a, v_b, v_c, v_d, v_e, v_admin);
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (v_a, 'authenticated', 'authenticated', 'prueba-ab1@citelis.test', now(), now()),
         (v_b, 'authenticated', 'authenticated', 'prueba-ab2@citelis.test', now(), now()),
         (v_c, 'authenticated', 'authenticated', 'prueba-ab3@citelis.test', now(), now()),
         (v_d, 'authenticated', 'authenticated', 'prueba-ab4@citelis.test', now(), now()),
         (v_admin, 'authenticated', 'authenticated', 'prueba-ab5@citelis.test', now(), now()),
         (v_e, 'authenticated', 'authenticated', 'prueba-ab6@citelis.test', now(), now());

  -- ── 1 · Alta con perfil completo ─────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_a)::text, true);
  v_biz_a := create_business('PRUEBA Perfil A', '#e11d48', 'prueba-perfil-a',
                             '  Rosa   Pérez ', ' 829-457-6475 ', 'salon');
  select * into v_row from business_owner_profile where business_id = v_biz_a;
  if v_row is null then raise exception 'FALLÓ 1: no se guardó el perfil'; end if;
  if v_row.owner_name <> 'Rosa Pérez' or v_row.owner_whatsapp <> '829-457-6475'
     or v_row.business_type <> 'salon' or v_row.user_id is distinct from v_a then
    raise exception 'FALLÓ 1: perfil guardado mal: % / % / % / %',
      v_row.owner_name, v_row.owner_whatsapp, v_row.business_type, v_row.user_id;
  end if;
  if owner_profile_pending() then raise exception 'FALLÓ 1: quedó pendiente tras registrarse con perfil'; end if;

  -- ── 2 · Perfil incompleto o inválido: no se crea nada ────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b)::text, true);
  v_msg := null;
  begin
    perform create_business('PRUEBA Perfil Malo', '#e11d48', 'prueba-perfil-malo', 'Luis Mota', null, 'barbershop');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Escribe tu WhatsApp.' then
    raise exception 'FALLÓ 2: sin WhatsApp el mensaje fue "%"', coalesce(v_msg, '(no hubo error)');
  end if;
  v_msg := null;
  begin
    perform create_business('PRUEBA Perfil Malo', '#e11d48', 'prueba-perfil-malo', 'Luis Mota', '12345', 'barbershop');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'El WhatsApp no es válido.' then
    raise exception 'FALLÓ 2: con WhatsApp inválido el mensaje fue "%"', coalesce(v_msg, '(no hubo error)');
  end if;
  v_msg := null;
  begin
    perform create_business('PRUEBA Perfil Malo', '#e11d48', 'prueba-perfil-malo', 'Luis Mota', '8094561234', 'restaurante');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Elige el tipo de negocio.' then
    raise exception 'FALLÓ 2: con tipo desconocido el mensaje fue "%"', coalesce(v_msg, '(no hubo error)');
  end if;
  if exists (select 1 from business where name = 'PRUEBA Perfil Malo') then
    raise exception 'FALLÓ 2: un alta rechazada dejó el negocio creado';
  end if;

  -- ── 3 · Front anterior: sin perfil, queda pendiente ──────────────────────
  v_biz_b := create_business('PRUEBA Perfil B', '#e11d48', 'prueba-perfil-b');
  if exists (select 1 from business_owner_profile where business_id = v_biz_b) then
    raise exception 'FALLÓ 3: se creó un perfil sin datos';
  end if;
  if not owner_profile_pending() then raise exception 'FALLÓ 3: el negocio sin perfil no quedó pendiente'; end if;
  perform save_owner_profile('Luis Mota', '+34 612 345 678', 'barbershop');
  if owner_profile_pending() then raise exception 'FALLÓ 3: sigue pendiente después de guardar'; end if;
  perform save_owner_profile('Luis A. Mota', '+34 612 345 678', 'spa');
  select count(*) into v_n from business_owner_profile where business_id = v_biz_b;
  if v_n <> 1 then raise exception 'FALLÓ 3: guardar dos veces dejó % filas', v_n; end if;
  if (select owner_name || '/' || business_type from business_owner_profile where business_id = v_biz_b)
     <> 'Luis A. Mota/spa' then
    raise exception 'FALLÓ 3: la corrección no se guardó';
  end if;

  -- ── 4 · Invitada: nada pendiente y no puede guardar ──────────────────────
  delete from business_owner_profile where business_id = v_biz_b;  -- B vuelve a estar pendiente
  v_code := create_invitation();                                    -- como B
  perform set_config('request.jwt.claims', json_build_object('sub', v_c)::text, true);
  perform redeem_invitation(v_code);
  if owner_profile_pending() then raise exception 'FALLÓ 4: a la invitada se le piden los datos del negocio'; end if;
  v_msg := null;
  begin
    perform save_owner_profile('Intrusa', '8094561234', 'other');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Solo quien administra el negocio puede completar estos datos.' then
    raise exception 'FALLÓ 4: la invitada guardó o el mensaje fue "%"', coalesce(v_msg, '(no hubo error)');
  end if;
  if exists (select 1 from business_owner_profile where business_id = v_biz_b) then
    raise exception 'FALLÓ 4: la invitada escribió el perfil de B';
  end if;

  -- ── 5 · Negocio antiguo sin creador conocido ─────────────────────────────
  v_old := nextval('business_id_seq');
  insert into business (id, name, plan, created_by) values (v_old, 'PRUEBA Perfil Antiguo', 'mvp', null);
  insert into business_member (user_id, business_id) values (v_d, v_old);
  perform set_config('request.jwt.claims', json_build_object('sub', v_d)::text, true);
  if not owner_profile_pending() then raise exception 'FALLÓ 5: al negocio antiguo no se le piden los datos'; end if;
  perform save_owner_profile('Ana Reyes', '8297770000', 'nails');
  if owner_profile_pending() then raise exception 'FALLÓ 5: sigue pendiente después de guardar'; end if;
  insert into business_member (user_id, business_id) values (v_e, v_old);
  perform set_config('request.jwt.claims', json_build_object('sub', v_e)::text, true);
  if owner_profile_pending() then raise exception 'FALLÓ 5: a otro miembro se le piden datos ya completos'; end if;
  v_msg := null;
  begin
    perform save_owner_profile('Otra Persona', '8291112222', 'other');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'Estos datos ya los completó otra persona del negocio.' then
    raise exception 'FALLÓ 5: otro miembro sobrescribió o el mensaje fue "%"', coalesce(v_msg, '(no hubo error)');
  end if;
  if (select owner_name from business_owner_profile where business_id = v_old) <> 'Ana Reyes' then
    raise exception 'FALLÓ 5: el perfil del negocio antiguo cambió';
  end if;

  -- ── 6 · Privacidad ───────────────────────────────────────────────────────
  if has_table_privilege('authenticated', 'public.business_owner_profile', 'SELECT')
     or has_table_privilege('authenticated', 'public.business_owner_profile', 'INSERT')
     or has_table_privilege('authenticated', 'public.business_owner_profile', 'UPDATE')
     or has_table_privilege('anon', 'public.business_owner_profile', 'SELECT') then
    raise exception 'FALLÓ 6: la API puede tocar la tabla del perfil directamente';
  end if;
  if has_function_privilege('anon', 'public.owner_profile_pending()', 'EXECUTE')
     or has_function_privilege('anon', 'public.save_owner_profile(text,text,text)', 'EXECUTE') then
    raise exception 'FALLÓ 6: anon puede ejecutar las funciones del perfil';
  end if;
  if has_function_privilege('authenticated', 'public.owner_profile_clean_name(text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.owner_profile_target()', 'EXECUTE') then
    raise exception 'FALLÓ 6: las funciones internas quedaron expuestas a la API';
  end if;

  -- ── 7 · El administrador ve el perfil ────────────────────────────────────
  insert into platform_admin (user_id) values (v_admin);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  select * into v_row from admin_list_businesses() where business_id = v_biz_a;
  if v_row.owner_name is distinct from 'Rosa Pérez' or v_row.owner_whatsapp is distinct from '829-457-6475'
     or v_row.business_type is distinct from 'salon' then
    raise exception 'FALLÓ 7: el admin ve % / % / %', v_row.owner_name, v_row.owner_whatsapp, v_row.business_type;
  end if;
  select * into v_row from admin_list_businesses() where business_id = v_biz_b;
  if v_row.owner_name is not null then raise exception 'FALLÓ 7: un negocio sin perfil muestra datos'; end if;

  -- Limpieza.
  delete from business where id in (v_biz_a, v_biz_b, v_old);
  delete from platform_admin where user_id = v_admin;
  delete from auth.users where id in (v_a, v_b, v_c, v_d, v_e, v_admin);
end $$;

select 'VERDE: el perfil se pide al registrarse o al entrar, solo a quien administra, y solo lo ve el admin' as resultado;
