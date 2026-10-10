-- Regresión de T4: las RPC públicas con varios servicios por cita.
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP o psql. Pégalo entero, DESPUÉS de aplicar
--   20260929000002_public_rpcs_multi_service.sql. Contra CitelisDev, no producción.
--
-- IMPORTANTE, Y NO ES OPCIONAL
--   Después de esto hay que correr TAMBIÉN `supabase/tests/self-booking-regression.sql`.
--   Esa suite cubre H1–H6 (aviso mínimo, horizonte, horario, bloqueos, anti-spam,
--   huso horario) y es la única red que avisa si esta migración tocó una
--   validación sin querer. Si esa pasa y esta pasa, el cambio es aritmética pura.
--
-- Crea sus propios datos (ids 9998xx) y los borra al final.

do $$
declare
  v_uid    uuid;
  v_biz    bigint;
  v_cejas  bigint := 999811;
  v_labios bigint := 999812;
  v_slug   text   := 'prueba-rpc-multi';
  v_apt    bigint;
  v_lineas integer;
  v_dur    integer;
  v_ok     boolean;
  v_fecha  text;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  if v_uid is null then raise exception 'FALLÓ preparación: no hay usuario en auth.users'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  v_biz := create_business('PRUEBA RPC Multi', '#e11d48', v_slug);
  update booking_policy
     set enabled = true, min_notice_hours = 0, max_horizon_days = 365, buffer_min = 0
   where business_id = v_biz;

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_cejas,  v_biz, 'Cejas',  150000, 0, null, 30, false),
         (v_labios, v_biz, 'Labios', 400000, 0, null, 60, false);

  -- Horario amplio todos los días, para que nada falle por el horario.
  insert into business_hours (id, business_id, weekday, opens_at, closes_at)
  select 999820 + d, v_biz, d, '08:00', '20:00' from generate_series(0, 6) d;

  v_fecha := to_char((now() at time zone 'America/Santo_Domingo')::date + 3, 'YYYY-MM-DD');

  -- 1 · Una solicitud con DOS servicios se acepta y guarda sus dos líneas.
  v_apt := public_request_booking(v_slug, array[v_cejas, v_labios],
                                  v_fecha || 'T10:00', 'Rosa', '8290000001');
  select count(*) into v_lineas from appointment_service where appointment_id = v_apt;
  if v_lineas <> 2 then
    raise exception 'FALLÓ 1: la cita quedó con % líneas, esperaba 2', v_lineas;
  end if;

  -- 2 · public_busy reporta la SUMA (30 + 60 = 90), no la de un servicio suelto.
  select duration_min into v_dur
    from public_busy(v_slug, v_fecha)
   where starts_at = v_fecha || 'T10:00';
  if v_dur <> 90 then
    raise exception 'FALLÓ 2: public_busy reporta % minutos, esperaba 90 (la suma)', v_dur;
  end if;

  -- 3 · El choque usa la duración TOTAL. Con 90 minutos desde las 10:00, las
  --     11:00 siguen ocupadas: con la duración de un solo servicio (30) habrían
  --     quedado libres y se habría colado una doble reserva.
  v_ok := false;
  begin
    perform public_request_booking(v_slug, array[v_cejas], v_fecha || 'T11:00', 'Ana', '8290000002');
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FALLÓ 3: se aceptó una cita a las 11:00 que choca con la de 10:00 + 90 min';
  end if;

  -- 4 · Pasada la suma sí hay hueco: a las 11:30 entra.
  perform public_request_booking(v_slug, array[v_cejas], v_fecha || 'T11:30', 'Eva', '8290000003');

  -- 5 · Si UNO de los servicios no es reservable, se rechaza la solicitud ENTERA.
  --     Aceptar solo los válidos daría una cita más corta de lo que se pidió.
  v_ok := false;
  begin
    perform public_request_booking(v_slug, array[v_cejas, 999899], v_fecha || 'T15:00', 'Luz', '8290000004');
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FALLÓ 5: se aceptó una solicitud con un servicio inexistente dentro';
  end if;

  -- 6 · Un arreglo vacío no crea una cita de duración cero.
  v_ok := false;
  begin
    perform public_request_booking(v_slug, array[]::bigint[], v_fecha || 'T16:00', 'Sol', '8290000005');
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FALLÓ 6: se aceptó una solicitud sin ningún servicio';
  end if;

  -- 7 · FALLO SEGURO: una cita sin líneas resolubles bloquea igual. Es el espejo
  --     de la decisión A6 en availability.ts, y la divergencia entre las dos
  --     copias es exactamente como aparecieron los fallos H2–H5.
  delete from appointment_service where appointment_id = v_apt;
  select duration_min into v_dur
    from public_busy(v_slug, v_fecha)
   where starts_at = v_fecha || 'T10:00';
  if v_dur < 600 then
    raise exception 'FALLÓ 7: una cita sin servicios resolubles reporta solo % minutos; debería bloquear en grande', v_dur;
  end if;

  v_ok := false;
  begin
    perform public_request_booking(v_slug, array[v_cejas], v_fecha || 'T10:15', 'Mar', '8290000006');
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FALLÓ 7: se aceptó una cita que choca con otra de duración desconocida';
  end if;

  -- Limpieza (cascade se lleva líneas, horarios, política y membresía).
  delete from appointment where business_id = v_biz;
  delete from business_hours where business_id = v_biz;
  delete from service where id in (v_cejas, v_labios);
  delete from business where id = v_biz;
end $$;

select 'VERDE: las 7 aserciones pasaron. Ahora corre self-booking-regression.sql' as resultado;
