-- Regresión: la dueña puede cambiar el color de su negocio y el cambio SE GUARDA.
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP (`execute_sql`) o psql. Pégalo entero.
--
-- QUÉ NO ES
--   Esto NO corre en CI: el workflow solo ejecuta vitest, sin base de datos.
--   Hay que lanzarlo a mano tras tocar las policies de `business`.
--
-- POR QUÉ EXISTE
--   `updateBusinessTheme` (src/lib/store/StoreContext.tsx) escribía contra una
--   tabla sin policy de UPDATE. RLS no devuelve error en ese caso: descarta la
--   escritura y afecta 0 filas. El cliente actualiza su estado optimista, la
--   dueña ve el color nuevo, y al recargar reaparece el viejo. Un fallo mudo,
--   que es justo el que un test tiene que hacer hablar.
--
--   Por eso la aserción mira `row_count` y no solo "que no lance": un UPDATE de
--   cero filas es exactamente el bug, y pasa sin excepción ninguna.
--
-- Trabaja sobre negocios propios (ids 999xxx) y borra todo al final, así que no
-- toca datos reales.

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Dos negocios: uno de la dueña y otro ajeno, para probar también el
-- aislamiento por tenant (INVARIANTE 1) en la misma pasada.
insert into business (id, name, plan, theme_color)
values (999998, 'PRUEBA COLOR · propio', 'mvp', '#e11d48')
    on conflict (id) do update set theme_color = '#e11d48';

insert into business (id, name, plan, theme_color)
values (999997, 'PRUEBA COLOR · ajeno', 'mvp', '#e11d48')
    on conflict (id) do update set theme_color = '#e11d48';

-- Se reutiliza un usuario real de auth.users en vez de inventar un uuid:
-- `business_member.user_id` lo referencia. No se fija ninguno concreto para que
-- el test corra en cualquier base sin editarlo.
insert into business_member (user_id, business_id)
select u.id, 999998 from auth.users u order by u.created_at limit 1
    on conflict do nothing;

-- ── Las pruebas, hablando como la dueña ────────────────────────────────────
do $$
declare
  v_uid   uuid;
  v_rows  integer;
  v_color text;
  v_plan  text;
begin
  select user_id into v_uid from business_member where business_id = 999998 limit 1;
  if v_uid is null then
    raise exception 'FALLÓ preparación: no hay ningún usuario en auth.users con el que impersonar a la dueña';
  end if;

  -- Aquí se deja de ser superusuario. Es imprescindible: como propietario de la
  -- tabla RLS ni se evalúa, así que un test que no cambie de rol pasaría
  -- siempre y no probaría nada. `set local` se revierte al salir del bloque.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  execute 'set local role authenticated';

  -- 1 · El caso del bug: la escritura tiene que tocar la fila.
  update business set theme_color = '#123456' where id = 999998;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'FALLÓ 1: el UPDATE afectó 0 filas. RLS lo descartó en silencio, que es el bug original';
  end if;

  -- 2 · Y el valor tiene que quedar guardado, no solo "no fallar".
  select theme_color into v_color from business where id = 999998;
  if v_color is distinct from '#123456' then
    raise exception 'FALLÓ 2: el color quedó en %, esperaba #123456', coalesce(v_color, '(ninguno)');
  end if;

  -- 3 · INVARIANTE 1: el negocio ajeno no se toca ni por accidente.
  update business set theme_color = '#123456' where id = 999997;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALLÓ 3: viola INVARIANTE 1, se escribió sobre % negocio(s) ajeno(s)', v_rows;
  end if;

  -- 4 · El plan es de facturación, no de la dueña: abrir el UPDATE para el
  -- color no puede dejarla cambiarse de plan desde el navegador.
  begin
    update business set plan = 'pro' where id = 999998;
    select plan into v_plan from business where id = 999998;
    if v_plan = 'pro' then
      raise exception 'FALLÓ 4: la dueña pudo cambiarse el plan a "pro" desde el cliente';
    end if;
  exception
    when insufficient_privilege then null; -- lo esperado: sin grant sobre la columna
  end;
end $$;

-- ── Limpieza ───────────────────────────────────────────────────────────────
delete from business_member where business_id = 999998;
delete from business where id in (999997, 999998);
