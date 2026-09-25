-- Regresión: la dueña cambia su dirección pública y la anterior sigue llevando
-- a su negocio. Ver odd/tasks/editable-public-slug.md.
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP (`execute_sql`) o psql. Pégalo entero.
--   NO corre en CI: el workflow solo ejecuta vitest, sin base de datos.
--
-- VALIDADO CONTRA UNA REGRESIÓN REAL (2026-09-23)
--   La aserción 1 no comprueba solo que la dirección cambie: comprueba que
--   cambie la DEL NEGOCIO QUE SE PIDIÓ. Cazó la primera versión de
--   `set_public_slug`, que deducía el negocio con un `limit 1` sobre las
--   membresías y, con una dueña en más de un negocio, cambiaba el equivocado
--   devolviendo el slug nuevo como si hubiera funcionado.
--
-- Trabaja sobre negocios de prueba (999xxx / los que asigne la secuencia) y los
-- borra al final; el borrado en cascada se lleva política, membresía e historial.

do $$
declare
  v_uid   uuid;
  v_id_a  bigint;
  v_id_b  bigint;
  v_slug  text;
  v_ok    boolean;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  if v_uid is null then
    raise exception 'FALLÓ preparación: no hay usuario en auth.users con el que impersonar a la dueña';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  v_id_a := create_business('PRUEBA Slug A', '#e11d48', 'prueba-slug-a');
  v_id_b := create_business('PRUEBA Slug B', '#e11d48', 'prueba-slug-b');
  update booking_policy set enabled = true where business_id in (v_id_a, v_id_b);

  -- 1 · Cambia la dirección DEL NEGOCIO QUE SE PIDE, no de otro.
  v_slug := set_public_slug(v_id_a, 'prueba-slug-a-nueva');
  if v_slug <> 'prueba-slug-a-nueva' then
    raise exception 'FALLÓ 1: devolvió "%"', v_slug;
  end if;
  select public_slug into v_slug from booking_policy where business_id = v_id_a;
  if v_slug <> 'prueba-slug-a-nueva' then
    raise exception 'FALLÓ 1: en la tabla quedó "%"', v_slug;
  end if;
  select public_slug into v_slug from booking_policy where business_id = v_id_b;
  if v_slug <> 'prueba-slug-b' then
    raise exception 'FALLÓ 1: le cambió la dirección al negocio equivocado, B quedó en "%"', v_slug;
  end if;

  -- 2 · La anterior sigue llevando al negocio. Es todo el punto del cambio.
  if resolve_public_slug('prueba-slug-a') is distinct from 'prueba-slug-a-nueva' then
    raise exception 'FALLÓ 2: la dirección anterior quedó muerta; las clientas que la guardaron se pierden';
  end if;

  -- 3 · Otro negocio no puede quedarse con una dirección abandonada: heredaría
  --     el tráfico que repartió el primero.
  v_ok := false;
  begin
    perform set_public_slug(v_id_b, 'prueba-slug-a');
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FALLÓ 3: B se quedó con la dirección que A abandonó';
  end if;

  -- 4 · Formato inválido, rechazado.
  v_ok := false;
  begin
    perform set_public_slug(v_id_a, 'Salón Rosa');
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FALLÓ 4: se aceptó una dirección con mayúsculas, acentos y espacios';
  end if;

  -- 5 · Volver a una propia antigua la reactiva y la saca del historial.
  perform set_public_slug(v_id_a, 'prueba-slug-a');
  if exists (select 1 from booking_slug_history where slug = 'prueba-slug-a') then
    raise exception 'FALLÓ 5: volvió a estar activa pero sigue listada como abandonada';
  end if;

  delete from business where id in (v_id_a, v_id_b);
end $$;

-- 6 · El grant por columna: sin esto la función sería una sugerencia y el
--     historial se quedaría cojo cada vez que alguien escribiera directo.
do $$
declare v_uid uuid; v_ok boolean := false;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  execute 'set local role authenticated';
  begin
    update booking_policy set public_slug = 'saltandome-la-funcion' where business_id = 1;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FALLÓ 6: se pudo escribir public_slug directo, saltándose la función';
  end if;
end $$;

select 'VERDE: las 6 aserciones pasaron' as resultado;
