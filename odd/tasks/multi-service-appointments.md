# Varias servicios en una misma cita

## Objetivo

Que una cita pueda llevar varios servicios —cejas + ondas + pestañas— y que la
clienta pueda elegirlos ella sola desde el portal, viendo los huecos que caben
para la suma de todos.

## Alcance

Decidido por el usuario (2026-09-29): **también en el portal de la clienta**, no
solo del lado de la dueña. Eso obliga a reescribir las RPC públicas.

## El mapa: qué se toca

88 referencias a `service_id` en 21 archivos de `src/`, 33 de ellas en 7 archivos
de test. Más la lógica duplicada en SQL.

### Barato (no engaña)
- `src/lib/domain/costs.ts` — **cero cambios**. `effectiveCost` y `profit` ya son
  por servicio y se suman.
- Sitios que solo muestran el nombre: `RequestsInbox`, `ClientNotice`, la etiqueta
  de `AppointmentRow`. Mecánicos en cuanto el tipo sea lista.
- El dinero congelado ya vive en la cita (`charged_price`, `actual_cost`,
  `profit`), no en el servicio: la INVARIANTE 2 no cambia de sitio.

### Caro
- `availability.ts` (`occupiesSchedule`, `generateSlots`) y `scheduling.ts`
  (`findScheduleConflict`): duración de una a suma.
- `appointments.ts` (`completeAppointment`): es el punto de congelación.
- `public_request_booking`, `public_busy`: la misma matemática, otra vez, en SQL.
- `calendar.ts` (`buildICS`, `googleCalendarUrl`): título con N nombres y fin en
  la suma de duraciones.
- La Edge `notify-new-booking` arma el aviso con `service:service_id (name)`.

## Decisiones

### D1 · El reparto de la ganancia se CONGELA al completar

El problema: hoy el reporte de "servicio más rentable" atribuye la ganancia
congelada de la cita a su único servicio. Con tres servicios no existe dato que
diga cuánta ganancia fue de cada uno, y repartirla después sería inventar una
regla sobre dinero histórico — justo lo que la INVARIANTE 2 protege.

La salida: la fila de `appointment_service` guarda **su parte** de
`charged_price`, `actual_cost` y `profit`, calculada y congelada **en el momento
de COMPLETAR**, a prorrata del precio de lista de cada servicio.

Eso no es recalcular historia: es **registrarla**. El reporte pasa a leer datos
reales en vez de un reparto inventado a posteriori, y las citas de un solo
servicio siguen dando exactamente el mismo número que hoy.

### D2 · Los servicios de precio variable SÍ entran al portal

CORREGIDA el 2026-09-29. La versión anterior los dejaba fuera "por ahora"; el
usuario lo rechazó con un caso que la tumba: si una clienta quiere cejas Y
trenzas, obligarla a pedir dos citas no es defendible.

Y al mirarlo de cerca, el miedo era exagerado. **El portal no cobra: pide.** El
dinero se congela al COMPLETAR pase lo que pase, así que un servicio de precio
variable en el portal solo significa que el estimado es parcial:

    Cejas          RD$1,500
    Trenzas        a convenir
    ─────────────────────────
    Desde          RD$1,500

Lo que sí obliga: la pantalla de cobro deja de preguntar "¿esta cita es de precio
variable?" (un sí/no que con mezcla no tiene respuesta) y pasa a pedir **un precio
por cada servicio variable** de la cita.

Se mantiene el filtro `duration_min > 0`: un servicio sin duración no se puede
agendar, y eso no cambia. Lo que se cae del filtro del portal es solo
`variable_price = false`.

### D3 · Expandir, migrar, contraer

Tabla `appointment_service` nueva; se rellena una fila por cada cita existente con
su servicio actual; `service_id` se queda como servicio principal. Las citas
históricas no se tocan. Quitar la columna, si llega, es otro cambio.

### D4 · El precio de un conjunto se calcula en UN solo sitio

Nace de lo que pidió el usuario: precio especial por combinación
(micropigmentación 5000 + labios 4000 = 8000 juntos).

Los combos son una funcionalidad aparte y posterior —necesitan que exista lo
múltiple, y una pantalla donde la dueña los defina—, pero la costura se deja
puesta desde ahora: **una única función pura que responde "cuánto cuesta este
conjunto de servicios"**. Empieza siendo una suma; cuando entren los combos, es el
único sitio que cambia.

Retrofitear eso después significaría perseguir el cálculo del precio por el
portal, la agenda, el cobro y los reportes. Anticipar la costura es barato; el
combo en sí, no.

Nota importante que ya es verdad hoy:
`charged_price = overridePrice ?? quoted_price ?? service.price`. La dueña YA
puede cobrar 8000 al completar. Lo que no existe es que la clienta lo VEA en el
portal ni que se aplique sola.

Cuando lleguen los combos, el reparto congelado de D1 usa el precio cobrado, no
el de lista: 8000 se reparte a prorrata de 5000/4000, o sea 4444 y 3556. Sigue
siendo dato registrado, no inventado.

## El riesgo que manda

Hay TRES puertas por las que se crea o cambia una cita: la agenda de la dueña, el
portal, y **reprogramar**. Si una se queda atrás conociendo un solo `service_id`,
reprogramar una cita de tres servicios borraría dos **en silencio**. El tipo tiene
que dejar de ser `service_id: number` de golpe, para que `tsc` cace todos los
sitios — pero `tsc` no cruza a SQL.

Y la duración vive en dos implementaciones independientes: `availability.ts` y
`public_request_booking`. La de SQL se escribió replicando la de TS "al detalle"
después de fallos reales en producción, y su única red de regresión **se corre a
mano, no en CI**.

## Tareas

- [x] **T1 · Dominio: la duración pasa a ser suma.** `availability.ts` y
  `scheduling.ts`. Preservar el "fallo seguro" de `occupiesSchedule` (decisión A6,
  hallazgo CRÍTICO de una revisión): hoy bloquea a infinito si no encuentra el
  servicio; con un conjunto hay que decidir si basta con que falte UNO.

  Hecho en `feat/multi-service-domain` (TDD estricto). `Appointment.service_ids?:
  number[]` opcional en `types.ts`; `appointmentServiceIds` (scheduling.ts) es la
  única fuente de verdad de qué servicios tiene una cita. Se decidió: basta con
  que falte UNO de los servicios para fallar en seguro a Infinity, no que falten
  todos (test: cita con 2 servicios, solo 1 en catálogo → bloquea a Infinity).
  `generateSlots` cambió su input de `service: Service` a `candidateServices:
  readonly Service[]`; `findScheduleConflict` cambió `service_id: number` a
  `service_ids: number[]`. Callers (`PublicBooking.tsx`, `StoreContext.tsx`)
  actualizados a pasar arreglos de un solo elemento, sin cambio de comportamiento.

  RED observado: 30 tests fallando (24 en `availability.test.ts` — `service` ya
  no existe en el input; 6 en `scheduling.test.ts` — `service_id` ignorado o
  funciones nuevas inexistentes), 250 pasando en los otros 18 archivos.
  GREEN: `npm run test:run` → 280 passed (280) en 20 archivos (271 base + 9
  tests nuevos). `npm run typecheck` limpio. `npm run build` limpio.

  Fixture reformada: los ~19 call-sites de `generateSlots` en
  `availability.test.ts` que usaban `service: svc` pasaron a `candidateServices:
  [svc]` — mecánico, exigido por el cambio de firma del punto 3 del diseño, no
  cambia lo que cada test verifica.

  Commit: `feat(dominio): duración de citas soporta varios servicios (suma)`.
- [ ] **T2 · Dominio: el dinero.** Una función pura "precio de este conjunto"
  (D4), `completeAppointment` recibiendo N servicios, y el reparto congelado de
  D1. Aquí muere el booleano `isVariable`: pasa a ser "qué servicios de esta cita
  necesitan que les pongas precio".
- [ ] **T3 · Migración.** `appointment_service` con su RLS, backfill, y las
  columnas del reparto congelado.
- [ ] **T4 · RPC públicas.** `public_request_booking` y `public_busy` con sumas,
  más su regresión SQL.
- [ ] **T5 · Portal.** Selección múltiple, huecos para la suma, y el envío.
- [ ] **T6 · Agenda de la dueña.** `ScheduleForm`, reprogramar, `AppointmentRow`.
- [ ] **T7 · Calendario y aviso push.** Título con N nombres, fin en la suma.
- [ ] **T8 · Reportes.** Leer el reparto congelado en vez de atribuir a uno.

## Verificación

`npm run test:run`, `npm run typecheck`, `npm run build`, y la regresión SQL a
mano. 33 tests existentes tocan un `service_id` único y hay que reescribirlos.

## Entrega

Muy por encima de las 400 líneas: va en PRs encadenados. Corte natural: dominio y
migración primero (T1–T3), servidor después (T4), y las pantallas al final
(T5–T8), que es también el orden en que se puede verificar cada pieza.
