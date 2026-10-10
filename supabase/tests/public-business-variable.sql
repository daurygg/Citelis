-- Regresión de T5: el portal recibe servicios de precio variable.
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP o psql. Pégalo entero, DESPUÉS de aplicar
--   20261010000003_public_business_variable_services.sql. Contra CitelisDev,
--   no producción.
--
-- Corre TAMBIÉN `self-booking-regression.sql` y `public-rpcs-multi-service.sql`:
-- esta migración reescribió `public_request_booking` (solo quitó el filtro de
-- precio variable) y esas dos son la red que avisa si tocó H1–H6 sin querer.
--
-- Crea sus propios datos (ids 9998xx) y los borra al final.

-- Usa SU PROPIA usuaria: una cuenta solo puede crear un negocio (20261010000005), y la
-- primera usuaria real ya es dueña del negocio 1. Se borra al final.

do $$
declare
  v_uid     uuid;
  v_biz     bigint;
  v_cejas   bigint := 999831;  -- precio fijo, 30 min
  v_trenzas bigint := 999832;  -- precio variable, 120 min
  v_cero    bigint := 999833;  -- duración 0: nunca debe salir
  v_slug    text   := 'prueba-pub-variable';
  v_apt     bigint;
  v_n       integer;
  v_price   bigint;
  v_var     boolean;
  v_fuga    text;
  v_fecha   text;
begin
  -- Usuarias propias de la prueba (ver cabecera); limpieza previa por si una corrida murió a medias.
  v_uid := '00000000-0000-0000-0000-0000000009c3';
  delete from business where created_by in (v_uid);
  delete from auth.users where id in (v_uid);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid, 'authenticated', 'authenticated', 'prueba-g1@citelis.test', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  v_biz := create_business('PRUEBA Publico Variable', '#e11d48', v_slug);
  update booking_policy
     set enabled = true, min_notice_hours = 0, max_horizon_days = 365, buffer_min = 0
   where business_id = v_biz;

  -- Los costos de la dueña van con valores reconocibles: si se filtran, se ven.
  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_cejas,   v_biz, 'Cejas',   150000, 11111, 22222, 30,  false),
         (v_trenzas, v_biz, 'Trenzas', 300000, 33333, 44444, 120, true),
         (v_cero,    v_biz, 'Sin duración', 100000, 0, null, 0, false);

  insert into business_hours (id, business_id, weekday, opens_at, closes_at)
  select 999840 + d, v_biz, d, '08:00', '20:00' from generate_series(0, 6) d;

  v_fecha := to_char((now() at time zone 'America/Santo_Domingo')::date + 3, 'YYYY-MM-DD');

  -- 1 · public_business devuelve el servicio variable (con duración > 0) y el fijo.
  select count(*) into v_n from public_business(v_slug) where service_id in (v_cejas, v_trenzas);
  if v_n <> 2 then
    raise exception 'FALLÓ 1: public_business devolvió % de los 2 servicios esperados', v_n;
  end if;

  -- 2 · El de duración cero NO sale, variable o no.
  select count(*) into v_n from public_business(v_slug) where service_id = v_cero;
  if v_n <> 0 then
    raise exception 'FALLÓ 2: public_business devolvió un servicio de duración 0';
  end if;

  -- 3 · Se informa que es variable, y su precio de lista NO se publica (null).
  select price, variable_price into v_price, v_var
    from public_business(v_slug) where service_id = v_trenzas;
  if v_var is distinct from true then
    raise exception 'FALLÓ 3a: el servicio variable no viene marcado como variable_price';
  end if;
  if v_price is not null then
    raise exception 'FALLÓ 3b: el precio de un servicio variable se publicó (%)', v_price;
  end if;

  -- 4 · El fijo conserva su precio y viene marcado como no variable.
  select price, variable_price into v_price, v_var
    from public_business(v_slug) where service_id = v_cejas;
  if v_price is distinct from 150000 or v_var is distinct from false then
    raise exception 'FALLÓ 4: el servicio fijo vino con precio % / variable %', v_price, v_var;
  end if;

  -- 5 · Ninguna columna de costo sale, ni por nombre ni por valor.
  select k into v_fuga
    from public_business(v_slug) t, jsonb_object_keys(to_jsonb(t)) k
   where k in ('supply_cost', 'cost_override', 'actual_cost', 'profit')
   limit 1;
  if v_fuga is not null then
    raise exception 'FALLÓ 5a: public_business expone la columna %', v_fuga;
  end if;
  if exists (
    select 1 from public_business(v_slug) t
     where to_jsonb(t)::text ~ '(11111|22222|33333|44444)'
  ) then
    raise exception 'FALLÓ 5b: un valor de costo de la dueña aparece en public_business';
  end if;

  -- 6 · Una solicitud con un servicio fijo y uno variable se acepta y crea sus dos líneas.
  v_apt := public_request_booking(v_slug, array[v_cejas, v_trenzas],
                                  v_fecha || 'T10:00', 'Rosa', '8290000101');
  select count(*) into v_n from appointment_service where appointment_id = v_apt;
  if v_n <> 2 then
    raise exception 'FALLÓ 6a: la cita quedó con % líneas, esperaba 2', v_n;
  end if;
  -- La cita nace como solicitud, sin precio inventado, con el primero como principal.
  if not exists (
    select 1 from appointment
     where id = v_apt and status = 'REQUESTED' and quoted_price is null
       and service_id = v_cejas and business_id = v_biz
  ) then
    raise exception 'FALLÓ 6b: la cita no nació REQUESTED, sin precio y con el primer servicio como principal';
  end if;

  -- 7 · Solo el servicio variable también se acepta; la duración total cuenta
  --     (120 min desde las 14:00 ocupan hasta las 16:00).
  perform public_request_booking(v_slug, array[v_trenzas], v_fecha || 'T14:00', 'Eva', '8290000102');
  if (select duration_min from public_busy(v_slug, v_fecha) where starts_at = v_fecha || 'T14:00') <> 120 then
    raise exception 'FALLÓ 7: public_busy no reporta los 120 minutos del servicio variable';
  end if;

  -- 8 · Lo que sigue prohibido sigue prohibido: duración 0 y servicios ajenos.
  begin
    perform public_request_booking(v_slug, array[v_cejas, v_cero], v_fecha || 'T17:00', 'Luz', '8290000103');
    raise exception 'FALLÓ 8a: se aceptó un servicio de duración 0';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    -- El motivo tiene que ser el servicio, no otro rechazo cualquiera (horario,
    -- límite por teléfono...), o la aserción pasaría sin probar nada.
    if sqlerrm not like 'Servicio no disponible%' then
      raise exception 'FALLÓ 8a: se rechazó, pero por otro motivo: %', sqlerrm;
    end if;
  end;
  begin
    perform public_request_booking(v_slug, array[v_trenzas, 999899], v_fecha || 'T17:00', 'Sol', '8290000104');
    raise exception 'FALLÓ 8b: se aceptó un servicio inexistente junto a uno variable';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Servicio no disponible%' then
      raise exception 'FALLÓ 8b: se rechazó, pero por otro motivo: %', sqlerrm;
    end if;
  end;

  -- Limpieza (cascade se lleva líneas, horarios, política y membresía).
  delete from appointment where business_id = v_biz;
  delete from business_hours where business_id = v_biz;
  delete from service where id in (v_cejas, v_trenzas, v_cero);
  delete from business where id = v_biz;
  delete from auth.users where id = v_uid;
end $$;

select 'VERDE: las 8 aserciones pasaron. Ahora corre self-booking-regression.sql y public-rpcs-multi-service.sql' as resultado;
