-- Dos arreglos a las garantías de líneas de servicio (appointment_service).
--
-- POR QUÉ SON DIFERIDOS
--   `schedule_appointment` y `complete_appointment` escriben las líneas en la
--   MISMA transacción que la cita. Si los triggers corrieran al instante, verían
--   la cita a medias. Diferidos, corren en el COMMIT, cuando la transacción ya
--   dejó todo escrito, y solo actúan si algo faltó (agenda vieja que solo
--   escribe en `appointment`).
--
-- ARREGLO 1: ensure_primary_service_line() contra citas ya borradas
--   Si una transacción inserta una cita y la BORRA antes del commit (así limpian
--   las suites SQL), el trigger diferido disparaba igual e intentaba insertar una
--   línea para una cita que ya no existe: 23503 por la FK
--   appointment_service_appointment_id_fkey. Ahora relee la cita: si no existe
--   no hace nada, y si existe usa sus valores ACTUALES (pudo actualizarse en la
--   misma transacción), no los de NEW.
--
-- ARREGLO 2: congelar la línea única de una cita completada por la UI vieja
--   La UI vieja de la dueña completa citas actualizando solo `appointment`
--   (dinero congelado) y NO `appointment_service`, dejando su única línea con
--   dinero NULL. Un trigger diferido al cambiar `status` copia el dinero de la
--   cita a esa línea. Es la misma regla del relleno original: en una cita de un
--   solo servicio la línea ES el total de la cita, así que se REGISTRA historia,
--   no se inventa (INVARIANTE 2).
--   - Nunca toca líneas que ya tienen dinero: `complete_appointment` las llena en
--     su transacción, así que en el commit ya tienen dinero y esto no hace nada.
--   - Nunca toca citas con VARIAS líneas y dinero NULL: repartir el total en
--     partes iguales sería inventar historia. Esas quedan para revisión humana.

create or replace function ensure_primary_service_line()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_appt appointment%rowtype;
begin
  -- Relee la cita: pudo borrarse o cambiar dentro de la misma transacción.
  select * into v_appt from appointment where id = new.id;
  if not found then
    return null;
  end if;

  if not exists (select 1 from appointment_service where appointment_id = v_appt.id) then
    insert into appointment_service (appointment_id, service_id, business_id,
                                     charged_price, actual_cost, profit)
    values (v_appt.id, v_appt.service_id, v_appt.business_id,
            v_appt.charged_price, v_appt.actual_cost, v_appt.profit)
    on conflict (appointment_id, service_id) do nothing;
  end if;
  return null;
end $$;

revoke execute on function ensure_primary_service_line() from public;
revoke execute on function ensure_primary_service_line() from anon, authenticated;

create or replace function freeze_single_service_line()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_appt appointment%rowtype;
begin
  select * into v_appt from appointment where id = new.id;
  if not found or v_appt.status <> 'COMPLETED' then
    return null;
  end if;

  -- Solo citas con EXACTAMENTE una línea y esa línea sin dinero.
  if (select count(*) from appointment_service where appointment_id = v_appt.id) = 1 then
    update appointment_service
       set charged_price = v_appt.charged_price,
           actual_cost   = v_appt.actual_cost,
           profit        = v_appt.profit
     where appointment_id = v_appt.id
       and charged_price is null;
  end if;
  return null;
end $$;

revoke execute on function freeze_single_service_line() from public;
revoke execute on function freeze_single_service_line() from anon, authenticated;

drop trigger if exists appointment_freeze_single_line on appointment;
create constraint trigger appointment_freeze_single_line
  after update of status on appointment
  deferrable initially deferred
  for each row execute function freeze_single_service_line();

-- Reparación única: citas COMPLETED ya existentes con una sola línea sin dinero
-- (p. ej. la completada por la UI vieja antes de este trigger).
update appointment_service s
   set charged_price = a.charged_price,
       actual_cost   = a.actual_cost,
       profit        = a.profit
  from appointment a
 where a.id = s.appointment_id
   and a.status = 'COMPLETED'
   and s.charged_price is null
   and (select count(*) from appointment_service x where x.appointment_id = a.id) = 1;
