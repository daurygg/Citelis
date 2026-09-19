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

## Slice E — entregado ✅ (y ya enganchado en la UI)

`src/lib/domain/calendar.ts`: `buildICS()` (RFC 5545) y `googleCalendarUrl()`. Puro,
13 tests. CRLF, escapado de texto, plegado de líneas a 75 octetos, `UID` estable y
`SEQUENCE` incremental (así iOS y Google **actualizan** el evento en vez de duplicarlo).
`DTSTART`/`DTEND` en hora flotante sin `Z`; `DTSTAMP` sí lleva `Z` porque es un
instante real. La aritmética usa `Date.UTC` internamente, así que no arrastra DST.

### E2 — entrega del calendario en pantalla (2026-09-19)

Hasta aquí `calendar.ts` existía pero ninguna pantalla lo usaba. Ahora sí.

Dos funciones puras nuevas en `calendar.ts`, con 8 tests (RED observado antes de
implementar): el módulo pasa de 13 a 21 tests.

- `appointmentUID(appointment)` — `citelis-<business_id>-<id>@citelis.app`. Depende
  solo de la identidad de la cita, **nunca de su horario**: si cambiara al
  reprogramar, el teléfono de la clienta crearía un evento nuevo en vez de mover el
  que ya tiene. Lleva `business_id` porque los ids son por negocio (INVARIANTE 1).
- `revisionSequence(now)` — segundos desde el 1 de enero de 2026. **No guardamos un
  contador de versiones de la cita**, así que el `SEQUENCE` sale del reloj, que solo
  avanza: cada archivo generado después gana al anterior y el calendario acepta la
  revisión. Se corta en 0 si el reloj está atrasado (RFC 5545 exige no negativo) y
  cabe en 32 bits hasta bien entrado el siglo, que es lo que asumen varios clientes.

`src/components/CalendarActions.tsx` (nuevo): "Descargar la cita" (blob `.ics`) y
"Copiar link de Google Calendar", con `window.open` como plan B si el portapapeles
está bloqueado (pasa fuera de https). Enganchado en dos sitios:

- **`RequestsInbox.tsx`** — aparece justo al aceptar, que es cuando la dueña tiene a
  la clienta en la cabeza. La solicitud sale de la bandeja en el acto, así que se
  guarda la cita en estado local; solo se leen datos que la aceptación no cambia
  (quién, cuándo, qué servicio), nunca el estado.
- **`AppointmentRow.tsx`** — botón "Calendario" en las citas abiertas, para volver a
  mandarlo después (o para las citas que registró la dueña a mano).

**No hay envío automático**: la dueña baja el archivo o copia el link y lo manda ella
por WhatsApp. El canal automático es el Slice F, que sigue bloqueado.

`StoreContext` ahora carga también la fila `business`: el `.ics` y el link de Google
necesitan el nombre del negocio y el store solo tenía `businessId`. Se expone como
`business: Business | null`; si falta, `CalendarActions` no se dibuja en vez de
inventar un nombre.

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

## Verificación contra base real — 2026-09-18 ✅

El SQL ya corrió. Historial de migraciones creado en CitelisDev
(`mpmbrntyojomfhrdcurt`), que antes estaba vacío:

- `20260918172022_baseline_existing_schema` — consolida `schema.sql`,
  `invitations.sql`, `inventory.sql` y los tres parches de columnas en una sola foto
  idempotente, **sin `drop table`**. Es un baseline: el esquema ya existía aplicado a
  mano, esto lo registra, no lo re-ejecuta.
- `20260918172159_self_booking` — el cambio real. 13 tablas, todas con RLS.

Copias en repo: `supabase/migrations/`.

Las cuatro dudas que arrastraba este documento quedan resueltas, ejecutando como rol
`anon`:

- **Grants**: funcionan. Las cuatro RPC públicas son ejecutables por `anon`.
- **`bigint`**: vuelve como número JSON, no string. Los ids del cliente
  (`Date.now()*1000 + azar` ≈ 1.77e15) caben bajo 2^53.
- **Filtro por día de `public_busy`**: `datetime like p_date || 'T%'` sí casa con
  filas reales.
- **Forma de retorno**: la de la firma. `public_business` devuelve 8 de 11 servicios
  y nunca proyecta `supply_cost` ni `cost_override`.

También verificado: `anon` ve **0 filas** por acceso directo a `service`,
`appointment`, `business`, `booking_policy` y `supply` (decisión D2 se sostiene); la
cita nace `REQUESTED`/`SELF` con `charged_price`/`actual_cost`/`profit` en `null`
(INVARIANTE 2); la detección de choques rechaza dentro del lock; el límite anti-spam
corta en la cuarta solicitud del mismo teléfono.

Supuesto confirmado: los servicios `variable_price` quedan excluidos del portal.

## Huecos encontrados al ejecutar — CERRADOS ✅

Ninguno se habría visto compilando. Todos salieron al correr el flujo.

- **H1 — `expire_stale_requests` es una escritura anónima sobre cualquier negocio.**
  Un `anon` sin autenticar la llamó con `business_id = 1` y cambió una fila
  `REQUESTED` → `REJECTED`. La función no comprueba pertenencia ⇒ **viola la
  INVARIANTE 1**. Causa raíz: Postgres concede `EXECUTE` a `PUBLIC` por defecto al
  crear una función, así que el `grant execute ... to authenticated` explícito era
  redundante y daba falsa sensación de restricción. Mismo efecto en
  `create_business`, `create_invitation`, `redeem_invitation` e `is_member`, pero
  esas sí están protegidas por su propio chequeo de `auth.uid()`.
- **H2 — `public_request_booking` no valida el horario de atención.** Aceptó
  domingo 2026-09-20T03:00, un día sin ni una fila en `business_hours`.
- **H3 — no valida `max_horizon_days`.** Aceptó 2027-12-31 con horizonte de 30 días.
- **H4 — no valida `min_notice_hours`.** Aceptó una cita a 10 minutos con aviso
  mínimo de 2 horas.
- **H5 — no valida `time_block`.** Aceptó una cita dentro de un bloqueo de
  vacaciones de la dueña.

- **H6 — la base corre en UTC y `datetime` es hora local sin zona.** Salió al
  arreglar H4. `expire_stale_requests` comparaba `datetime` contra
  `to_char(now(), ...)`: en RD (UTC-4) eso auto-rechazaba solicitudes de hasta
  **4 horas en el futuro**. Reproducido con una cita local a las 15:00 mientras
  `ahora_local` era 13:41 y `ahora_utc` 17:41.

H2–H5 solo se aplicaban en el navegador (`generateSlots`). El comentario del SQL
decía *"el navegador no es una garantía: la verdad vive aquí"*, pero eso solo era
cierto para los choques. La RPC es API pública: se llama con `curl`.

### Cómo se cerraron — `20260918000003` y `20260918000004`

- **H6**: columna `booking_policy.timezone` (default `America/Santo_Domingo`). Todas
  las comparaciones usan `now() at time zone v_tz`. El huso es un dato del negocio,
  no del servidor.
- **H1**: revocado `execute` de `anon` y `authenticated`. Se cerró REVOCANDO y no con
  un `is_member`, porque su llamador legítimo es una clienta **anónima**: un chequeo
  de pertenencia habría roto la reserva pública. La llamada interna desde
  `public_request_booking` sigue funcionando porque es `SECURITY DEFINER`.
- **H2–H5**: validaciones dentro de `public_request_booking`, replicando la
  semántica de `availability.ts` al detalle. Criterio: si el servidor fuera **más**
  estricto que el navegador, la clienta vería errores en horarios que la web le
  acaba de ofrecer. H2 exige que la cita entera quepa en UN tramo, no en la suma:
  con jornada partida 9–13 y 14–18, una cita de 12:30 a 14:30 no cabe.
- **Bonus**: la comprobación de choques ahora aplica `buffer_min` a AMBOS lados,
  igual que `occupiesSchedule`. Antes el servidor no aplicaba buffer y era más
  permisivo que el navegador.
- **`search_path`**: fijado a `public, pg_temp` en las 9 funciones `SECURITY
  DEFINER`. El aviso desapareció del linter.

### La lección de permisos, que casi se me escapa

`revoke execute ... from public` **no basta en Supabase**. El proyecto trae
`alter default privileges in schema public grant all on functions to anon,
authenticated`, así que cada función nace además con una concesión **directa** a
esos roles, y revocar de `PUBLIC` no toca una concesión directa.

Pasó en vivo: la migración `0003` revocó de `PUBLIC` creyendo cerrar
`create_business`, `create_invitation` y `redeem_invitation`, y
`has_function_privilege('anon', ...)` seguía devolviendo `true`. Hizo falta la
`0004` revocando de `anon` por su nombre.

**Verificar siempre con `has_function_privilege(rol, fn, 'EXECUTE')`**, nunca con el
linter ni con el texto del `grant`.

### Decidido NO validar

La alineación al `slot_step_min` no se comprueba en servidor: es presentación, no
regla de negocio, y validarla rompería en cuanto la dueña cambie el paso.

### Estado del linter

`function_search_path_mutable`: resuelto. `rls_enabled_no_policy` en `invitation`:
deliberado. Los avisos `*_security_definer_function_executable` que quedan
corresponden a funciones que deben ser públicas por diseño.

## Desviaciones aplicadas respecto a `supabase/self-booking.sql`

- Los tres `drop policy if exists` pasaron a bloques `do $$ ... if not exists`: mismo
  efecto sin destruir una policy para recrearla.
- Corregido el comentario de `public_appointment_id_seq`, que decía "arranca alto"
  mientras el código decía `start 1`.

## Estado de la base de prueba

Negocio 1 `Citelis`, 19 insumos, 11 servicios, 40 enlaces, 3 gastos fijos, 11 filas
de horario (L–S con jornada partida), `booking_policy` con slug `citelis` habilitada.
0 citas: las de prueba se borraron. 0 usuarios en `auth.users` — falta registrarse
desde la app para poder completar `bootstrap.sql`.

## E2 (entrega del calendario) no se ha visto funcionar — 2026-09-19

Verificado: `npm run test:run` → **120 tests ✓** (eran 112), `npm run typecheck` →
exit 0, `npm run build` → OK. **Nada de eso prueba que la pantalla funcione.**

No se pudo abrir la app en el navegador: la máquina donde se escribió no tiene
`.env`, así que sin `VITE_SUPABASE_URL` ni `VITE_SUPABASE_PUBLISHABLE_KEY` no hay
sesión posible. Queda sin comprobar que el archivo descargado abra bien en un
teléfono, que el link de Google Calendar caiga en la hora correcta, y que el panel
de aceptación se vea como debe en pantalla de móvil.

## Siguiente paso

1. **Verificar el fallback SPA en Vercel.** No existe `vercel.json`. La ruta pública
   `/reservar/<slug>` funciona en local (Vite hace history fallback), pero en
   producción puede dar 404 sin una regla de rewrite a `index.html`. Sin confirmar.
2. **Cubrir H1–H6 con tests.** Las seis pruebas se hicieron a mano contra la base.
   No hay nada que impida una regresión silenciosa.
3. Registrarse desde la app y completar `bootstrap.sql` para probar el lado de la
   dueña (bandeja de solicitudes, aceptar/rechazar).
4. **Probar E2 en el navegador con una cita real**: aceptar desde la bandeja, bajar
   el `.ics` y abrirlo en un iPhone y en un Android de verdad. Es el paso que
   convierte "compila" en "sirve".
5. Slice F (aviso por WhatsApp) cuando haya proveedor y credenciales.

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
