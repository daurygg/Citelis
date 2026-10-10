# Pagos, empleadas y recibo térmico

## Objetivo

Que al cobrar una cita la dueña registre quién hizo cada servicio, los descuentos
y cómo le pagaron (en uno o varios pagos), y pueda imprimir un recibo térmico con
el logo del negocio y un QR a un recibo digital.

## Decisiones de la dueña (2026-10-10)

- El abono y el resto pueden pagarse por **vías distintas**: hacen falta varios
  pagos por cita.
- La factura lleva **el nombre de la empleada que hizo cada servicio**.
- La factura lleva **el logo** y es **tipo térmica** (ejemplo: encabezado con logo,
  nombre, dirección y teléfono; número `V-000014`, fecha, registrada, cajero,
  cliente; líneas con cantidad × precio, nota y descuento; subtotal, descuentos,
  TOTAL; crédito; QR "Tu recibo digital"; "¡Gracias por su compra!").
- Se pueden aplicar **descuentos**.
- Una cita puede tener **varios pagos**: el abono al reservar y el resto al cobrar (o
  después), cada uno por su vía (efectivo, transferencia, tarjeta).
- Una cita **se puede completar con saldo pendiente**: queda como **crédito** (fiado)
  de la clienta, para pagarlo luego.
- Un pago posterior **nunca cambia el dinero congelado** (INVARIANTE 2): solo añade filas.
- Servicios y productos no se mezclan (INVARIANTE 3): el crédito de servicios es aparte
  del de ropa.

## Valores por defecto tomados (avisados al usuario, revisables)

- Vías de pago: efectivo, transferencia, tarjeta.
- Descuento por servicio, en monto o porcentaje.
- Papel de 80 mm.
- Cajero: el nombre de quien está en la app al cobrar.

## Preguntas abiertas

- Ingresos por vía: hoy cada pago cuenta en el periodo de SU CITA (así cobrado, pagado y
  crédito cuadran). Un pago de crédito de este mes a una cita del mes pasado sube el
  "pagado" del mes pasado. ¿Prefiere verlo por fecha de pago (caja)?
- Abonos de citas canceladas / que no llegaron: no hay devolución. Hoy el abono queda
  como pago de una cita cerrada. ¿Se necesita registrar devoluciones?
- Dos clientas con el mismo nombre se agrupan juntas en Créditos (no hay ficha de clienta).

## Lo que hay (mapeo 2026-10-10)

- No existe recibo, impresión, QR ni numeración. Sin router: las rutas públicas
  se resuelven con un regex en `App.tsx` (`/reservar/:slug`).
- `appointment_service` ya congela el dinero por línea (D1 de multi-servicio):
  es la línea de la factura.
- `appointment.deposit` es un único monto. No hay pagos, vías, empleadas, logo,
  dirección, teléfono ni nombre visible de las usuarias.
- INVARIANTE 3: servicios y productos no se mezclan. El recibo comparte solo la
  presentación pura, con un `ReceiptData` neutro; Ropa queda fuera de este
  alcance.

## Tareas

- [x] **P1 · Empleadas.** Tabla `employee` (por negocio, no exige usuaria de la
  app), pantalla para darlas de alta y bajarlas, y `appointment_service.employee_id`
  elegido al cobrar. Se congela con la línea.
  Evidencia: migración `20261010000008_employees.sql` + suite
  `supabase/tests/employees.sql` (usuarias ...09aa/...09ab; NO ejecutada en local,
  la corre el job `sql-regression`); RED observado (employees.test.ts sin módulo y
  4 pruebas de charge en rojo) y luego `npm run test:run` 454/454, `typecheck` y
  `build` verdes. Reglas: la empleada es opcional por línea; al cobrar debe ser del
  negocio y estar activa; se da de baja, no se borra. Sección "Tu equipo" en la
  pantalla del negocio y selector "¿Quién hizo X?" en el cobro.
- [x] **P2 · Descuentos.** Descuento por línea (monto o %); `charged_price` pasa a
  ser el neto y la línea guarda el precio de lista y el descuento.
  `complete_appointment` lo valida.
  Evidencia: migración `20261010000009_line_discounts.sql` (`list_price`,
  `discount`; respaldo `list_price = charged_price` en líneas viejas; RPC recreada
  con cambio mínimo y mensajes 'Hay líneas con un descuento inválido.' y 'El precio
  de una línea no es precio de lista menos descuento.'); suite
  `supabase/tests/line-discounts.sql` (usuaria ...09a3, datos 9996xx; NO ejecutada en
  local, la corre `sql-regression`). Dominio `discounts.ts` + `resolveDiscounts` /
  `previewLines` / `lineDiscountCents`. RED observado (18 pruebas en rojo en
  appointments/charge y `discounts.test.ts` sin módulo), luego `npm run test:run`
  486/486, `typecheck` y `build` verdes.
  Reglas: (1) el **bruto** es el de siempre: precio de lista, precio puesto a un
  servicio variable, o el total pactado repartido a prorrata (D1); (2) el descuento de
  cada línea se resta DESPUÉS del reparto, así que un pacto fija el bruto y el
  descuento va encima; (3) `list_price` = parte del bruto de la línea, `charged_price`
  de la línea = lista − descuento (neto) y `charged_price` de la cita = suma de netos;
  subtotal y descuentos del recibo = suma de `list_price` y de `discount`; (4)
  porcentaje ENTERO 0–100, redondeo half-up al centavo; nunca negativo ni mayor que la
  línea (la pantalla y el dominio rechazan un monto mayor); (5) el costo no cambia, la
  ganancia sí y puede ser negativa (como ya pasaba); (6) sin descuento los números
  son exactamente los de antes. `list_price` queda nulo solo en líneas que escribió el
  trigger de la UI vieja: leer siempre `coalesce(list_price, charged_price)`.
- [x] **P3 · Pagos y crédito.** Tabla `appointment_payment` (append-only), cobro con
  varios pagos, crédito de servicios, pago posterior y reporte por vía.
  Evidencia: migración `20261010000010_appointment_payments.sql` + suite
  `supabase/tests/appointment-payments.sql` (usuarias ...09a4/...09a5, datos 9998xx; NO
  ejecutada en local: sin Docker ni Postgres, la corre `sql-regression`). RED observado:
  `payments.test.ts` sin módulo y 4 pruebas en rojo (`completeRpcArgs`, `scheduleRpcArgs`);
  luego `npm run test:run` 519/519, `typecheck` y `build` verdes.
  Reglas: (1) lo pagado = Σ `appointment_payment`; `appointment.deposit` queda como columna
  LEGADA de solo lectura (se sigue escribiendo por compatibilidad, no manda); (2) abono
  histórico respaldado con `method` NULO (no se inventa 'cash'; "Sin vía registrada"); el
  check solo permite vía nula en `deposit`; (3) escritura solo por RPC (`complete_appointment`
  con `p_payments`, `add_appointment_payment`, `schedule_appointment` con `p_deposit_method`
  atómico); los clientes solo leen (RLS select + privilegios revocados); (4) antes de cobrar
  no hay tope (el total aún no está congelado); al cobrar y en pagos de crédito el sobrepago
  se rechaza, y cobrar con saldo SÍ se permite; (5) `add_appointment_payment` acepta
  `p_payment_id` para que un reintento no pague dos veces; (6) la atención al paso pide la
  vía (o "a crédito"); (7) clientas agrupadas por nombre normalizado (sin acentos, mayúsculas
  ni espacios de más), el teléfono no entra en la clave; (8) reporte: pagos por vía de las
  citas COMPLETED del periodo (por fecha de la cita) junto a cobrado y crédito.
- [x] **P4 · Datos del recibo.** Logo (Supabase Storage), dirección, teléfono y
  nombre visible de quien cobra.
  Evidencia: migración `20261010000011` (columnas `business.address/phone/logo_path`,
  `business_member.display_name` vía RPC `set_my_display_name`, RPC
  `business_member_names`, bucket público `business-logos` con policies por carpeta
  `<business_id>/`, `appointment.charged_by` fijado en `complete_appointment`); suite
  `supabase/tests/business-receipt-profile.sql`; dominio `receiptProfile.ts` (RED
  observado: módulo ausente); UI `ReceiptSettings`. typecheck, 535 tests y build en verde.
  PENDIENTE: la suite SQL no se corrió localmente (sin Docker); la valida el job
  `sql-regression` de CI. Los pasos de storage se omiten con aviso si el stack no trae `storage`.
- [x] **P5 · Recibo térmico.** Numeración `V-000001` por negocio, asignada de
  forma atómica; vista imprimible de 80 mm (`@media print`).
  Evidencia: migración `20261010000012_receipts.sql` (`receipt_counter`, `receipt`, RPC
  `issue_receipt` idempotente) + suite `supabase/tests/receipts.sql` (usuarias
  ...09ca/...09cb, datos 9999xx; NO ejecutada en local, la corre `sql-regression`).
  Dominio `receipt.ts` con `ReceiptData` neutro; RED observado (`receipt.test.ts` sin
  módulo), luego `npm run test:run` 549/549, `typecheck` y `build` verdes.
  Reglas: (1) emisión PEREZOSA, al abrir "Recibo" en una cita COMPLETED (el número sigue el
  orden de emisión y las citas históricas también pueden tener recibo); (2) sin huecos: el
  upsert del contador bloquea su fila hasta el commit y la cita se bloquea `for update`, así
  que emisiones concurrentes hacen cola; repetir no gasta número; (3) `public_token` uuid
  aparte del número (P6: el número es adivinable); (4) cajero = nombre visible de
  `charged_by`, o el nombre del negocio si falta; (5) moneda con `formatMoney` ("$", como el
  resto de la app); (6) el recibo se niega a armarse si Σ neto ≠ `charged_price`;
  (7) hueco del QR: `ReceiptSheet` acepta `qr` y no imprime nada sin él (P6).
- [ ] **P6 · Recibo digital.** Token no adivinable, RPC pública que no expone
  costos ni ganancias, ruta `/recibo/:token` y QR en el recibo impreso.

## Entrega

PRs encadenados, uno por tarea, contra `develop`.

## TDD

Activo (precedente del proyecto). Runner: `npm run test:run`.
