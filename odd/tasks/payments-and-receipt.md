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

## Valores por defecto tomados (avisados al usuario, revisables)

- Vías de pago: efectivo, transferencia, tarjeta.
- Descuento por servicio, en monto o porcentaje.
- Papel de 80 mm.
- Cajero: el nombre de quien está en la app al cobrar.

## Pregunta abierta

- ¿Se puede completar una cita con saldo pendiente (fiado / "Crédito")?
  Condiciona P3.

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

- [ ] **P1 · Empleadas.** Tabla `employee` (por negocio, no exige usuaria de la
  app), pantalla para darlas de alta y bajarlas, y `appointment_service.employee_id`
  elegido al cobrar. Se congela con la línea.
- [ ] **P2 · Descuentos.** Descuento por línea (monto o %); `charged_price` pasa a
  ser el neto y la línea guarda el precio de lista y el descuento.
  `complete_appointment` lo valida.
- [ ] **P3 · Pagos.** Tabla de pagos por cita (monto, vía, momento, abono o
  cobro); el abono existente pasa a ser un pago. Reporte por vía.
- [ ] **P4 · Datos del recibo.** Logo (Supabase Storage), dirección, teléfono y
  nombre visible de quien cobra.
- [ ] **P5 · Recibo térmico.** Numeración `V-000001` por negocio, asignada de
  forma atómica al cobrar; vista imprimible de 80 mm (`@media print`).
- [ ] **P6 · Recibo digital.** Token no adivinable, RPC pública que no expone
  costos ni ganancias, ruta `/recibo/:token` y QR en el recibo impreso.

## Entrega

PRs encadenados, uno por tarea, contra `develop`.

## TDD

Activo (precedente del proyecto). Runner: `npm run test:run`.
