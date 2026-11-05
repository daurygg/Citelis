-- Mensajes del servidor sin género asumido (odd/tasks/owner-profile.md, S7; invariante 4).
-- Los negocios atienden a hombres y mujeres, y el equipo no es solo de mujeres:
--   'Falta el nombre de la clienta.'                       → 'Falta el nombre del cliente.'
--   'Esa clienta no pertenece a tu negocio.'               → 'Ese cliente no pertenece a tu negocio.'
--   'Una empleada no pertenece a tu negocio.'              → 'Esa persona no pertenece a tu equipo.'
--   'Una empleada está dada de baja y no se puede asignar.' → 'Esa persona ya no está en tu equipo y no se puede asignar.'
--
-- Las dos funciones se recrean con el texto EXACTO de su última definición
-- (schedule_appointment: 20261104000001_client_phone_validation.sql;
--  complete_appointment: 20261010000011_business_receipt_profile.sql) y UN solo
-- cambio: esos mensajes. Misma firma, así que `create or replace` basta.
-- Los comentarios internos se copian tal cual.

-- ── schedule_appointment ────────────────────────────────────────────────────
create or replace function schedule_appointment(
  p_business_id     bigint,
  p_appointment_id  bigint,
  p_client          text,
  p_datetime        text,
  p_quoted_price    bigint,
  p_deposit         bigint,
  p_service_ids     bigint[],
  p_deposit_method  text   default null,
  p_client_phone    text   default null,
  p_client_id       bigint default null
)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_n        integer;
  v_distinct integer;
  v_valid    integer;
  v_phone    text;
  v_digits   text;
  v_client   bigint;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;

  if p_client is null or btrim(p_client) = '' then
    raise exception 'Falta el nombre del cliente.';
  end if;
  if p_datetime is null or btrim(p_datetime) = '' then
    raise exception 'Falta la fecha y hora de la cita.';
  end if;
  if (p_quoted_price is not null and p_quoted_price < 0)
     or (p_deposit is not null and p_deposit < 0) then
    raise exception 'Los montos de la cita no son válidos.';
  end if;
  if p_deposit_method is not null and p_deposit_method not in ('cash', 'transfer', 'card') then
    raise exception 'La vía de pago no es válida.';
  end if;

  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Elige al menos un servicio.';
  end if;
  if array_position(p_service_ids, null) is not null then
    raise exception 'Hay un servicio vacío en la lista.';
  end if;

  select count(*), count(distinct s) into v_n, v_distinct from unnest(p_service_ids) as s;
  if v_n <> v_distinct then raise exception 'Un servicio aparece repetido en la cita.'; end if;

  select count(*) into v_valid
    from service
   where business_id = p_business_id
     and id = any (p_service_ids)
     and duration_min > 0;
  if v_valid <> v_n then
    raise exception 'Un servicio no pertenece a tu negocio o no tiene duración.';
  end if;

  -- Clienta (INVARIANTE 1: siempre dentro de ESTE negocio).
  v_phone := nullif(btrim(p_client_phone), '');
  if v_phone is not null then
    v_digits := client_phone_digits(v_phone);
    if v_digits is null then raise exception 'El teléfono no es válido.'; end if;
    -- Regla completa (letras, largo). Con una clienta elegida, su teléfono ya guardado se
    -- acepta tal cual aunque sea anterior a esta regla: no se le bloquea agendarla.
    if not client_phone_is_valid(v_phone)
       and not (p_client_id is not null
                and exists (select 1 from client
                             where id = p_client_id and business_id = p_business_id
                               and btrim(phone) is not distinct from v_phone)) then
      raise exception 'El teléfono no es válido.';
    end if;
  end if;

  if p_client_id is not null then
    select id, coalesce(v_phone, phone) into v_client, v_phone
      from client where id = p_client_id and business_id = p_business_id;
    if v_client is null then
      raise exception 'Ese cliente no pertenece a tu negocio.';
    end if;
  elsif v_phone is not null then
    select id into v_client from client
     where business_id = p_business_id and phone_digits = v_digits;
    if v_client is null then
      -- Alta idempotente: si dos primeras reservas con el mismo teléfono corren a la vez,
      -- la segunda chocaría con el índice único y fallaría toda la cita. Con `do nothing`
      -- no falla: no devuelve fila y se reutiliza la que ganó la carrera. El destino del
      -- `on conflict` repite EXACTO el índice parcial client_business_phone_digits_uidx.
      insert into client (business_id, name, phone)
      values (p_business_id, btrim(p_client), v_phone)
      on conflict (business_id, phone_digits) where phone_digits is not null do nothing
      returning id into v_client;
      if v_client is null then
        select id into v_client from client
         where business_id = p_business_id and phone_digits = v_digits;
      end if;
    end if;
  else
    -- Sin teléfono ni clienta elegida: antes cada cita creaba una clienta nueva y la
    -- lista se llenaba de "Ana", "Ana", "Ana". Se reutiliza la clienta SIN teléfono de
    -- este negocio con el mismo nombre (sin mayúsculas ni espacios de más; las tildes
    -- sí cuentan, porque el proyecto no usa `unaccent`). Si hay varias, la más antigua.
    -- Es "mejor esfuerzo": no hay índice único por nombre, así que dos citas simultáneas
    -- de una clienta nueva sin teléfono podrían crear dos filas. Aceptado: es un duplicado
    -- inocuo, no un fallo, y la dueña puede elegirla en el selector.
    select id into v_client from client
     where business_id = p_business_id and phone is null
       and lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
         = lower(regexp_replace(btrim(p_client), '\s+', ' ', 'g'))
     order by id
     limit 1;
    if v_client is null then
      insert into client (business_id, name, phone)
      values (p_business_id, btrim(p_client), null)
      returning id into v_client;
    end if;
  end if;

  insert into appointment (id, business_id, service_id, client, client_phone, client_id, datetime,
                           status, quoted_price, deposit, charged_price, actual_cost, profit)
  values (p_appointment_id, p_business_id, p_service_ids[1], p_client, v_phone, v_client, p_datetime,
          'PENDING', p_quoted_price, p_deposit, null, null, null);

  insert into appointment_service (appointment_id, service_id, business_id)
  select p_appointment_id, s, p_business_id from unnest(p_service_ids) as s;

  -- El abono es un pago: nace con la cita o no nace ninguno. Sin vía (llamadas de 7
  -- argumentos del frontend anterior) queda como "sin vía registrada" (legacy).
  if p_deposit is not null and p_deposit > 0 then
    insert into appointment_payment (business_id, appointment_id, amount, method, kind, legacy)
    values (p_business_id, p_appointment_id, p_deposit, p_deposit_method, 'deposit',
            p_deposit_method is null);
  end if;
end $$;

revoke execute on function schedule_appointment(bigint, bigint, text, text, bigint, bigint, bigint[], text, text, bigint) from public;
revoke execute on function schedule_appointment(bigint, bigint, text, text, bigint, bigint, bigint[], text, text, bigint) from anon;
grant  execute on function schedule_appointment(bigint, bigint, text, text, bigint, bigint, bigint[], text, text, bigint) to authenticated;

-- ── complete_appointment ────────────────────────────────────────────────────
create or replace function complete_appointment(
  p_business_id    bigint,
  p_appointment_id bigint,
  p_charged_price  bigint,
  p_actual_cost    bigint,
  p_profit         bigint,
  p_lines          jsonb,
  p_payments       jsonb default '[]'
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
  v_paid_old bigint;
  v_paid_new bigint;
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

  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
     where l.profit <> l.charged_price - l.actual_cost
  ) then
    raise exception 'La ganancia de una línea no es precio menos costo.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
     where coalesce(l.discount, 0) < 0
        or coalesce(l.list_price, l.charged_price) < 0
        or coalesce(l.discount, 0) > coalesce(l.list_price, l.charged_price)
  ) then
    raise exception 'Hay líneas con un descuento inválido.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
     where l.charged_price <> coalesce(l.list_price, l.charged_price) - coalesce(l.discount, 0)
  ) then
    raise exception 'El precio de una línea no es precio de lista menos descuento.';
  end if;

  if v_sum_chg <> p_charged_price or v_sum_cost <> p_actual_cost or v_sum_prof <> p_profit then
    raise exception 'Las líneas no suman el total de la cita.';
  end if;

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

  select count(*) into v_foreign
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
    left join service s on s.id = l.service_id and s.business_id = p_business_id
   where s.id is null;
  if v_foreign > 0 then raise exception 'Un servicio no pertenece a tu negocio.'; end if;

  select count(*) into v_bad_emp
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
    left join employee e on e.id = l.employee_id and e.business_id = p_business_id
   where l.employee_id is not null and e.id is null;
  if v_bad_emp > 0 then raise exception 'Esa persona no pertenece a tu equipo.'; end if;
  select count(*) into v_bad_emp
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
    join employee e on e.id = l.employee_id and e.business_id = p_business_id
   where not e.active;
  if v_bad_emp > 0 then raise exception 'Esa persona ya no está en tu equipo y no se puede asignar.'; end if;

  -- Pagos (P3). Sin pagos, todo el cobro queda a crédito. Cada pago tiene monto
  -- positivo y una vía válida; los pagos nuevos más lo ya abonado no pueden pasar
  -- de lo cobrado. Que quede saldo pendiente SÍ se permite: es el crédito.
  if p_payments is null then p_payments := '[]'::jsonb; end if;
  if jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Los pagos no tienen un formato válido.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_payments) as p(amount bigint, method text)
     where p.amount is null or p.amount <= 0
  ) then
    raise exception 'El pago debe ser mayor que cero.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_payments) as p(amount bigint, method text)
     where p.method is null or p.method not in ('cash', 'transfer', 'card')
  ) then
    raise exception 'La vía de pago no es válida.';
  end if;
  select coalesce(sum(amount), 0) into v_paid_new
    from jsonb_to_recordset(p_payments) as p(amount bigint, method text);
  select coalesce(sum(amount), 0) into v_paid_old
    from appointment_payment
   where appointment_id = p_appointment_id and business_id = p_business_id;
  if v_paid_new > 0 and v_paid_old + v_paid_new > p_charged_price then
    raise exception 'Los pagos suman más de lo que se cobró.';
  end if;

  update appointment
     set status = 'COMPLETED',
         charged_price = p_charged_price,
         actual_cost = p_actual_cost,
         profit = p_profit,
         charged_by = auth.uid()
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

  insert into appointment_payment (business_id, appointment_id, amount, method, kind)
  select p_business_id, p_appointment_id, p.amount, p.method, 'charge'
    from jsonb_to_recordset(p_payments) as p(amount bigint, method text);

end $$;

revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb, jsonb) from public;
revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb, jsonb) from anon;
grant  execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb, jsonb) to authenticated;
