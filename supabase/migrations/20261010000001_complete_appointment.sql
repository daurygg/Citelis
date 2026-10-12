-- Completar una cita congela su dinero Y el de cada servicio, en UNA transacción
-- (T6b de odd/tasks/multi-service-appointments.md).
--
-- POR QUÉ ES UNA RPC Y NO DOS ESCRITURAS DESDE EL NAVEGADOR
--   El store escribe con `persist()`, que es "dispara y olvida": no espera la
--   respuesta y, si falla, solo deja un `console.error`. Con una cita de varios
--   servicios hay dos escrituras (la cita y sus líneas de `appointment_service`).
--   Si la primera entra y la segunda no, la cita queda COMPLETED sin su reparto, y
--   eso no se puede arreglar después: repartir la ganancia a posteriori sería
--   inventar una regla sobre dinero histórico, justo lo que la INVARIANTE 2
--   prohíbe. Por eso las dos cosas entran juntas o no entra ninguna.
--
-- QUÉ HACE Y QUÉ NO
--   NO calcula nada. Los precios, costos y el reparto los decide el dominio puro
--   (`completeAppointment` + `appointmentServiceLines`, INVARIANTE 5) y llegan ya
--   hechos. La función solo PERSISTE, y desconfía de lo que le llega: comprueba
--   que las cuentas cuadren y que sea la cita correcta en el estado correcto.
--
-- LO QUE EL SERVIDOR EXIGE
--   · La llamante es miembro del negocio (INVARIANTE 1) y la cita es de ese negocio.
--   · La cita está PENDING o IN_PROGRESS. Una COMPLETED es historia inmutable
--     (INVARIANTE 2): llamar otra vez NO cambia sus números. REQUESTED, CANCELED,
--     NO_SHOW y REJECTED tampoco pueden saltar a COMPLETED (INVARIANTE 7).
--   · Las líneas son EXACTAMENTE los servicios de la cita: los de
--     `appointment_service` o, si la cita no tiene filas todavía (las que agenda
--     hoy la dueña), solo `appointment.service_id`, y entonces se insertan.
--   · Cada servicio es del mismo negocio, sin repetirse.
--   · Las líneas suman los totales (precio, costo y ganancia) y cada una cumple
--     ganancia = precio − costo.
--
-- ADITIVA: solo crea una función. No toca ni una fila existente.

create or replace function complete_appointment(
  p_business_id    bigint,
  p_appointment_id bigint,
  p_charged_price  bigint,
  p_actual_cost    bigint,
  p_profit         bigint,
  p_lines          jsonb
)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_apt      appointment%rowtype;
  v_expected bigint[];
  v_given    bigint[];
  v_n        integer;
  v_distinct integer;
  v_nulls    integer;
  v_sum_chg  bigint;
  v_sum_cost bigint;
  v_sum_prof bigint;
  v_foreign  integer;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;

  -- Bloqueo de fila: dos cobros a la vez de la misma cita se serializan, y el
  -- segundo ve ya el estado COMPLETED y se rechaza.
  select * into v_apt
    from appointment
   where id = p_appointment_id and business_id = p_business_id
     for update;
  if not found then raise exception 'Esa cita no existe en tu negocio.'; end if;

  if v_apt.status not in ('PENDING', 'IN_PROGRESS') then
    raise exception 'La cita % está en estado % y no se puede completar.', p_appointment_id, v_apt.status;
  end if;

  if p_charged_price is null or p_actual_cost is null or p_profit is null
     or p_charged_price < 0 or p_actual_cost < 0 then
    raise exception 'Los montos del cobro no son válidos.';
  end if;
  if p_profit <> p_charged_price - p_actual_cost then
    raise exception 'La ganancia no es precio menos costo.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Faltan las líneas de servicio de la cita.';
  end if;

  -- Las líneas llegan como jsonb; cada comprobación las lee con `jsonb_to_recordset`.
  -- Sin tabla temporal a propósito: una función que crea objetos propios es más
  -- difícil de razonar y de probar que repetir una cláusula `from`.
  select count(*), count(distinct service_id),
         count(*) filter (where service_id is null or charged_price is null
                             or actual_cost is null or profit is null
                             or charged_price < 0 or actual_cost < 0),
         sum(charged_price), sum(actual_cost), sum(profit)
    into v_n, v_distinct, v_nulls, v_sum_chg, v_sum_cost, v_sum_prof
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint);

  if v_nulls > 0 then raise exception 'Hay líneas con montos incompletos o inválidos.'; end if;
  if v_n <> v_distinct then raise exception 'Un servicio aparece repetido en las líneas.'; end if;

  -- Cada línea cuadra por sí sola: la ganancia se deriva, no se elige.
  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint)
     where l.profit <> l.charged_price - l.actual_cost
  ) then
    raise exception 'La ganancia de una línea no es precio menos costo.';
  end if;

  -- Y entre todas suman lo que se congela en la cita.
  if v_sum_chg <> p_charged_price or v_sum_cost <> p_actual_cost or v_sum_prof <> p_profit then
    raise exception 'Las líneas no suman el total de la cita.';
  end if;

  -- El conjunto de servicios es EXACTAMENTE el de la cita.
  select array_agg(service_id order by service_id) into v_expected
    from appointment_service
   where appointment_id = p_appointment_id and business_id = p_business_id;
  if v_expected is null then
    v_expected := array[v_apt.service_id];
  end if;
  select array_agg(l.service_id order by l.service_id) into v_given
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint);
  if v_expected is distinct from v_given then
    raise exception 'Los servicios de las líneas no son los de la cita.';
  end if;

  -- INVARIANTE 1: ningún servicio de otro negocio.
  select count(*) into v_foreign
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint)
    left join service s on s.id = l.service_id and s.business_id = p_business_id
   where s.id is null;
  if v_foreign > 0 then raise exception 'Un servicio no pertenece a tu negocio.'; end if;

  -- Todo comprobado: se congela. Cita y líneas, en esta misma transacción.
  update appointment
     set status = 'COMPLETED',
         charged_price = p_charged_price,
         actual_cost = p_actual_cost,
         profit = p_profit
   where id = p_appointment_id and business_id = p_business_id;

  insert into appointment_service (appointment_id, service_id, business_id,
                                   charged_price, actual_cost, profit)
  select p_appointment_id, l.service_id, p_business_id,
         l.charged_price, l.actual_cost, l.profit
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint)
  on conflict (appointment_id, service_id) do update
    set charged_price = excluded.charged_price,
        actual_cost   = excluded.actual_cost,
        profit        = excluded.profit;

end $$;

-- Solo la dueña autenticada. Sin esto, `anon` podría intentar completar citas
-- (la comprobación de membresía lo frenaría, pero no hace falta ni que llegue).
revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb) from public;
revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb) from anon;
grant  execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb) to authenticated;
