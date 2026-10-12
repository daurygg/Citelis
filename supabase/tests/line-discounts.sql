-- Regresión de P2 (odd/tasks/payments-and-receipt.md): descuentos por línea.
-- Ver supabase/migrations/20261010000009_line_discounts.sql.
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (las columnas no existen).
--
-- QUÉ PRUEBA
--   1 · Cobrar con descuento guarda lista, descuento y neto por línea; la cita
--       guarda la suma de los netos, y lista/descuentos suman lo esperado.
--   2 · Sin descuento (líneas sin list_price ni discount) todo queda como antes:
--       list_price = charged_price y discount = 0.
--   3 · Un descuento mayor que el precio de lista se rechaza (mensaje exacto).
--   4 · Un descuento negativo se rechaza (mensaje exacto).
--   5 · charged_price distinto de lista - descuento se rechaza (mensaje exacto).
--   6 · Un rechazo no deja la cita a medias (sigue PENDING).
--   7 · Una cita COMPLETED no se puede volver a cobrar: sus líneas no cambian.
--   8 · Un descuento que deja la línea en 0 (100 %) es válido.
--
-- Usuaria propia: ...0009a3. Datos 9996xx. Se borran al final.

do $$
declare
  v_uid   uuid := '00000000-0000-0000-0000-0000000009a3';
  v_biz   bigint;
  v_svc1  bigint := 999611;
  v_svc2  bigint := 999612;
  v_apt1  bigint := 999631;
  v_apt2  bigint := 999632;
  v_apt3  bigint := 999633;
  v_apt4  bigint := 999634;
  v_msg   text;
  v_n     integer;
  v_list  bigint;
  v_disc  bigint;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'appointment_service' and column_name = 'discount'
  ) then
    raise exception 'FALLÓ 0: appointment_service.discount no existe. ¿Aplicaste la migración?';
  end if;

  delete from business where created_by = v_uid;
  delete from auth.users where id = v_uid;
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (v_uid, 'authenticated', 'authenticated', 'prueba-a3@citelis.test', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_biz := create_business('PRUEBA Descuentos', '#e11d48', 'prueba-descuentos');

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc1, v_biz, 'Cejas', 5000, 1000, null, 30, false),
         (v_svc2, v_biz, 'Ondas', 4000,  500, null, 45, false);

  insert into appointment (id, business_id, service_id, client, datetime, status,
                           quoted_price, deposit, charged_price, actual_cost, profit)
  values (v_apt1, v_biz, v_svc1, 'Ana',  '2026-10-12T10:00', 'PENDING', null, null, null, null, null),
         (v_apt2, v_biz, v_svc1, 'Rosa', '2026-10-12T11:00', 'PENDING', null, null, null, null, null),
         (v_apt3, v_biz, v_svc1, 'Eva',  '2026-10-12T12:00', 'PENDING', null, null, null, null, null),
         (v_apt4, v_biz, v_svc1, 'Zoe',  '2026-10-12T13:00', 'PENDING', null, null, null, null, null);
  insert into appointment_service (appointment_id, service_id, business_id)
  values (v_apt1, v_svc1, v_biz), (v_apt1, v_svc2, v_biz);

  -- 1 · Con descuento: Cejas 5000 - 500 = 4500; Ondas 4000 sin descuento.
  --     Cita: 8500. Costo 1500. Ganancia 7000.
  perform complete_appointment(v_biz, v_apt1, 8500, 1500, 7000,
    '[{"service_id":999611,"list_price":5000,"discount":500,"charged_price":4500,"actual_cost":1000,"profit":3500},
      {"service_id":999612,"list_price":4000,"discount":0,"charged_price":4000,"actual_cost":500,"profit":3500}]'::jsonb);
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt1
     and ((service_id = v_svc1 and list_price = 5000 and discount = 500 and charged_price = 4500)
       or (service_id = v_svc2 and list_price = 4000 and discount = 0   and charged_price = 4000));
  if v_n <> 2 then
    raise exception 'FALLÓ 1: las líneas no guardaron lista/descuento/neto (% de 2)', v_n;
  end if;
  select sum(list_price), sum(discount) into v_list, v_disc
    from appointment_service where appointment_id = v_apt1;
  if v_list <> 9000 or v_disc <> 500 then
    raise exception 'FALLÓ 1: subtotal % / descuentos % (esperaba 9000 / 500)', v_list, v_disc;
  end if;
  if (select charged_price from appointment where id = v_apt1) <> 8500
     or (select sum(charged_price) from appointment_service where appointment_id = v_apt1) <> 8500 then
    raise exception 'FALLÓ 1: el total de la cita no es la suma de los netos';
  end if;

  -- 2 · Sin descuento: el mismo contrato de antes.
  perform complete_appointment(v_biz, v_apt2, 5000, 1000, 4000,
    '[{"service_id":999611,"charged_price":5000,"actual_cost":1000,"profit":4000}]'::jsonb);
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt2 and list_price = 5000 and discount = 0 and charged_price = 5000;
  if v_n <> 1 then
    raise exception 'FALLÓ 2: cobrar sin descuento no dejó lista = cobrado y descuento 0';
  end if;

  -- 3 · Descuento mayor que la lista.
  begin
    perform complete_appointment(v_biz, v_apt3, 0, 1000, -1000,
      '[{"service_id":999611,"list_price":5000,"discount":5001,"charged_price":-1,"actual_cost":1000,"profit":-1001}]'::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is null then
    raise exception 'FALLÓ 3: la base aceptó un descuento mayor que el precio de lista';
  end if;
  -- Con neto no negativo y descuento mayor la regla que salta es la de descuento.
  begin
    perform complete_appointment(v_biz, v_apt3, 0, 1000, -1000,
      '[{"service_id":999611,"list_price":5000,"discount":6000,"charged_price":0,"actual_cost":1000,"profit":-1000}]'::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Hay líneas con un descuento inválido.' then
    raise exception 'FALLÓ 3: descuento mayor que la lista dio "%"', coalesce(v_msg, 'éxito');
  end if;

  -- 4 · Descuento negativo (inflaría el neto por encima de la lista).
  begin
    perform complete_appointment(v_biz, v_apt3, 5500, 1000, 4500,
      '[{"service_id":999611,"list_price":5000,"discount":-500,"charged_price":5500,"actual_cost":1000,"profit":4500}]'::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Hay líneas con un descuento inválido.' then
    raise exception 'FALLÓ 4: descuento negativo dio "%"', coalesce(v_msg, 'éxito');
  end if;

  -- 5 · El neto no es lista - descuento.
  begin
    perform complete_appointment(v_biz, v_apt3, 4000, 1000, 3000,
      '[{"service_id":999611,"list_price":5000,"discount":500,"charged_price":4000,"actual_cost":1000,"profit":3000}]'::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El precio de una línea no es precio de lista menos descuento.' then
    raise exception 'FALLÓ 5: neto incoherente dio "%"', coalesce(v_msg, 'éxito');
  end if;
  -- Un descuento sin precio de lista tampoco cuadra (lista = lo cobrado).
  begin
    perform complete_appointment(v_biz, v_apt3, 4500, 1000, 3500,
      '[{"service_id":999611,"discount":500,"charged_price":4500,"actual_cost":1000,"profit":3500}]'::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El precio de una línea no es precio de lista menos descuento.' then
    raise exception 'FALLÓ 5: descuento sin precio de lista dio "%"', coalesce(v_msg, 'éxito');
  end if;

  -- 6 · Ningún rechazo dejó la cita a medias.
  if (select status from appointment where id = v_apt3) <> 'PENDING'
     or exists (select 1 from appointment_service where appointment_id = v_apt3 and charged_price is not null) then
    raise exception 'FALLÓ 6: un rechazo dejó la cita o su línea a medias';
  end if;

  -- 7 · COMPLETED es inmutable: cobrar otra vez se rechaza y no cambia nada.
  begin
    perform complete_appointment(v_biz, v_apt1, 9000, 1500, 7500,
      '[{"service_id":999611,"list_price":5000,"discount":0,"charged_price":5000,"actual_cost":1000,"profit":4000},
        {"service_id":999612,"list_price":4000,"discount":0,"charged_price":4000,"actual_cost":500,"profit":3500}]'::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is null or v_msg not like 'La cita % está en estado COMPLETED y no se puede completar.' then
    raise exception 'FALLÓ 7: recobrar una cita COMPLETED dio "%"', coalesce(v_msg, 'éxito');
  end if;
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt1 and service_id = v_svc1 and discount = 500 and charged_price = 4500;
  if v_n <> 1 then
    raise exception 'FALLÓ 7: recobrar cambió una línea ya congelada';
  end if;

  -- 8 · 100 % de descuento: la línea queda en 0 y es válida.
  perform complete_appointment(v_biz, v_apt4, 0, 1000, -1000,
    '[{"service_id":999611,"list_price":5000,"discount":5000,"charged_price":0,"actual_cost":1000,"profit":-1000}]'::jsonb);
  select count(*) into v_n from appointment_service
   where appointment_id = v_apt4 and list_price = 5000 and discount = 5000 and charged_price = 0;
  if v_n <> 1 then
    raise exception 'FALLÓ 8: un descuento total no quedó registrado';
  end if;

  delete from business where id = v_biz;
  delete from auth.users where id = v_uid;
end $$;

select 'VERDE: las 8 aserciones de descuentos pasaron' as resultado;
