-- Regresión de P3 (odd/tasks/payments-and-receipt.md): pagos por cita y crédito.
-- Ver supabase/migrations/20261010000010_appointment_payments.sql.
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 0 (la tabla no existe).
--
-- QUÉ PRUEBA
--   1 · Respaldo: un abono histórico (deposit > 0, sin pago) pasa a ser UN pago
--       'deposit' de vía nula, y volver a correrlo no lo duplica.
--   2 · Agendar con abono crea el pago en la misma transacción (con vía); la
--       firma vieja de 7 argumentos sigue valiendo (vía nula); vía inválida se rechaza.
--   3 · Abonar a una cita pendiente con `add_appointment_payment`.
--   4 · Cobrar con pagos divididos (efectivo + tarjeta) guarda una fila 'charge' por pago.
--   5 · Cobrar con pago parcial deja la cita COMPLETED con saldo (crédito).
--   6 · Sobrepago al cobrar se rechaza (mensaje exacto) y no deja nada a medias.
--   7 · Pagos de crédito sobre una cita cobrada: valen hasta saldar, no más.
--   8 · Validaciones: monto, vía, tipo y estado (mensajes exactos).
--   9 · Pagar no cambia el dinero congelado de la cita (INVARIANTE 2).
--  10 · RLS entre negocios y escritura directa vedada (INVARIANTE 1).
--  11 · Un reintento con el mismo id de pago no paga dos veces.
--  12 · `anon` no puede ejecutar las RPC.
--
-- Usuarias propias: ...0009a4 y ...0009a5. Datos 9998xx. Se borran al final.

do $$
declare
  v_uid   uuid := '00000000-0000-0000-0000-0000000009a4';
  v_uid2  uuid := '00000000-0000-0000-0000-0000000009a5';
  v_biz   bigint;
  v_otro  bigint;
  v_svc   bigint := 999811;
  v_svc_o bigint := 999812;
  v_legacy bigint := 999831;
  v_aptA  bigint := 999832;
  v_aptB  bigint := 999833;
  v_aptC  bigint := 999834;
  v_aptD  bigint := 999835;
  v_aptE  bigint := 999836;
  v_apt_o bigint := 999837;
  v_msg   text;
  v_n     integer;
  v_sum   bigint;
  v_chg   bigint;
  v_cost  bigint;
  v_prof  bigint;
  v_line  jsonb := '[{"service_id":999811,"charged_price":5000,"actual_cost":1000,"profit":4000}]';
begin
  if to_regclass('public.appointment_payment') is null then
    raise exception 'FALLÓ 0: la tabla appointment_payment no existe. ¿Aplicaste la migración?';
  end if;

  delete from business where created_by in (v_uid, v_uid2);
  delete from auth.users where id in (v_uid, v_uid2);
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_uid,  'authenticated', 'authenticated', 'prueba-a4@citelis.test', now(), now()),
    (v_uid2, 'authenticated', 'authenticated', 'prueba-a5@citelis.test', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  v_biz := create_business('PRUEBA Pagos', '#e11d48', 'prueba-pagos');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2)::text, true);
  v_otro := create_business('PRUEBA Pagos Ajeno', '#e11d48', 'prueba-pagos-ajeno');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);

  insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
  values (v_svc,   v_biz,  'Cejas', 5000, 1000, null, 30, false),
         (v_svc_o, v_otro, 'Ajeno', 5000, 1000, null, 30, false);

  -- Siembra saltándose la RLS (somos el propietario de las tablas).
  insert into appointment (id, business_id, service_id, client, datetime, status,
                           quoted_price, deposit, charged_price, actual_cost, profit)
  values (v_legacy, v_biz,  v_svc,   'Vieja', '2026-10-12T08:00', 'PENDING', null, 1500, null, null, null),
         (v_apt_o,  v_otro, v_svc_o, 'Ajena', '2026-10-12T09:00', 'PENDING', null, null, null, null, null);
  insert into appointment_payment (business_id, appointment_id, amount, method, kind)
  values (v_otro, v_apt_o, 700, 'cash', 'deposit');

  -- 1 · Respaldo: la misma sentencia de la migración. Idempotente.
  for i in 1..2 loop
    insert into appointment_payment (business_id, appointment_id, amount, method, kind)
    select a.business_id, a.id, a.deposit, null, 'deposit'
      from appointment a
     where a.deposit > 0
       and not exists (select 1 from appointment_payment p where p.appointment_id = a.id and p.kind = 'deposit');
  end loop;
  select count(*) into v_n from appointment_payment
   where appointment_id = v_legacy and kind = 'deposit' and amount = 1500 and method is null;
  if v_n <> 1 then
    raise exception 'FALLÓ 1: el abono histórico no quedó como UN pago de vía nula (%)', v_n;
  end if;

  -- 2 · Agendar con abono y vía: cita y pago juntos.
  perform schedule_appointment(v_biz, v_aptA, 'Ana', '2026-10-12T10:00', null, 2000, array[v_svc], 'transfer');
  select count(*) into v_n from appointment_payment
   where appointment_id = v_aptA and kind = 'deposit' and amount = 2000 and method = 'transfer';
  if v_n <> 1 then
    raise exception 'FALLÓ 2: agendar con abono no creó el pago con su vía (%)', v_n;
  end if;
  -- Firma vieja de 7 argumentos: vía desconocida (nula).
  perform schedule_appointment(v_biz, v_aptB, 'Rosa', '2026-10-12T11:00', null, 1000, array[v_svc]);
  select count(*) into v_n from appointment_payment
   where appointment_id = v_aptB and kind = 'deposit' and amount = 1000 and method is null;
  if v_n <> 1 then
    raise exception 'FALLÓ 2: la firma vieja no dejó el abono con vía nula (%)', v_n;
  end if;
  -- Sin abono no hay pago.
  perform schedule_appointment(v_biz, v_aptC, 'Eva', '2026-10-12T12:00', null, null, array[v_svc], null);
  perform schedule_appointment(v_biz, v_aptD, 'Zoe', '2026-10-12T13:00', null, null, array[v_svc], null);
  perform schedule_appointment(v_biz, v_aptE, 'Mía', '2026-10-12T14:00', null, null, array[v_svc], null);
  if exists (select 1 from appointment_payment where appointment_id in (v_aptC, v_aptD, v_aptE)) then
    raise exception 'FALLÓ 2: agendar sin abono creó un pago';
  end if;
  -- Vía inválida: se rechaza y la cita no nace.
  begin
    perform schedule_appointment(v_biz, 999838, 'Mala', '2026-10-12T15:00', null, 500, array[v_svc], 'bitcoin');
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'La vía de pago no es válida.'
     or exists (select 1 from appointment where id = 999838) then
    raise exception 'FALLÓ 2: vía inválida al agendar dio "%"', coalesce(v_msg, 'éxito');
  end if;

  -- 3 · Abono posterior a una cita pendiente.
  perform add_appointment_payment(v_biz, v_aptC, 2000, 'cash', 'deposit');
  select count(*) into v_n from appointment_payment
   where appointment_id = v_aptC and kind = 'deposit' and amount = 2000 and method = 'cash';
  if v_n <> 1 then
    raise exception 'FALLÓ 3: el abono suelto no quedó registrado (%)', v_n;
  end if;

  -- 4 · Cobrar con pagos divididos. A: abono 2000 (transferencia) + 1000 efectivo + 2000 tarjeta = 5000.
  perform complete_appointment(v_biz, v_aptA, 5000, 1000, 4000, v_line,
    '[{"amount":1000,"method":"cash"},{"amount":2000,"method":"card"}]'::jsonb);
  select count(*) into v_n from appointment_payment
   where appointment_id = v_aptA and kind = 'charge'
     and ((amount = 1000 and method = 'cash') or (amount = 2000 and method = 'card'));
  if v_n <> 2 then
    raise exception 'FALLÓ 4: los pagos divididos no quedaron como dos filas charge (% de 2)', v_n;
  end if;
  select sum(amount) into v_sum from appointment_payment where appointment_id = v_aptA;
  if v_sum <> 5000 or (select status from appointment where id = v_aptA) <> 'COMPLETED' then
    raise exception 'FALLÓ 4: pagado % (esperaba 5000) o la cita no está COMPLETED', v_sum;
  end if;

  -- 5 · Cobrar con pago parcial: queda a crédito. B: abono (vía nula) 1000 + 1000 efectivo; debe 3000.
  perform complete_appointment(v_biz, v_aptB, 5000, 1000, 4000, v_line,
    '[{"amount":1000,"method":"cash"}]'::jsonb);
  select sum(amount) into v_sum from appointment_payment where appointment_id = v_aptB;
  if v_sum <> 2000 or (select status from appointment where id = v_aptB) <> 'COMPLETED' then
    raise exception 'FALLÓ 5: pagado % (esperaba 2000) o la cita no se completó con saldo', v_sum;
  end if;
  -- Cobrar SIN pagos nuevos también vale: todo (menos el abono) a crédito.
  perform complete_appointment(v_biz, v_aptD, 5000, 1000, 4000, v_line);
  if (select status from appointment where id = v_aptD) <> 'COMPLETED'
     or exists (select 1 from appointment_payment where appointment_id = v_aptD) then
    raise exception 'FALLÓ 5: cobrar sin pagos no dejó la cita COMPLETED y sin pagos';
  end if;

  -- 6 · Sobrepago al cobrar. C tiene abono 2000; 3500 más pasa de 5000.
  begin
    perform complete_appointment(v_biz, v_aptC, 5000, 1000, 4000, v_line,
      '[{"amount":3500,"method":"cash"}]'::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Los pagos suman más de lo que se cobró.' then
    raise exception 'FALLÓ 6: sobrepago al cobrar dio "%"', coalesce(v_msg, 'éxito');
  end if;
  if (select status from appointment where id = v_aptC) <> 'PENDING'
     or (select count(*) from appointment_payment where appointment_id = v_aptC) <> 1 then
    raise exception 'FALLÓ 6: el rechazo dejó la cita o sus pagos a medias';
  end if;
  -- Justo el saldo (3000) sí vale.
  perform complete_appointment(v_biz, v_aptC, 5000, 1000, 4000, v_line,
    '[{"amount":3000,"method":"transfer"}]'::jsonb);

  -- 9 (antes) · Foto del dinero congelado de B antes de pagar.
  select charged_price, actual_cost, profit into v_chg, v_cost, v_prof from appointment where id = v_aptB;

  -- 7 · Pagos de crédito sobre B (debe 3000): 1500, luego 1500, y uno más se pasa.
  perform add_appointment_payment(v_biz, v_aptB, 1500, 'transfer', 'credit_payment');
  perform add_appointment_payment(v_biz, v_aptB, 1500, 'cash', 'credit_payment');
  select sum(amount) into v_sum from appointment_payment where appointment_id = v_aptB;
  if v_sum <> 5000 then
    raise exception 'FALLÓ 7: tras saldar, lo pagado es % (esperaba 5000)', v_sum;
  end if;
  begin
    perform add_appointment_payment(v_biz, v_aptB, 1, 'cash', 'credit_payment');
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El pago es mayor que lo que se debe.' then
    raise exception 'FALLÓ 7: pagar de más dio "%"', coalesce(v_msg, 'éxito');
  end if;
  -- D está a crédito completo: un pago por encima de 5000 también se rechaza.
  begin
    perform add_appointment_payment(v_biz, v_aptD, 5001, 'cash', 'credit_payment');
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El pago es mayor que lo que se debe.' then
    raise exception 'FALLÓ 7: pagar más que todo el cobro dio "%"', coalesce(v_msg, 'éxito');
  end if;
  perform add_appointment_payment(v_biz, v_aptD, 5000, 'card', 'credit_payment');

  -- 8 · Validaciones.
  begin
    perform add_appointment_payment(v_biz, v_aptE, 100, 'bitcoin', 'deposit'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'La vía de pago no es válida.' then
    raise exception 'FALLÓ 8: vía inválida dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform add_appointment_payment(v_biz, v_aptE, 0, 'cash', 'deposit'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El pago debe ser mayor que cero.' then
    raise exception 'FALLÓ 8: monto cero dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform add_appointment_payment(v_biz, v_aptE, -5, 'cash', 'deposit'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El pago debe ser mayor que cero.' then
    raise exception 'FALLÓ 8: monto negativo dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform add_appointment_payment(v_biz, v_aptE, 100, 'cash', 'charge'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El tipo de pago no es válido.' then
    raise exception 'FALLÓ 8: tipo charge dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform add_appointment_payment(v_biz, v_aptA, 100, 'cash', 'deposit'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Solo se puede abonar a una cita pendiente o en curso.' then
    raise exception 'FALLÓ 8: abonar a una cobrada dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform add_appointment_payment(v_biz, v_aptE, 100, 'cash', 'credit_payment'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Solo se puede pagar el saldo de una cita ya cobrada.' then
    raise exception 'FALLÓ 8: pagar saldo de una pendiente dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform complete_appointment(v_biz, v_aptE, 5000, 1000, 4000, v_line,
      '[{"amount":1000,"method":"bitcoin"}]'::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'La vía de pago no es válida.' then
    raise exception 'FALLÓ 8: cobrar con vía inválida dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform complete_appointment(v_biz, v_aptE, 5000, 1000, 4000, v_line,
      '[{"amount":0,"method":"cash"}]'::jsonb);
    v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'El pago debe ser mayor que cero.' then
    raise exception 'FALLÓ 8: cobrar con monto cero dio "%"', coalesce(v_msg, 'éxito');
  end if;
  if (select status from appointment where id = v_aptE) <> 'PENDING'
     or exists (select 1 from appointment_payment where appointment_id = v_aptE and kind = 'charge') then
    raise exception 'FALLÓ 8: un rechazo dejó la cita E a medias';
  end if;

  -- 9 · El dinero congelado de B no cambió con los pagos posteriores.
  if (select (charged_price, actual_cost, profit) from appointment where id = v_aptB)
       is distinct from (v_chg, v_cost, v_prof) then
    raise exception 'FALLÓ 9: un pago posterior cambió el dinero congelado de la cita';
  end if;
  select count(*) into v_n from appointment_service
   where appointment_id = v_aptB and charged_price = 5000 and actual_cost = 1000 and profit = 4000;
  if v_n <> 1 then
    raise exception 'FALLÓ 9: un pago posterior cambió la línea congelada';
  end if;

  -- 10 · RLS: como dueña de v_biz.
  execute 'set local role authenticated';
  if not exists (select 1 from appointment_payment where appointment_id = v_aptA) then
    raise exception 'FALLÓ 10: la dueña no ve los pagos de su propia cita';
  end if;
  if exists (select 1 from appointment_payment where business_id = v_otro) then
    raise exception 'FALLÓ 10: viola INVARIANTE 1, la dueña ve pagos de otro negocio';
  end if;
  begin
    insert into appointment_payment (business_id, appointment_id, amount, method, kind)
    values (v_biz, v_aptE, 100, 'cash', 'deposit');
    v_msg := null;
  exception when insufficient_privilege then v_msg := 'privilegio'; end;
  if v_msg is distinct from 'privilegio' then
    raise exception 'FALLÓ 10: la dueña pudo escribir un pago saltándose las RPC';
  end if;
  begin
    perform add_appointment_payment(v_otro, v_apt_o, 100, 'cash', 'deposit'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Ese negocio no es tuyo.' then
    raise exception 'FALLÓ 10: pagar en un negocio ajeno dio "%"', coalesce(v_msg, 'éxito');
  end if;
  begin
    perform add_appointment_payment(v_biz, v_apt_o, 100, 'cash', 'deposit'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  if v_msg is distinct from 'Esa cita no existe en tu negocio.' then
    raise exception 'FALLÓ 10: pagar una cita ajena con mi negocio dio "%"', coalesce(v_msg, 'éxito');
  end if;
  execute 'reset role';

  -- 11 · Reintento con el mismo id de pago: no paga dos veces.
  perform add_appointment_payment(v_biz, v_aptE, 300, 'cash', 'deposit', 999841);
  begin
    perform add_appointment_payment(v_biz, v_aptE, 300, 'cash', 'deposit', 999841);
    v_msg := null;
  exception when unique_violation then v_msg := 'duplicado'; end;
  select count(*) into v_n from appointment_payment where id = 999841;
  if v_msg is distinct from 'duplicado' or v_n <> 1 then
    raise exception 'FALLÓ 11: el reintento con el mismo id pagó dos veces (%)', v_n;
  end if;

  -- 12 · anon no ejecuta.
  if has_function_privilege('anon', 'public.add_appointment_payment(bigint,bigint,bigint,text,text,bigint)', 'execute')
     or has_function_privilege('anon', 'public.complete_appointment(bigint,bigint,bigint,bigint,bigint,jsonb,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.schedule_appointment(bigint,bigint,text,text,bigint,bigint,bigint[],text)', 'execute') then
    raise exception 'FALLÓ 12: anon puede ejecutar una RPC de pagos';
  end if;

  delete from business where id in (v_biz, v_otro);
  delete from auth.users where id in (v_uid, v_uid2);
end $$;

select 'VERDE: las 12 aserciones de pagos pasaron' as resultado;
