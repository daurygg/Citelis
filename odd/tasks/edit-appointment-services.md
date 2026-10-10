# Editar los servicios de una reserva

## Objetivo

Pedido de la dueña (2026-10-10): "Poder editar las reservas agregándole servicios
después de haber reservado si hay horario disponible."

Desde la agenda, la dueña cambia los servicios de una cita que aún no es historia
(agregar, o quitar mientras quede al menos uno). Solo se acepta si la nueva suma de
duraciones cabe en el mismo inicio de la cita.

## Alcance y decisiones

- **Quién:** la dueña, desde `AppointmentRow`. La clienta no edita desde el portal.
- **Qué estados:** REQUESTED, PENDING, IN_PROGRESS. COMPLETED (INVARIANTE 2),
  CANCELED, NO_SHOW y REJECTED no se tocan.
- **El inicio no cambia.** Para mover la hora ya existe Reprogramar.
- **Qué es "cabe"** (todo con funciones existentes, sin duplicar lógica):
  sin choque con otras citas (`findScheduleConflict`), dentro del horario del
  negocio y fuera de bloqueos (`generateSlots`, con la política de reserva
  neutralizada: la dueña agenda sin anticipación ni descanso), y fallo seguro si
  otra cita tiene duración desconocida.
- **Si la duración no crece** (quitar, o cambiar por algo igual o más corto) no se
  revisa horario: solo libera tiempo, y la cita pudo haberse agendado fuera de
  horario.
- **Negocio sin horarios definidos:** el horario no limita (agendar desde la
  agenda tampoco lo exige); sí cuentan choques y bloqueos.
- **Dinero:** no se toca. Las líneas nuevas nacen con precio/costo/ganancia NULL;
  todo se congela al COMPLETAR. Un `quoted_price` acordado antes se conserva tal
  cual (ver pregunta abierta).
- **Servidor:** la RPC `update_appointment_services` reemplaza las líneas de forma
  atómica y revalida estado, pertenencia, duplicados y duración. El choque de
  horarios se comprueba solo en cliente, igual que `schedule_appointment` y
  Reprogramar (ver comentario de la migración).

## Preferencias de trabajo

TDD: activo (fuente: precedente del proyecto, `multi-service-appointments.md`).
Runner: `npm run test:run` (vitest, entorno node: la lógica va en funciones puras).
Ruta: un solo escritor, delegado directo.

## Tareas

- [x] **E1 · Dominio puro** `src/lib/domain/editServices.ts`: `canEditServices`,
  `checkServicesEdit`, `updateServicesRpcArgs`.
  RED: suite `editServices.test.ts` sin cargar (módulo inexistente), 409 pasando en
  las otras 26. GREEN: 442 passed (+33) en 27 archivos; typecheck limpio.
- [x] **E2 · Migración + regresión SQL** `20261010000007_update_appointment_services.sql`
  y `supabase/tests/update-appointment-services.sql`.
  Escrita; NO ejecutada localmente (sin Docker ni psql): la corre el job
  `sql-regression` de CI. Usuarias de la suite: `...09f3` y `...09f4`.
- [x] **E3 · Store** `updateAppointmentServices(id, serviceIds): Promise<ActionResult>`
  y `checkServicesEdit(id, serviceIds)` (para explicar en pantalla por qué no cabe).
  Espera al servidor; el estado local (`service_id`, `service_ids`) cambia solo si
  confirma. Sin test propio (el store no es testeable en vitest/node): la lógica
  vive en el dominio.
- [x] **E4 · UI** "Editar servicios" en `AppointmentRow`: chips (mismo patrón que
  `ScheduleForm`), duración y estimado nuevos, guardado deshabilitado con la razón
  visible, guardia `savingServices`, toasts. Visible en REQUESTED, PENDING e
  IN_PROGRESS. Helper puro `servicesChanged` (RED: 3 tests fallando; GREEN).
  Sin verlo en navegador.

## Verificación

`npm run typecheck`, `npm run test:run`, `npm run build`; la regresión SQL corre en
CI (`sql-regression`) al abrir el PR.

## Cierre (2026-10-10)

`npm run typecheck` limpio; `npm run test:run` 445 passed (+36) en 27 archivos;
`npm run build` correcto. La regresión SQL NO se corrió localmente.

## Preguntas abiertas de producto

- Si la cita tiene `quoted_price` (precio acordado) y se agregan servicios, el
  acuerdo se conserva tal cual y manda al cobrar. ¿Debe avisarse a la dueña de que
  el total acordado ya no incluye lo agregado?
- ¿La clienta debe enterarse del cambio (aviso por WhatsApp)? Hoy no se avisa.
- Negocio sin horarios definidos: el horario no limita (como agendar hoy).
