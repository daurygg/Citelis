-- Rellena las líneas de servicio que falten, y deja la función para re-correrla.
--
-- POR QUÉ
--   Desde 20260929000002 las RPC del portal miden la duración de una cita SOLO
--   por sus filas de `appointment_service`. Una cita sin filas cuenta como de
--   duración desconocida y, por el fallo seguro, bloquea el portal desde su hora
--   hasta el final del día.
--   El relleno de 20260929000001 corrió una sola vez. Las citas que se creen
--   después con un frontend viejo (que solo escribe en `appointment`) quedan sin
--   líneas. Eso pasa en la ventana del release entre el `db push` y el despliegue
--   del frontend que usa `schedule_appointment`.
--
-- QUÉ HACE
--   Le da a cada cita sin líneas UNA, la de su `service_id`, con su mismo dinero
--   congelado. Es exactamente lo que hizo el relleno original, así que no inventa
--   historia (INVARIANTE 2). Las citas que ya tienen líneas no se tocan.
--
-- CÓMO SE USA
--   Corre una vez al aplicar esta migración. Desde ahí el trigger del final evita
--   que aparezcan citas nuevas sin líneas. La función queda por si hace falta:
--     select backfill_missing_service_lines();
--   Solo la ejecuta `postgres`: no se concede a anon ni a authenticated.

create or replace function backfill_missing_service_lines()
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_inserted integer;
begin
  insert into appointment_service (appointment_id, service_id, business_id,
                                   charged_price, actual_cost, profit)
  select a.id, a.service_id, a.business_id, a.charged_price, a.actual_cost, a.profit
    from appointment a
   where not exists (select 1 from appointment_service s where s.appointment_id = a.id)
      on conflict (appointment_id, service_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

revoke execute on function backfill_missing_service_lines() from public;
revoke execute on function backfill_missing_service_lines() from anon, authenticated;

select backfill_missing_service_lines();

-- GARANTÍA PERMANENTE: ninguna cita termina su transacción sin líneas.
--   Trigger de restricción DIFERIDO: corre en el COMMIT, no en el insert. Si
--   quien creó la cita escribió sus líneas en la misma transacción (lo que hace
--   `schedule_appointment`), al llegar el commit ya las tiene y no hace nada. Si
--   no (la agenda vieja, que solo escribe en `appointment`), le pone la línea de
--   su `service_id`. Así una cita nunca bloquea el portal por falta de líneas,
--   sin depender de que alguien re-corra el relleno a mano.
create or replace function ensure_primary_service_line()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from appointment_service where appointment_id = new.id) then
    insert into appointment_service (appointment_id, service_id, business_id,
                                     charged_price, actual_cost, profit)
    values (new.id, new.service_id, new.business_id,
            new.charged_price, new.actual_cost, new.profit)
    on conflict (appointment_id, service_id) do nothing;
  end if;
  return null;
end $$;

revoke execute on function ensure_primary_service_line() from public;
revoke execute on function ensure_primary_service_line() from anon, authenticated;

drop trigger if exists appointment_ensure_service_line on appointment;
create constraint trigger appointment_ensure_service_line
  after insert on appointment
  deferrable initially deferred
  for each row execute function ensure_primary_service_line();
