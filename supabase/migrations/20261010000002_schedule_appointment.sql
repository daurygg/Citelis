-- Agendar una cita con sus servicios en UNA transacción
-- (T6c de odd/tasks/multi-service-appointments.md).
--
-- POR QUÉ ES UNA RPC Y NO DOS ESCRITURAS DESDE EL NAVEGADOR
--   Una cita de varios servicios son dos escrituras: la cita y sus líneas de
--   `appointment_service`. Desde el navegador (`persist()` es "dispara y olvida")
--   la primera puede entrar y la segunda no, y la cita quedaría sin sus líneas.
--   La dueña la vería con UN solo servicio, la cobraría como de un servicio, y
--   `complete_appointment` rechazaría el cobro porque el conjunto no cuadra... o,
--   peor, se congelaría un dinero que no corresponde a lo que se hizo. Por eso la
--   cita y todas sus líneas entran juntas o no entra ninguna.
--
-- QUÉ HACE Y QUÉ NO
--   NO toca dinero: las líneas nacen con precio, costo y ganancia en null. Todo
--   eso se congela al COMPLETAR (INVARIANTE 2), con `complete_appointment`.
--   La cita nace SIEMPRE `PENDING`: esta función no acepta otro estado, así que
--   no sirve para colar una cita ya cobrada ni saltarse la máquina de estados
--   (INVARIANTE 7). La atención de mostrador también pasa por aquí y se cobra
--   después, con la otra función.
--
-- EL ID LO ELIGE EL CLIENTE
--   Igual que el resto del store (`newId()`): es un bigint que la app genera y
--   así la fachada local no espera al servidor para conocerlo. Si coincide con
--   uno existente la llave primaria rechaza el alta (no pisa nada). No es un
--   riesgo entre negocios: un id repetido solo produce un error, nunca lee ni
--   modifica la cita de otro.
--
-- LO QUE EL SERVIDOR EXIGE
--   · La llamante es miembro del negocio (INVARIANTE 1).
--   · Al menos un servicio, sin repetirse.
--   · Cada servicio es de ESE negocio (INVARIANTE 1) y dura más de 0 minutos
--     (con duración 0 la cita no ocuparía hueco en la agenda).
--   · El servicio principal (`appointment.service_id`) es el primero de la lista.
--   · Dinero no negativo en precio acordado y abono, si vienen.
--
-- ADITIVA: solo crea una función. No toca ni una fila existente.

create or replace function schedule_appointment(
  p_business_id    bigint,
  p_appointment_id bigint,
  p_client         text,
  p_datetime       text,
  p_quoted_price   bigint,
  p_deposit        bigint,
  p_service_ids    bigint[]
)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_n        integer;
  v_distinct integer;
  v_valid    integer;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;

  if p_client is null or btrim(p_client) = '' then
    raise exception 'Falta el nombre de la clienta.';
  end if;
  if p_datetime is null or btrim(p_datetime) = '' then
    raise exception 'Falta la fecha y hora de la cita.';
  end if;
  if (p_quoted_price is not null and p_quoted_price < 0)
     or (p_deposit is not null and p_deposit < 0) then
    raise exception 'Los montos de la cita no son válidos.';
  end if;

  if p_service_ids is null or coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'Elige al menos un servicio.';
  end if;
  if array_position(p_service_ids, null) is not null then
    raise exception 'Hay un servicio vacío en la lista.';
  end if;

  select count(*), count(distinct s) into v_n, v_distinct from unnest(p_service_ids) as s;
  if v_n <> v_distinct then raise exception 'Un servicio aparece repetido en la cita.'; end if;

  -- INVARIANTE 1: todos del negocio. Y con duración real: una duración 0 deja la
  -- cita sin hueco en la agenda y permite doble reserva sin que nadie lo note.
  select count(*) into v_valid
    from service
   where business_id = p_business_id
     and id = any (p_service_ids)
     and duration_min > 0;
  if v_valid <> v_n then
    raise exception 'Un servicio no pertenece a tu negocio o no tiene duración.';
  end if;

  insert into appointment (id, business_id, service_id, client, datetime, status,
                           quoted_price, deposit, charged_price, actual_cost, profit)
  values (p_appointment_id, p_business_id, p_service_ids[1], p_client, p_datetime, 'PENDING',
          p_quoted_price, p_deposit, null, null, null);

  insert into appointment_service (appointment_id, service_id, business_id)
  select p_appointment_id, s, p_business_id from unnest(p_service_ids) as s;
end $$;

-- Solo la dueña autenticada, igual que complete_appointment.
revoke execute on function schedule_appointment(bigint, bigint, text, text, bigint, bigint, bigint[]) from public;
revoke execute on function schedule_appointment(bigint, bigint, text, text, bigint, bigint, bigint[]) from anon;
grant  execute on function schedule_appointment(bigint, bigint, text, text, bigint, bigint, bigint[]) to authenticated;
