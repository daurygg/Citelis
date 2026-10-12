-- Descuentos por línea (P2 de odd/tasks/payments-and-receipt.md).
--
-- QUÉ GUARDA CADA LÍNEA DE `appointment_service`
--   list_price    precio bruto de la línea, ANTES del descuento.
--   discount      descuento en centavos (>= 0), ya calculado por el dominio.
--   charged_price lo que se cobró por la línea = list_price - discount (el NETO).
--                 Es la columna que los reportes ya leen: no cambia de significado.
-- El `charged_price` de la cita es la suma de los netos. El subtotal y el total de
-- descuentos del recibo se derivan sumando `list_price` y `discount`.
--
-- COBRAR (`complete_appointment`)
--   Cada línea de `p_lines` puede traer `list_price` y `discount` (opcionales).
--   Si faltan, la línea es sin descuento: list_price = charged_price, discount = 0
--   (así sigue funcionando todo cliente anterior). Se valida que ninguno sea
--   negativo, que discount <= list_price y que charged_price = list_price - discount.
--   Todo lo demás de la función queda igual a 20261010000008_employees.sql.
--
-- HISTORIAL (INVARIANTE 2)
--   El respaldo de abajo REGISTRA, no inventa: las líneas viejas no tenían
--   descuento, así que su precio de lista fue lo que se cobró. Una cita COMPLETED
--   no se puede volver a cobrar, así que nada de esto reescribe historia.
--
-- ADITIVA: columnas nuevas, respaldo y `create or replace` de la función.

alter table appointment_service
  add column if not exists list_price bigint,
  add column if not exists discount   bigint not null default 0 check (discount >= 0);

update appointment_service
   set list_price = charged_price
 where list_price is null and charged_price is not null;

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
  v_bad_emp  integer;
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
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint);

  if v_nulls > 0 then raise exception 'Hay líneas con montos incompletos o inválidos.'; end if;
  if v_n <> v_distinct then raise exception 'Un servicio aparece repetido en las líneas.'; end if;

  -- Cada línea cuadra por sí sola: la ganancia se deriva, no se elige.
  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
     where l.profit <> l.charged_price - l.actual_cost
  ) then
    raise exception 'La ganancia de una línea no es precio menos costo.';
  end if;

  -- Descuentos: sin lista ni descuento la línea es sin descuento (lista = lo
  -- cobrado). Nada negativo, y nunca más descuento que precio de lista.
  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
     where coalesce(l.discount, 0) < 0
        or coalesce(l.list_price, l.charged_price) < 0
        or coalesce(l.discount, 0) > coalesce(l.list_price, l.charged_price)
  ) then
    raise exception 'Hay líneas con un descuento inválido.';
  end if;
  -- Lo cobrado por línea es el NETO: lista menos descuento.
  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
     where l.charged_price <> coalesce(l.list_price, l.charged_price) - coalesce(l.discount, 0)
  ) then
    raise exception 'El precio de una línea no es precio de lista menos descuento.';
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
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint);
  if v_expected is distinct from v_given then
    raise exception 'Los servicios de las líneas no son los de la cita.';
  end if;

  -- INVARIANTE 1: ningún servicio de otro negocio.
  select count(*) into v_foreign
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
    left join service s on s.id = l.service_id and s.business_id = p_business_id
   where s.id is null;
  if v_foreign > 0 then raise exception 'Un servicio no pertenece a tu negocio.'; end if;

  -- INVARIANTE 1 también para quién lo hizo: la empleada, si viene, es de ESTE
  -- negocio. Y tiene que estar activa AHORA: cobrar es el momento en que se
  -- asigna, y una empleada dada de baja ya no trabaja ahí. Su historial no se
  -- toca (las líneas ya cobradas conservan su `employee_id`).
  select count(*) into v_bad_emp
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
    left join employee e on e.id = l.employee_id and e.business_id = p_business_id
   where l.employee_id is not null and e.id is null;
  if v_bad_emp > 0 then raise exception 'Una empleada no pertenece a tu negocio.'; end if;
  select count(*) into v_bad_emp
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
    join employee e on e.id = l.employee_id and e.business_id = p_business_id
   where not e.active;
  if v_bad_emp > 0 then raise exception 'Una empleada está dada de baja y no se puede asignar.'; end if;

  -- Todo comprobado: se congela. Cita y líneas, en esta misma transacción.
  update appointment
     set status = 'COMPLETED',
         charged_price = p_charged_price,
         actual_cost = p_actual_cost,
         profit = p_profit
   where id = p_appointment_id and business_id = p_business_id;

  insert into appointment_service (appointment_id, service_id, business_id,
                                   charged_price, actual_cost, profit, employee_id,
                                   list_price, discount)
  select p_appointment_id, l.service_id, p_business_id,
         l.charged_price, l.actual_cost, l.profit, l.employee_id,
         coalesce(l.list_price, l.charged_price), coalesce(l.discount, 0)
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
  on conflict (appointment_id, service_id) do update
    set charged_price = excluded.charged_price,
        actual_cost   = excluded.actual_cost,
        profit        = excluded.profit,
        employee_id   = excluded.employee_id,
        list_price    = excluded.list_price,
        discount      = excluded.discount;

end $$;

-- Solo la dueña autenticada. Sin esto, `anon` podría intentar completar citas
-- (la comprobación de membresía lo frenaría, pero no hace falta ni que llegue).
revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb) from public;
revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb) from anon;
grant  execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb) to authenticated;
