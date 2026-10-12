-- Regresión de P4 (odd/tasks/payments-and-receipt.md): datos del recibo.
-- Ver supabase/migrations/20261010000011_business_receipt_profile.sql.
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (faltan las columnas).
--
-- QUÉ PRUEBA
--   1 · Una miembro actualiza dirección, teléfono y logo de SU negocio.
--   2 · Una no miembro no toca el negocio ajeno (0 filas, INVARIANTE 1).
--   3 · Longitudes: dirección <= 200, teléfono <= 40 (check).
--   4 · `name` y `plan` siguen sin poderse escribir (grant por columna).
--   5 · set_my_display_name solo cambia la fila propia; vacío lo borra; > 60 se rechaza.
--   6 · business_member_names devuelve los nombres del propio negocio y rechaza el ajeno.
--   7 · complete_appointment guarda charged_by = quien cobró.
--   8 · Storage: las policies de escritura existen y no hay una de lectura (listaría
--       el bucket); una miembro sube bajo `<su negocio>/` y NO bajo la carpeta de otro
--       negocio ni sin carpeta numérica. Los inserts se revierten (Storage prohíbe
--       borrar con SQL).
--       Si el stack no trae `storage`, esa parte se omite con un aviso (no falla).
--
-- Usuarias propias: ...0009ba, ...0009bb y ...0009bc. Datos 9997xx. Se borran al final.

do $$
declare
  v_uid   uuid := '00000000-0000-0000-0000-0000000009ba';
  v_uid2  uuid := '00000000-0000-0000-0000-0000000009bb';
  v_uid3  uuid := '00000000-0000-0000-0000-0000000009bc';
  v_biz   bigint;
  v_otro  bigint;
  v_svc   bigint := 999711;
  v_apt   bigint := 999721;
  v_rows  integer;
  v_msg   text;
  v_txt   text;
  v_cnt   integer;
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'business' and column_name = 'address')
     or to_regprocedure('public.set_my_display_name(bigint,text)') is null then
    raise exception 'FALLÓ 0: faltan las columnas o RPC del recibo. ¿Aplicaste la migración?';
  end if;

  delete from business where created_by in (v_uid, v_uid2, v_uid3);
  delete from auth.users where id in (v_uid, v_uid2, v_uid3);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid,  'authenticated', 'authenticated', 'prueba-ba@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-bb@citelis.test', now(), now()),
    (v_uid3, 'authenticated', 'authenticated', 'prueba-bc@citelis.test', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_biz := create_business('PRUEBA Recibo', '#e11d48', 'prueba-recibo');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_otro := create_business('PRUEBA Recibo Ajeno', '#e11d48', 'prueba-recibo-ajeno');
  -- v_uid3 es una segunda miembro del negocio propio.
  insert into business_member (user_id, business_id) values (v_uid3, v_biz);

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc, v_biz, 'Cejas', 5000, 1000, null, 30, false);

  -- ── Hablando como authenticated (sin esto la RLS no se evalúa) ───────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  execute 'set local role authenticated';

  -- 1 · La miembro guarda los datos del recibo.
  update business set address = 'Calle 1 #23, Centro', phone = '809-555-0101', logo_path = v_biz || '/logo-1.png'
   where id = v_biz;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FALLÓ 1: el UPDATE de los datos del recibo afectó % filas', v_rows;
  end if;
  select address into v_txt from business where id = v_biz;
  if v_txt is distinct from 'Calle 1 #23, Centro' then
    raise exception 'FALLÓ 1: la dirección quedó en "%"', coalesce(v_txt, '(nula)');
  end if;

  -- 2 · INVARIANTE 1: el negocio ajeno no se toca.
  update business set address = 'Hackeada' where id = v_otro;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALLÓ 2: viola INVARIANTE 1, se escribió sobre % negocio(s) ajeno(s)', v_rows;
  end if;

  -- 3 · Longitudes.
  begin
    update business set address = repeat('x', 201) where id = v_biz; v_msg := null;
  exception when check_violation then v_msg := 'check'; end;
  if v_msg is distinct from 'check' then raise exception 'FALLÓ 3: dirección de 201 letras aceptada'; end if;
  begin
    update business set phone = repeat('9', 41) where id = v_biz; v_msg := null;
  exception when check_violation then v_msg := 'check'; end;
  if v_msg is distinct from 'check' then raise exception 'FALLÓ 3: teléfono de 41 caracteres aceptado'; end if;

  -- 4 · name y plan siguen cerrados.
  begin
    update business set name = 'Otro nombre' where id = v_biz; v_msg := null;
  exception when insufficient_privilege then v_msg := 'denegado'; end;
  if v_msg is distinct from 'denegado' then raise exception 'FALLÓ 4: la miembro pudo cambiar `name`'; end if;
  begin
    update business set plan = 'pro' where id = v_biz; v_msg := null;
  exception when insufficient_privilege then v_msg := 'denegado'; end;
  if v_msg is distinct from 'denegado' then raise exception 'FALLÓ 4: la miembro pudo cambiar `plan`'; end if;

  -- 5 · Nombre visible: solo la fila propia.
  perform set_my_display_name(v_biz, '  Ana  ');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid3)::text, true);
  perform set_my_display_name(v_biz, 'Beta');
  execute 'reset role';
  select display_name into v_txt from business_member where business_id = v_biz and user_id = v_uid;
  if v_txt is distinct from 'Ana' then
    raise exception 'FALLÓ 5: el nombre de la primera quedó en "%" (¿sin recortar o pisado?)', coalesce(v_txt, '(nulo)');
  end if;
  select display_name into v_txt from business_member where business_id = v_biz and user_id = v_uid3;
  if v_txt is distinct from 'Beta' then
    raise exception 'FALLÓ 5: el nombre de la segunda quedó en "%"', coalesce(v_txt, '(nulo)');
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  execute 'set local role authenticated';
  -- Sobre un negocio ajeno: rechazado.
  begin
    perform set_my_display_name(v_otro, 'Intrusa'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Ese negocio no es tuyo.' then
    raise exception 'FALLÓ 5: nombre en negocio ajeno dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform set_my_display_name(v_biz, repeat('n', 61)); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El nombre es demasiado largo (máximo 60 letras).' then
    raise exception 'FALLÓ 5: nombre de 61 letras dio "%"', coalesce(v_msg, 'éxito');
  end if;
  -- Sin policy de UPDATE en la tabla: el UPDATE directo no cambia nada.
  begin
    update business_member set display_name = 'Directo' where business_id = v_biz and user_id = v_uid;
    get diagnostics v_rows = row_count;
  exception when insufficient_privilege then v_rows := 0; end;
  if v_rows <> 0 then raise exception 'FALLÓ 5: se pudo actualizar business_member directo'; end if;
  -- Vacío borra el nombre.
  perform set_my_display_name(v_biz, '   ');
  select display_name into v_txt from business_member where business_id = v_biz and user_id = v_uid;
  if v_txt is not null then raise exception 'FALLÓ 5: un nombre vacío no lo borró ("%")', v_txt; end if;
  perform set_my_display_name(v_biz, 'Ana');

  -- 6 · Nombres del propio negocio; el ajeno se rechaza.
  select count(*) into v_cnt from business_member_names(v_biz) where display_name in ('Ana', 'Beta');
  if v_cnt <> 2 then raise exception 'FALLÓ 6: business_member_names devolvió % nombres, esperaba 2', v_cnt; end if;
  begin
    perform * from business_member_names(v_otro); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Ese negocio no es tuyo.' then
    raise exception 'FALLÓ 6: nombres del negocio ajeno dieron "%"', coalesce(v_msg, 'éxito');
  end if;

  -- 7 · charged_by: quien cobra queda registrada (la segunda miembro cobra).
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  perform schedule_appointment(v_biz, v_apt, 'Clienta', '2026-10-12T10:00', null, null, array[v_svc], null);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid3)::text, true);
  perform complete_appointment(v_biz, v_apt, 5000, 1000, 4000,
    '[{"service_id":999711,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb, '[]'::jsonb);
  if (select charged_by from appointment where id = v_apt) is distinct from v_uid3 then
    raise exception 'FALLÓ 7: charged_by no es quien cobró';
  end if;

  -- 8 · Storage.
  if to_regclass('storage.objects') is null then
    raise notice 'AVISO 8: no hay esquema storage en este stack; aserciones de bucket omitidas.';
  else
    if not exists (select 1 from storage.buckets where id = 'business-logos' and public) then
      raise exception 'FALLÓ 8: falta el bucket público business-logos';
    end if;
    select count(*) into v_cnt from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname in ('business_logos_insert', 'business_logos_update', 'business_logos_delete',
                          'business_logos_member_select');
    if v_cnt <> 4 then raise exception 'FALLÓ 8: faltan policies de business-logos (% de 4)', v_cnt; end if;
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                and policyname in ('business_logos_insert', 'business_logos_update', 'business_logos_delete',
                                   'business_logos_member_select')
                and coalesce(qual, '') || coalesce(with_check, '') not like '%is_member%') then
      raise exception 'FALLÓ 8: una policy de escritura del bucket no exige membresía';
    end if;
    -- Sin policy de lectura: el bucket público sirve cada archivo por su URL, y una
    -- policy SELECT para anon permitiría LISTAR los logos de todos los negocios.
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                and policyname = 'business_logos_read') then
      raise exception 'FALLÓ 8: existe una policy de lectura que permite listar el bucket';
    end if;
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                and policyname like 'business_logos%' and 'anon' = any (roles)) then
      raise exception 'FALLÓ 8: anon tiene una policy sobre el bucket de logos';
    end if;

    -- Comportamiento real. Todo dentro de un sub-bloque que se REVIERTE al final:
    -- Storage prohíbe borrar de sus tablas con SQL, así que nada de lo que se sube
    -- aquí puede quedar escrito.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
      execute 'set local role authenticated';
      begin
        insert into storage.objects (bucket_id, name, owner)
        values ('business-logos', v_biz || '/logo-test.png', v_uid);
        v_msg := 'ok';
      exception
        when insufficient_privilege then v_msg := 'denegado';
        when others then v_msg := 'otro:' || sqlerrm;
      end;
      if v_msg = 'denegado' then
        raise exception 'FALLÓ 8: la miembro no pudo subir bajo la carpeta de su negocio';
      elsif v_msg like 'otro:%' then
        raise notice 'AVISO 8: no se pudo simular el insert en storage.objects (%); solo se verificaron las definiciones.', v_msg;
      else
        -- Subir en la carpeta de otro negocio, o sin carpeta numérica: rechazado.
        begin
          insert into storage.objects (bucket_id, name, owner)
          values ('business-logos', v_otro || '/logo-test.png', v_uid); v_msg := 'ok';
        exception when insufficient_privilege then v_msg := 'denegado'; end;
        if v_msg is distinct from 'denegado' then
          raise exception 'FALLÓ 8: viola INVARIANTE 1, subió un logo en la carpeta de otro negocio';
        end if;
        begin
          insert into storage.objects (bucket_id, name, owner)
          values ('business-logos', 'abc/logo-test.png', v_uid); v_msg := 'ok';
        exception when insufficient_privilege then v_msg := 'denegado'; end;
        if v_msg is distinct from 'denegado' then
          raise exception 'FALLÓ 8: subió un logo bajo una carpeta no numérica';
        end if;
        begin
          insert into storage.objects (bucket_id, name, owner)
          values ('business-logos', 'suelto.png', v_uid); v_msg := 'ok';
        exception when insufficient_privilege then v_msg := 'denegado'; end;
        if v_msg is distinct from 'denegado' then
          raise exception 'FALLÓ 8: subió un logo sin carpeta de negocio';
        end if;
        -- Una no miembro (la dueña del otro negocio) no puede subir en el nuestro.
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
        begin
          insert into storage.objects (bucket_id, name, owner)
          values ('business-logos', v_biz || '/logo-intruso.png', v_uid2); v_msg := 'ok';
        exception when insufficient_privilege then v_msg := 'denegado'; end;
        if v_msg is distinct from 'denegado' then
          raise exception 'FALLÓ 8: una no miembro subió un logo al negocio ajeno';
        end if;
      end if;
      raise exception 'REVERTIR_8';
    exception when others then
      if sqlerrm <> 'REVERTIR_8' then raise; end if;
    end;
  end if;

  -- Limpieza (siempre como propietario).
  execute 'reset role';
  delete from business where id in (v_biz, v_otro);
  delete from auth.users where id in (v_uid, v_uid2, v_uid3);
end $$;

select 'VERDE: las aserciones de datos del recibo pasaron' as resultado;
