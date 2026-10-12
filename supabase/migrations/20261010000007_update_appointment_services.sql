-- Cambiar los servicios de una cita ya agendada, en UNA transacción
-- (odd/tasks/edit-appointment-services.md).
--
-- POR QUÉ ES UNA RPC Y NO ESCRITURAS SUELTAS DESDE EL NAVEGADOR
--   Cambiar los servicios es reemplazar las líneas de `appointment_service` Y
--   actualizar `appointment.service_id` (el servicio principal). Desde el
--   navegador (`persist()` es "dispara y olvida") serían un borrado, unos inserts
--   y un update sueltos: si el borrado entra y un insert no, la cita se queda sin
--   algún servicio —la dueña la cobraría de menos, y `complete_appointment`
--   rechazaría un conjunto que no cuadra— o sin NINGUNA línea, y entonces
--   `public_request_booking` la trataría como de duración desconocida y
--   bloquearía el portal 24 h (fallo seguro de A6). Aquí las líneas se reemplazan
--   enteras o no cambia nada.
--
-- QUÉ HACE Y QUÉ NO
--   NO toca dinero: las líneas nuevas nacen con precio, costo y ganancia en null.
--   Todo se congela al COMPLETAR (INVARIANTE 2). Solo acepta citas que aún no son
--   historia: REQUESTED, PENDING e IN_PROGRESS. Una COMPLETED es un hecho
--   inmutable y esta función no sirve para reescribirla; CANCELED, NO_SHOW y
--   REJECTED tampoco. No cambia el estado (INVARIANTE 7) ni la fecha: mover la
--   hora es `reschedule`.
--   No toca `quoted_price` ni `deposit`: es lo que la dueña acordó con la clienta
--   y cambiarlo sería una decisión de producto, no un efecto colateral de esta
--   función.
--
-- EL CHOQUE DE HORARIO NO SE REVALIDA AQUÍ (decisión deliberada)
--   Que la nueva suma de duraciones quepa (otras citas, bloqueos, horario) lo
--   comprueba el dominio en el cliente (`checkServicesEdit`), igual que ya hacen
--   `schedule_appointment` y reprogramar: los flujos de la dueña nunca han
--   validado choques en SQL. Replicarlo aquí crearía una TERCERA copia de la
--   matemática de duraciones (junto a availability.ts y public_request_booking),
--   y esas copias ya se separaron una vez en producción. Lo que el servidor sí
--   garantiza es lo que no se puede arreglar después: estado, pertenencia al
--   negocio (INVARIANTE 1) y que las líneas queden íntegras.
--   Riesgo aceptado: una clienta que reserve por el portal, en el mismo instante,
--   justo sobre el tiempo añadido; la dueña lo vería en la agenda como un choque
--   más, igual que hoy con una cita agendada desde dos pantallas.
--
-- LO QUE EL SERVIDOR EXIGE
--   · La llamante es miembro del negocio (INVARIANTE 1).
--   · La cita es de ese negocio; se bloquea con `for update` para que dos
--     ediciones (o un cobro) a la vez no se pisen.
--   · Estado REQUESTED, PENDING o IN_PROGRESS.
--   · Al menos un servicio, sin nulos ni repetidos.
--   · Cada servicio es de ESE negocio y dura más de 0 minutos.
--   · El servicio principal es el primero de la lista.
--
-- ADITIVA: solo crea una función. No toca ni una fila existente.

create or replace function update_appointment_services(
  p_business_id    bigint,
  p_appointment_id bigint,
  p_service_ids    bigint[]
)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_status   text;
  v_n        integer;
  v_distinct integer;
  v_valid    integer;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;

  -- La cita, del negocio y bloqueada hasta el final de la transacción.
  select status into v_status
    from appointment
   where id = p_appointment_id and business_id = p_business_id
     for update;
  if not found then raise exception 'No encontramos esa cita.'; end if;

  if v_status not in ('REQUESTED', 'PENDING', 'IN_PROGRESS') then
    raise exception 'Esta cita ya no se puede modificar.';
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

  delete from appointment_service
   where appointment_id = p_appointment_id and business_id = p_business_id;

  insert into appointment_service (appointment_id, service_id, business_id)
  select p_appointment_id, s, p_business_id from unnest(p_service_ids) as s;

  update appointment
     set service_id = p_service_ids[1]
   where id = p_appointment_id and business_id = p_business_id;
end $$;

-- Solo la dueña autenticada, igual que schedule_appointment.
revoke execute on function update_appointment_services(bigint, bigint, bigint[]) from public;
revoke execute on function update_appointment_services(bigint, bigint, bigint[]) from anon;
grant  execute on function update_appointment_services(bigint, bigint, bigint[]) to authenticated;
