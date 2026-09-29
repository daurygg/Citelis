-- Una cita puede llevar VARIOS servicios (T3 de odd/tasks/multi-service-appointments.md).
--
-- EL PROBLEMA
--   `appointment.service_id` es una sola columna `not null`. Si una clienta
--   quiere cejas y trenzas hoy tiene que pedir dos citas, cosa que no se
--   sostiene. Y algunos negocios ya lo esquivan creando un servicio falso con
--   los tres nombres juntos y `supply_cost` en 0, lo que destruye el costo de
--   insumos de cada uno y hace que su reporte de rentabilidad mienta.
--
-- EXPANDIR, MIGRAR, CONTRAER (decisión D3)
--   Esta migración solo EXPANDE. Crea la relación, la rellena con lo que ya
--   existe, y deja `appointment.service_id` intacto como servicio principal.
--   Ninguna cita histórica se toca. Quitar esa columna, si llega el día, es
--   otro cambio y otra conversación.
--
-- POR QUÉ UNA FILA POR SERVICIO Y NO UN ARREGLO EN LA CITA
--   Porque cada línea tiene que poder llevar SU dinero (decisión D1) y, más
--   adelante, QUIÉN la hizo: en una visita con varios servicios cada uno puede
--   hacerlo una empleada distinta —las cejas una, las trenzas otra—, y la
--   factura que pidió el negocio lleva el nombre de cada una. Esa columna NO se
--   añade aquí a propósito: el concepto de empleado todavía no existe en el
--   modelo, y apuntarla hoy a `auth.users` obligaría a que toda empleada use la
--   aplicación, que es justo lo que no queremos decidir por accidente. Lo que
--   importa contemplar ahora es la FORMA; la columna será anulable y barata.
--
-- ADITIVA e idempotente: correrla contra una base con datos no borra ni una fila.

-- ── La relación ─────────────────────────────────────────────────────────────
create table if not exists appointment_service (
  appointment_id bigint not null references appointment (id) on delete cascade,
  service_id     bigint not null references service (id),
  -- Desnormalizado a propósito: es lo que mira la RLS (INVARIANTE 1), igual que
  -- el resto de tablas del proyecto. Sin él, cada comprobación de permiso
  -- tendría que saltar a `appointment` primero.
  business_id    bigint not null references business (id) on delete cascade,

  -- Dinero CONGELADO de esta línea al completar la cita (decisión D1).
  -- null mientras la cita no esté COMPLETED. Esto no recalcula historia: la
  -- registra, y es también la línea de la futura factura.
  charged_price  bigint,
  actual_cost    bigint,
  profit         bigint,

  -- Un mismo servicio no se repite dentro de una cita. Si algún día hace falta
  -- ("dos manicuras en la misma visita"), se cambia por un id propio más una
  -- cantidad; hoy sería complejidad sin caso que la pida.
  primary key (appointment_id, service_id)
);

-- Los reportes agrupan por servicio ("cuál me deja más"), y sin esto sería un
-- recorrido completo de la tabla cada vez.
create index if not exists appointment_service_service_idx
  on appointment_service (service_id);

-- ── Permisos ────────────────────────────────────────────────────────────────
alter table appointment_service enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'appointment_service'
       and policyname = 'appointment_service_all'
  ) then
    create policy appointment_service_all on appointment_service
      using (is_member(business_id)) with check (is_member(business_id));
  end if;
end $$;

-- ── Relleno ─────────────────────────────────────────────────────────────────
-- Cada cita que ya existe pasa a tener EXACTAMENTE una línea, con su propio
-- dinero congelado tal cual está. Una cita de un solo servicio produce una línea
-- idéntica a la cita, que es justo lo que devuelve `appointmentServiceLines` en
-- el dominio: los dos lados cuentan la misma historia.
--
-- `on conflict do nothing` para que re-correr la migración no falle ni duplique.
insert into appointment_service (appointment_id, service_id, business_id,
                                 charged_price, actual_cost, profit)
select a.id, a.service_id, a.business_id, a.charged_price, a.actual_cost, a.profit
  from appointment a
    on conflict (appointment_id, service_id) do nothing;
