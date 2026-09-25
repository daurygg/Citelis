-- Regresión de los huecos H1–H6 del portal de auto-reserva.
-- Ver odd/tasks/self-booking.md para la historia de cada uno.
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP (`execute_sql`) o psql. Pégalo entero.
--   Con psql, si prefieres no escribir nada: `begin;` … `rollback;`.
--
-- QUÉ NO ES
--   Esto NO corre en CI: el workflow solo ejecuta vitest, sin base de datos.
--   Hay que lanzarlo a mano tras tocar las funciones del portal. Es una red de
--   seguridad real, pero manual, y conviene no fingir lo contrario.
--
-- Trabaja sobre un negocio propio (ids 999xxx) y borra todo al final, así que no
-- toca los datos reales. Si una aserción falla, la excepción aborta la
-- transacción y tampoco queda rastro.
--
-- VALIDADO CONTRA REGRESIONES REALES (2026-09-18)
--   Un test que solo se ha visto pasar no prueba nada. Se comprobó que este sabe
--   fallar, rompiendo a propósito tres cosas distintas:
--     1. Pedirle que rechace un horario válido  → lo detecta.
--     2. Rechazo correcto, motivo esperado falso → lo detecta (por eso
--        `debe_rechazar` compara el mensaje y no solo "que falle").
--     3. Reabrir el grant de expire_stale_requests a anon → la tabla de
--        permisos lo ve.
--   El grant del ensayo 3 se revocó acto seguido y se verificó.

-- ── Fixtures ───────────────────────────────────────────────────────────────

insert into business (id, name, plan) values (999999, 'PRUEBA H1-H6', 'mvp')
on conflict (id) do nothing;

insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
values (999901, 999999, 'Servicio de prueba', 10000, 0, null, 60, false)
on conflict (id) do nothing;

insert into booking_policy (business_id, public_slug, enabled, slot_step_min, buffer_min,
                            min_notice_hours, max_horizon_days, max_requests_per_phone_per_day, timezone)
values (999999, 'prueba-h1-h6', true, 30, 10, 2, 30, 50, 'America/Santo_Domingo')
on conflict (business_id) do update set enabled = true;

-- Jornada partida los SIETE días, para que la aritmética de fechas del test
-- nunca caiga en un día cerrado y el caso que falle sea el que queremos probar.
insert into business_hours (id, business_id, weekday, opens_at, closes_at)
select 999910 + v.wd * 2, 999999, v.wd, '09:00', '13:00' from generate_series(0, 6) as v(wd)
on conflict (id) do nothing;
insert into business_hours (id, business_id, weekday, opens_at, closes_at)
select 999911 + v.wd * 2, 999999, v.wd, '14:00', '18:00' from generate_series(0, 6) as v(wd)
on conflict (id) do nothing;

-- ── Helpers ────────────────────────────────────────────────────────────────

-- "Ahora" en la hora del negocio: todas las fechas del test se derivan de aquí,
-- nunca de `now()` a secas, o el test heredaría el bug H6 que intenta detectar.
create or replace function pg_temp.ahora_local() returns timestamp
language sql as $$ select now() at time zone 'America/Santo_Domingo' $$;

/* Afirma que una reserva se RECHAZA, y que lo hace por el motivo esperado.
   Comprobar solo "que falle" dejaría pasar un test que se rompe por otra regla:
   por ejemplo, un caso de horario que en realidad muere en el aviso mínimo. */
create or replace function pg_temp.debe_rechazar(
  p_caso text, p_datetime text, p_motivo_esperado text, p_phone text
) returns void language plpgsql as $$
begin
  perform public_request_booking('prueba-h1-h6', 999901, p_datetime, 'Prueba', p_phone);
  raise exception 'FALLÓ %: la reserva se aceptó cuando debía rechazarse (%)', p_caso, p_datetime;
exception
  when sqlstate 'P0001' then
    -- Nuestro propio fallo vuelve a subir; el rechazo esperado se valida.
    if sqlerrm like 'FALLÓ %' then raise; end if;
    if sqlerrm not like '%' || p_motivo_esperado || '%' then
      raise exception 'FALLÓ %: rechazada por el motivo equivocado. Esperaba "%", recibí "%"',
        p_caso, p_motivo_esperado, sqlerrm;
    end if;
end; $$;

create or replace function pg_temp.fecha_futura(p_dias integer, p_hora text)
returns text language sql as $$
  select to_char(pg_temp.ahora_local()::date + p_dias, 'YYYY-MM-DD') || 'T' || p_hora
$$;

-- ── H1 · Permisos de ejecución ─────────────────────────────────────────────
-- Se comprueban con has_function_privilege y no llamando a la función: es
-- determinista y no depende de cambiar de rol a mitad del script.
-- Ojo: `revoke ... from public` NO basta en Supabase, porque el proyecto concede
-- EXECUTE directamente a anon/authenticated por default privileges. Hay que
-- revocar del rol por su nombre. Esta tabla existe para que eso no se olvide.
do $$
declare
  r record;
  v_real boolean;
begin
  for r in
    select * from (values
      ('public.expire_stale_requests(bigint)',                      false, false),
      ('public.create_business(text)',                              false, true ),
      ('public.create_invitation()',                                false, true ),
      ('public.redeem_invitation(text)',                            false, true ),
      -- is_member sigue abierta a anon A PROPÓSITO: las policies RLS la evalúan
      -- como el usuario que consulta. Revocarla convertiría "no ves nada" en un
      -- error de permisos, y no filtra nada (para anónimo siempre devuelve false).
      ('public.is_member(bigint)',                                  true,  true ),
      ('public.public_business(text)',                              true,  true ),
      ('public.public_hours(text)',                                 true,  true ),
      ('public.public_busy(text,text)',                             true,  true ),
      ('public.public_request_booking(text,bigint,text,text,text)', true,  true )
    ) as t(fn, anon_esperado, auth_esperado)
  loop
    v_real := has_function_privilege('anon', r.fn, 'EXECUTE');
    if v_real is distinct from r.anon_esperado then
      raise exception 'FALLÓ H1: anon EXECUTE sobre % es %, esperaba %',
        r.fn, v_real, r.anon_esperado;
    end if;

    v_real := has_function_privilege('authenticated', r.fn, 'EXECUTE');
    if v_real is distinct from r.auth_esperado then
      raise exception 'FALLÓ H1: authenticated EXECUTE sobre % es %, esperaba %',
        r.fn, v_real, r.auth_esperado;
    end if;
  end loop;
end $$;

-- ── H4 · Aviso mínimo ──────────────────────────────────────────────────────
-- Va primero porque es la primera comprobación de la función: si se rompiera,
-- enmascararía los demás casos.
do $$
begin
  perform pg_temp.debe_rechazar(
    'H4 (aviso mínimo)',
    to_char(pg_temp.ahora_local() + interval '30 minutes', 'YYYY-MM-DD"T"HH24:MI'),
    'horas de aviso', '8090000001');
end $$;

-- ── H3 · Horizonte de la agenda ────────────────────────────────────────────
do $$
begin
  perform pg_temp.debe_rechazar(
    'H3 (horizonte)', pg_temp.fecha_futura(60, '10:00'),
    'tan lejos', '8090000002');
end $$;

-- ── H2 · Horario de atención ───────────────────────────────────────────────
do $$
begin
  -- Las 03:00 caen fuera de los dos tramos, cualquier día de la semana.
  perform pg_temp.debe_rechazar(
    'H2 (fuera de horario)', pg_temp.fecha_futura(3, '03:00'),
    'fuera de nuestro horario', '8090000003');

  -- Jornada partida: 12:30 + 60 min termina a las 13:30, cruzando el almuerzo.
  -- Ambas horas están "abiertas", pero no dentro de UN MISMO tramo. Este es el
  -- caso que distingue "cabe en un tramo" de "cabe en la suma de los tramos".
  perform pg_temp.debe_rechazar(
    'H2 (cruza el almuerzo)', pg_temp.fecha_futura(3, '12:30'),
    'fuera de nuestro horario', '8090000004');
end $$;

-- ── H5 · Bloqueos de la dueña ──────────────────────────────────────────────
do $$
begin
  insert into time_block (id, business_id, starts_at, ends_at, reason)
  values (999920, 999999, pg_temp.fecha_futura(4, '00:00'),
          pg_temp.fecha_futura(4, '23:59'), 'Vacaciones de prueba')
  on conflict (id) do nothing;

  perform pg_temp.debe_rechazar(
    'H5 (bloqueo)', pg_temp.fecha_futura(4, '10:00'),
    'no está disponible', '8090000005');
end $$;

-- ── Camino feliz ───────────────────────────────────────────────────────────
-- Sin esto, todas las aserciones de arriba las satisfaría una función que
-- rechazara siempre.
do $$
declare
  v_id  bigint;
  v_row appointment%rowtype;
begin
  v_id := public_request_booking('prueba-h1-h6', 999901,
            pg_temp.fecha_futura(5, '10:00'), '  Clienta Válida  ', '8090000006');

  select * into v_row from appointment where id = v_id;

  if v_row.status <> 'REQUESTED' then
    raise exception 'FALLÓ camino feliz: status es %, esperaba REQUESTED (decisión D1)', v_row.status;
  end if;
  if v_row.source <> 'SELF' then
    raise exception 'FALLÓ camino feliz: source es %, esperaba SELF', v_row.source;
  end if;
  if v_row.client <> 'Clienta Válida' then
    raise exception 'FALLÓ camino feliz: el nombre no se recortó, quedó "%"', v_row.client;
  end if;
  -- INVARIANTE 2: el dinero se congela al COMPLETAR, nunca al agendar.
  if v_row.charged_price is not null or v_row.actual_cost is not null or v_row.profit is not null then
    raise exception 'FALLÓ camino feliz: viola INVARIANTE 2, hay dinero congelado al agendar';
  end if;
  if v_row.requested_at is null then
    raise exception 'FALLÓ camino feliz: requested_at quedó null, el anti-spam lo necesita';
  end if;
end $$;

-- ── Choques, con buffer a ambos lados ──────────────────────────────────────
-- La cita del camino feliz ocupa 10:00–11:00. Con buffer_min = 10, el hueco
-- protegido es 09:50–11:10, igual que `occupiesSchedule` en availability.ts.
do $$
declare v_id bigint;
begin
  perform pg_temp.debe_rechazar(
    'choque (solapa)', pg_temp.fecha_futura(5, '10:30'),
    'acaba de ocuparse', '8090000007');

  -- 11:05 no solapa la cita, pero sí su buffer. Antes del arreglo el servidor
  -- lo aceptaba: era MÁS permisivo que el navegador.
  perform pg_temp.debe_rechazar(
    'choque (dentro del buffer)', pg_temp.fecha_futura(5, '11:05'),
    'acaba de ocuparse', '8090000008');

  -- 11:15 ya está fuera del buffer: tiene que entrar. Si esto fallara, el
  -- servidor sería MÁS estricto que el navegador y la clienta vería errores en
  -- horarios que la web le acaba de ofrecer.
  v_id := public_request_booking('prueba-h1-h6', 999901,
            pg_temp.fecha_futura(5, '11:15'), 'Justo Después', '8090000009');
  if v_id is null then
    raise exception 'FALLÓ buffer: se rechazó un horario libre pasado el buffer';
  end if;
end $$;

-- ── H6 · El huso horario del negocio, no el del servidor ───────────────────
-- La base corre en UTC; `datetime` es hora local sin zona. Una cita DENTRO DE
-- LA PRÓXIMA HORA está en el futuro para el negocio, pero el reloj UTC del
-- servidor ya la da por pasada (RD es UTC-4). El código anterior la caducaba.
do $$
declare v_status text;
begin
  insert into appointment (id, business_id, service_id, client, client_phone,
                           datetime, status, source, requested_at)
  values (999930, 999999, 999901, 'Dentro De Una Hora', '8090000010',
          to_char(pg_temp.ahora_local() + interval '1 hour', 'YYYY-MM-DD"T"HH24:MI'),
          'REQUESTED', 'SELF', now())
  on conflict (id) do update set status = 'REQUESTED';

  perform expire_stale_requests(999999);

  select status into v_status from appointment where id = 999930;
  if v_status <> 'REQUESTED' then
    raise exception
      'FALLÓ H6: se caducó una cita que aún no ha pasado en la hora del negocio (quedó %). '
      'Señal de que se está comparando contra el reloj del servidor y no contra now() at time zone.',
      v_status;
  end if;
end $$;

-- ── Limpieza ───────────────────────────────────────────────────────────────

delete from appointment    where business_id = 999999;
delete from time_block     where business_id = 999999;
delete from business_hours where business_id = 999999;
delete from booking_policy where business_id = 999999;
delete from service        where business_id = 999999;
delete from business       where id = 999999;

select 'H1–H6: todas las aserciones pasaron' as resultado;
