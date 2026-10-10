-- Regresión: al crear un negocio nace su enlace público, con su nombre dentro.
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP (`execute_sql`) o psql. Pégalo entero.
--
-- QUÉ NO ES
--   Esto NO corre en CI: el workflow solo ejecuta vitest, sin base de datos.
--   Hay que lanzarlo a mano tras tocar `create_business`.
--
-- POR QUÉ EXISTE
--   El slug se armaba como `negocio-<id>` en el cliente, y la fila de
--   `booking_policy` no nacía hasta que la dueña tocaba un ajuste: hasta ese
--   momento no había enlace que enseñarle. Ver odd/tasks/public-link-identity.md.
--
--   El reparto: `slugifyBusinessName` (TS, con sus tests) decide lo BONITO;
--   `create_business` valida y decide lo ÚNICO, que es lo único que la base
--   puede saber. Este archivo prueba la segunda mitad.
--
-- Crea negocios de prueba y los borra al final (el borrado en cascada se lleva
-- su política y su membresía), así que no toca datos reales.

-- Usa SUS PROPIAS usuarias (una por negocio): cada cuenta solo puede crear un negocio
-- (20261010000005), así que no se puede impersonar siempre a la primera usuaria real.

do $$
declare
  v_uid    uuid;
  v_uid2   uuid;
  v_uid3   uuid;
  v_id_1   bigint;
  v_id_2   bigint;
  v_id_3   bigint;
  v_slug   text;
  v_open   boolean;
begin
  -- Usuarias propias de la prueba (ver cabecera); limpieza previa por si una corrida murió a medias.
  v_uid := '00000000-0000-0000-0000-0000000009b1';
  v_uid2 := '00000000-0000-0000-0000-0000000009b2';
  v_uid3 := '00000000-0000-0000-0000-0000000009b3';
  delete from business where created_by in (v_uid, v_uid2, v_uid3);
  delete from auth.users where id in (v_uid, v_uid2, v_uid3);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid, 'authenticated', 'authenticated', 'prueba-b1@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-b2@citelis.test', now(), now()),
    (v_uid3, 'authenticated', 'authenticated', 'prueba-b3@citelis.test', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  -- 1 · El nombre de la dueña acaba en su dirección.
  v_id_1 := create_business('PRUEBA Estética Roelis', '#e11d48', 'prueba-estetica-roelis');
  select public_slug, enabled into v_slug, v_open from booking_policy where business_id = v_id_1;
  if v_slug is null then
    raise exception 'FALLÓ 1: el negocio nació sin fila en booking_policy, no hay enlace que enseñar';
  end if;
  if v_slug <> 'prueba-estetica-roelis' then
    raise exception 'FALLÓ 1: el slug quedó en "%", esperaba "prueba-estetica-roelis"', v_slug;
  end if;

  -- 2 · El portal nace CERRADO: el enlace existe para enseñarlo, no para recibir.
  if v_open then
    raise exception 'FALLÓ 2: el portal nació abierto; la dueña no ha decidido todavía';
  end if;

  -- 3 · Dos negocios con el mismo nombre no pueden tumbar el alta.
  --     `public_slug` es UNIQUE, así que el segundo tiene que desempatar solo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_id_2 := create_business('PRUEBA Estética Roelis', '#e11d48', 'prueba-estetica-roelis');
  select public_slug into v_slug from booking_policy where business_id = v_id_2;
  if v_slug = 'prueba-estetica-roelis' then
    raise exception 'FALLÓ 3: el segundo negocio se quedó con el mismo slug que el primero';
  end if;
  if v_slug !~ '^prueba-estetica-roelis-[0-9]+$' then
    raise exception 'FALLÓ 3: el desempate quedó en "%", esperaba el nombre con un sufijo numérico', v_slug;
  end if;

  -- 4 · Un slug que no cumple el contrato no rompe el alta: cae al respaldo.
  --     (Nombre de solo símbolos, cliente viejo que no manda slug, o manipulado.)
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid3)::text, true);
  v_id_3 := create_business('PRUEBA ???', '#e11d48', 'NO Vale Esto');
  select public_slug into v_slug from booking_policy where business_id = v_id_3;
  if v_slug <> 'negocio-' || v_id_3 then
    raise exception 'FALLÓ 4: con un slug inválido quedó "%", esperaba "negocio-%"', v_slug, v_id_3;
  end if;

  -- Limpieza (cascade se lleva booking_policy y business_member).
  delete from business where id in (v_id_1, v_id_2, v_id_3);
  delete from auth.users where id in (v_uid, v_uid2, v_uid3);
end $$;

select 'VERDE: el enlace nace con el negocio y lleva su nombre' as resultado;
