# Auto-reserva del cliente (self-booking)

> Documento vivo de ODD. Se actualiza tras cada tarea. Espejo en Engram: `odd/self-booking/tasks`.
> Locator: `odd/tasks/self-booking.md`

## Objetivo

Que la clienta pueda ver la disponibilidad del negocio y solicitar su cita desde un panel
público, sin que la dueña tenga que registrarla a mano. La dueña configura sus horas de
trabajo y **acepta o rechaza** cada solicitud.

## Problema

Hoy solo la dueña agenda (`ScheduleForm.tsx`). Cada reserva le cuesta una interrupción:
la clienta escribe, ella revisa su agenda mental, responde, y después lo anota.

## Por qué ahora

El MVP ya persiste en Supabase con RLS por `business_id` y la máquina de estados está
cerrada. La pieza que falta no es UI: es que **no existe modelo de disponibilidad**.
`scheduling.ts` solo detecta solapamiento entre citas; no sabe qué días ni a qué horas
trabaja el negocio.

## Decisiones tomadas

| # | Decisión | Fecha |
|---|---|---|
| D1 | La reserva pública **no** se autoconfirma. Nace como `REQUESTED` y la dueña la acepta (`PENDING`) o la rechaza (`REJECTED`). Decisión de la dueña. | 2026-09-17 |
| D2 | El acceso público va por RPC `SECURITY DEFINER`, **nunca** por policy `anon` sobre `service`: esa tabla contiene `supply_cost` y `cost_override` (costos de la dueña). | 2026-09-17 |
| D3 | Calendarios iOS/Android vía archivo `.ics` (RFC 5545) + link template de Google Calendar. Sin OAuth ni sync bidireccional. | 2026-09-17 |
| D4 | Slice A emite horarios como ISO local sin zona (`YYYY-MM-DDTHH:MM`), igual que los produce hoy `<input type="datetime-local">`. La migración a `timestamptz` es Slice B. | 2026-09-17 |

## Alcance autorizado

El usuario autorizó (2026-09-17) completar todos los slices. Lo entregado hasta
ahora: **A, B y E**. **C, D y F siguen sin entregar**, por bloqueos reales
documentados más abajo — no por falta de autorización.

## Invariantes que aplican

- INV. 1 — todo tipo nuevo lleva `business_id`.
- INV. 5 — `availability.ts` es puro: sin React, sin I/O, sin `Date.now()` implícito
  (el reloj se inyecta como parámetro `now`).
- INV. 7 — Slice A **no** modifica `VALID_TRANSITIONS`.

## Modo TDD

- **Estado:** activo (Strict TDD Mode habilitado en la sesión).
- **Runner:** `npm run test:run` (vitest).
- **Ciclo:** RED observado → GREEN → REFACTOR. Sin RED observado no se escribe implementación.

## Tareas — Slice A

- [x] **A1** — Tipos de disponibilidad en `src/lib/domain/types.ts`:
      `BusinessHours`, `TimeBlock`, `BookingPolicy`, `Slot`. Todos con `business_id`.
- [x] **A2** — Tests en `src/lib/domain/availability.test.ts` (15 tests).
- [x] **A3** — Implementar `src/lib/domain/availability.ts` hasta GREEN.
- [x] **A4** — Verificado: `npm run test:run` → 83/83 en verde; `npm run typecheck` → exit 0.
- [x] **A5** — Corrección: `buffer_min` era asimétrico (solo protegía DESPUÉS de una
      cita). RED observado y corregido a descanso simétrico.
- [x] **A6** — Corrección de revisión (CRITICAL `R3-missing-service-availability`):
      una cita cuyo servicio no estaba en `services` se ignoraba en silencio y su
      horario se ofrecía como libre. Ahora **falla en seguro**: duración desconocida
      bloquea desde el inicio de la cita hasta el cierre.
- [x] **A7** — Hallazgos informativos de la revisión: comentario de `buffer_min` en
      `types.ts` actualizado a "ambos lados"; test de desbordamiento de calendario
      (`2026-02-30`) que sí ejercita la guarda de `isValidDate`.

## Criterios de aceptación (A2)

1. Un día sin `BusinessHours` no ofrece ningún slot.
2. Los slots caen dentro de `[opens_at, closes_at)` y el slot **completo** (inicio +
   `duration_min`) debe caber antes del cierre.
3. Una cita existente en estado ocupante bloquea sus slots; `CANCELED` y `NO_SHOW` no.
4. Un `TimeBlock` que solapa un slot lo elimina.
5. `buffer_min` protege el descanso a AMBOS lados de una cita existente: ni el slot
   siguiente arranca pegado al fin, ni el anterior termina pegado al inicio.
   (Redacción original ambigua — corregida en A5.)
6. `min_notice_hours` descarta slots demasiado próximos a `now`.
7. `max_horizon_days` descarta fechas demasiado lejanas.
8. `slot_step_min` define la granularidad de las horas ofrecidas.
9. Pureza: la función no muta sus entradas y con el mismo `now` devuelve lo mismo.
10. El test `no-react.test.ts` sigue pasando (cero dependencias de React).

## Progreso

**Slice A COMPLETO** (2026-09-17). Verificación observada por el padre, no reportada:

| Comando | Resultado observado |
|---|---|
| `npm run test:run` (base, antes de tocar nada) | 6 files, 68 tests ✓ |
| `npm run test:run` (tras A1–A3) | 7 files, 82 tests ✓ |
| `npm run test:run` (RED de A5) | 1 failed — ofrecía `10:00–11:00` pegado a la cita de `11:00` |
| `npm run test:run` (tras corregir A5) | 7 files, 83 tests ✓ |
| `npm run test:run` (RED de A6) | 1 failed — ofrecía `11:00` y `12:00` con una cita a las `11:00` |
| `npm run test:run` (tras corregir A6) | 7 files, 84 tests ✓ |
| `npm run test:run` (tras A7) | 7 files, **85 tests ✓** |
| `npm run typecheck` | exit 0, sin errores |

### Revisión nativa (gentle-ai, RDD activo)

Consentimiento `granted` por el usuario. Lineage `review-bd86bf6d29f78525`, riesgo
`medium`, lente `review-reliability`, 5 archivos / 673 líneas.

- **1 hallazgo CRITICAL** (`R3-missing-service-availability`): corregido en A6 y
  validado por el validador dirigido.
- Estado final: `approved` → `acknowledged`, autoridad `burned`.
- 3 hallazgos informativos, no bloqueantes: dos resueltos en A7; el tercero
  (`R3-untested-policy-clamping`) queda como deuda, ver abajo.

> La revisión es informativa. Commit, push y despliegue siguen siendo decisiones
> humanas bajo la política normal del repo.

Archivos: `src/lib/domain/types.ts` (4 tipos añadidos, ninguno existente modificado),
`src/lib/domain/availability.ts` (nuevo), `src/lib/domain/availability.test.ts` (nuevo).
Sin tocar `StoreContext`, componentes, SQL, `appointments.ts`, `scheduling.ts` ni `index.ts`.

### Nota de entorno (contradice `CLAUDE.md`)

`CLAUDE.md` afirma "No hay Node/npm local; el loop de tests corre en la nube".
Es **falso a fecha de hoy**: hay `node v24.21.0` y `npm` locales. Solo faltaba
`node_modules`. El ciclo TDD se cerró localmente. Esa línea de `CLAUDE.md` debería
actualizarse.

### Decisiones tomadas durante la implementación

- `generateSlots` NO re-filtra por `business_id`: asume entradas ya filtradas por el
  llamador, misma convención que `findScheduleConflict` (INVARIANTE 1 se cumple en el
  llamador, igual que hoy).
- `min_notice_hours` y `max_horizon_days` se comparan contra `now` en milisegundos
  absolutos, no contra fronteras de día calendario.
- Los helpers (`parseHHMM`, `formatLocal`, …) quedan privados: los tests atacan sólo
  `generateSlots`, comportamiento y no implementación.

## Fuera del candidato (decisión pendiente del usuario)

- `package-lock.json` — lo generó `npm install`; el repo no tenía lockfile.
  Añadirlo afecta a CI. No forma parte de Slice A.
- `.atl/` — artefactos de tooling preexistentes a esta sesión.

## Slice B — entregado a medias (dominio sí, base de datos sin verificar)

### B-dominio ✅
- `AppointmentStatus` gana `REQUESTED` y `REJECTED`.
- Transiciones nuevas: `REQUESTED → PENDING` (la dueña acepta), `REQUESTED → REJECTED`
  (la rechaza), `REQUESTED → CANCELED` (la clienta se arrepiente). `REJECTED` es
  terminal. Ninguna transición existente cambió.
- Una solicitud sin confirmar **no se puede completar**: `REQUESTED` no tiene
  `COMPLETED` en su lista, así que `completeAppointment` lanza sola. Con test.
- Regla única de ocupación: `holdsSchedule(status)` en `appointments.ts`. Antes la
  regla estaba duplicada en `scheduling.ts` y `availability.ts`; con dos estados
  nuevos esas dos copias habrían divergido. Ahora ambas la llaman.
- `REQUESTED` **ocupa** horario. Si una solicitud pendiente no bloqueara su hora, dos
  clientas pedirían la misma y la dueña heredaría un choque que no creó.
- UI mínima obligada por la unión ampliada: etiquetas (`Por confirmar`, `Rechazada`),
  colores de badge, y `appointmentsForDay` deja de mostrar las rechazadas.
- `reports.ts` no necesitó cambios: ya filtra `status !== 'COMPLETED'`.

### B-SQL ⚠️ ESCRITO PERO NUNCA EJECUTADO
`supabase/self-booking.sql`, aditivo e idempotente. **No se ha corrido contra ninguna
base.** Antes de aplicarlo: probar en un proyecto Supabase de prueba o dentro de una
transacción con `ROLLBACK`.

Cambio de plan respecto a la decisión original: **se abandonó la migración
`datetime` → `timestamptz`**. No hace falta para garantizar la no-doble-reserva y era
la parte con riesgo real sobre datos existentes. En su lugar,
`public_request_booking` toma `pg_advisory_xact_lock(business_id)` y re-verifica el
choque dentro del lock. El archivo no borra, no convierte columnas y no toca filas.

Contenido: tablas `business_hours`, `time_block`, `booking_policy` (con RLS por
`is_member`, INVARIANTE 1); columnas aditivas `client_phone`, `source`,
`requested_at` en `appointment`; `expire_stale_requests()` para la caducidad;
y cuatro funciones `SECURITY DEFINER` para el público: `public_business`,
`public_hours`, `public_busy`, `public_request_booking`.

Decisiones de seguridad:
- **Ni una policy para `anon`.** El público no toca tablas, solo funciones con
  proyección explícita de columnas. `supply_cost` y `cost_override` nunca salen.
- `public_busy` devuelve horarios **anónimos** (inicio y duración). Un desconocido no
  tiene por qué saber que "María viene a las 3".
- Los servicios `variable_price = true` quedan **excluidos** del portal: la clienta no
  puede reservar un precio que no existe. Supuesto conservador, revisable.
- Tope de solicitudes por teléfono y día contra spam.

## Slice E — entregado ✅

`src/lib/domain/calendar.ts`: `buildICS()` (RFC 5545) y `googleCalendarUrl()`. Puro,
13 tests. CRLF, escapado de texto, plegado de líneas a 75 octetos, `UID` estable y
`SEQUENCE` incremental (así iOS y Google **actualizan** el evento en vez de duplicarlo).
`DTSTART`/`DTEND` en hora flotante sin `Z`; `DTSTAMP` sí lleva `Z` porque es un
instante real. La aritmética usa `Date.UTC` internamente, así que no arrastra DST.

## Slice C — entregado ⚠️ sin verificar contra base real

`src/lib/public/publicBooking.ts` y `src/components/public/PublicBooking.tsx`.
Página pública en `/reservar/<slug>`, mobile-first, tres pasos: servicio → día y
hora → nombre y teléfono, más pantalla de confirmación.

- La ruta se resuelve en `App.tsx` **antes** de `AuthProvider` y `StoreProvider`: la
  clienta no tiene cuenta ni negocio, y el árbol autenticado exige ambas cosas.
- Los horarios libres los calcula `generateSlots` del Slice A, **no** una copia. Un
  adaptador convierte las filas anónimas de `public_busy` en la forma que la función
  espera.
- La confirmación dice "Solicitud enviada — te confirmamos pronto" y **nunca**
  "¡Reservado!". Prometer una cita que todavía no existe es lo único que esta
  pantalla no puede hacer (decisión D1).
- El `.ics` NO se ofrece aquí: el calendario se entrega solo después de que la dueña
  acepte.
- Los errores se distinguen: "no hay horarios ese día" y "no pudimos conectar" son
  cosas muy distintas para quien lee la pantalla.

## Slice D — entregado ⚠️ sin verificar contra base real

`src/components/owner/BookingSettings.tsx` y `RequestsInbox.tsx`, más las
extensiones del store.

- Interruptor para abrir o cerrar el portal, link público para compartir, horas de
  trabajo por día (varios tramos: mañana y tarde), días bloqueados y las reglas de
  reserva en lenguaje llano.
- Bandeja de solicitudes con Aceptar y Rechazar, con el contador visible: una
  solicitud sin responder bloquea esa hora.
- `acceptRequest` y `rejectRequest` pasan por `transition()` del dominio. Nunca
  escriben `status` a mano: la máquina de estados es la única autoridad sobre qué
  transición es legal (INVARIANTE 7).

## Consolidación de tipos

`BookingPolicyRow` (`public_slug`, `enabled`, `max_requests_per_phone_per_day`) y los
campos `client_phone` / `source` de `Appointment` nacieron como tipos locales del
store. Se movieron a `src/lib/domain/types.ts`, que es donde el proyecto dice que
viven los tipos del dominio. `BookingPolicy` se queda con las reglas que necesita el
cálculo puro de slots; `BookingPolicyRow` añade la administración del portal.

## Slice F — NO entregado

Requiere cuenta de proveedor (Twilio o Meta), credenciales y una decisión de costo.
No es implementable desde aquí.

## Lo que sigue SIN verificar

Nada de C ni D se ha probado contra una base real: `supabase/self-booking.sql` nunca
se ha aplicado. Concretamente no se ha confirmado la forma real de retorno de las
RPC, el comportamiento de los grants, si `bigint` llega como número o como string
desde supabase-js, ni que el filtro por día de `public_busy` case con filas reales.
La verificación existente es de tipos y compilación, no de ejecución.

## Siguiente paso

1. **Aplicar `supabase/self-booking.sql` en un proyecto de prueba** y recorrer el
   flujo completo: crear horario, abrir el portal, reservar desde `/reservar/<slug>`,
   aceptar desde la bandeja. Ahí es donde van a salir los desajustes reales.
2. Confirmar el supuesto de los servicios de precio variable: hoy quedan excluidos
   del portal.
3. Enganchar el `.ics` del Slice E en la aceptación (hoy existe pero no se ofrece
   desde ninguna pantalla).
4. Slice F (aviso por WhatsApp) cuando haya proveedor y credenciales.

Slice A está cerrado, revisado y verificado. El siguiente slice (B: SQL, estados
`REQUESTED`/`REJECTED`, migración a `timestamptz`, RPCs públicas) **requiere
autorización explícita** antes de escribir nada.

## Slices siguientes (planteados, NO autorizados)

- **B** — SQL: `datetime` → `timestamptz`, tablas de horarios/bloqueos/política,
  RPCs públicas, constraint anti-doble-booking, estados `REQUESTED`/`REJECTED`.
- **C** — UI pública `/reservar/:slug`, mobile-first, 3 pasos.
- **D** — Lado dueña: configurar horarios, bloquear días, bandeja de solicitudes, switch on/off.
- **E** — `.ics` + link Google Calendar (solo tras aceptación).
- **F** — Aviso por WhatsApp a la dueña cuando entra una solicitud. Sube de prioridad
  por D1: sin aviso, la clienta espera a ciegas.

## Deuda conocida de Slice A

- `R3-untested-policy-clamping` (SUGERENCIA de la revisión): los `Math.max` que
  saneen `slot_step_min` y `buffer_min` negativos o cero no tienen test propio.
- Mismo patrón de "salto silencioso" que A6 pero para `a.datetime` inválido
  (`availability.ts`, guarda `Number.isNaN(aStart)`): hoy se ignora la cita. No
  entraba en el alcance de la corrección acotada de la revisión. Revisar en Slice B,
  cuando `datetime` pase a `timestamptz` y el caso deje de ser posible.
- `findScheduleConflict` (`scheduling.ts`) conserva el salto silencioso original
  cuando no encuentra el servicio. Es preexistente, no lo tocamos; si el portal
  público llega a usarlo, hay que alinearlo con el criterio de A6.
- DST: los slots se generan sumando milisegundos fijos entre apertura y cierre. En un
  país con cambio de hora y un horario que cruce la transición, un slot podría caer en
  una hora inexistente. No aplica al caso actual, pero queda anotado.
- `generateSlots` es O(slots × citas × servicios). Irrelevante para un día; revisar si
  alguna vez se pide disponibilidad de un mes completo de una sola llamada.

## Riesgos abiertos

- Una solicitud `REQUESTED` sin responder bloquea el slot indefinidamente → hace falta
  política de expiración (Slice B).
- Servicios con `variable_price: true` (trenzas, maquillaje) no tienen precio reservable.
  Decidir en Slice C si se excluyen del portal o se ofrecen como "precio a confirmar".
- La migración `text` → `timestamptz` toca datos existentes (Slice B).
