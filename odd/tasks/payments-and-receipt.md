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
