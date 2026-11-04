# Validación del teléfono de la clienta

> Documento vivo de ODD. Espejo en Engram: `odd/phone-validation/tasks`.
> Locator: `odd/tasks/phone-validation.md`

## Objetivo

Que ningún teléfono inválido (letras, muy corto, muy largo) entre al sistema, ni desde la app de
la dueña ni desde el portal, y que la pantalla lo diga en lenguaje claro antes de enviar.

## Problema (encontrado por la dueña al probar #73)

- "+ Nueva clienta": el campo acepta letras; nada valida.
- `schedule_appointment`: solo rechaza si no hay ningún dígito ("abc 123" pasa como "123").
- Portal (`PublicBooking` + `public_request_booking`): solo exige no vacío.
- Causa: el alcance de `client-directory` copió el comportamiento previo del portal y solo pidió
  normalizar, no validar.

## Regla (decidida con la dueña: se aceptan otros países)

- Caracteres permitidos: dígitos, espacios, `-`, `.`, `(`, `)` y un `+` solo al inicio. Cualquier
  otro carácter (letras incluidas) → inválido.
- Sin `+`: número dominicano → 10 dígitos, o 11 empezando por `1`.
- Con `+`: internacional E.164 → entre 8 y 15 dígitos.
- Vacío: permitido solo donde el teléfono es opcional (agendar de la dueña); el portal lo exige.
- La normalización existente (`client_phone_digits`, `phoneDigits`, `normalizeWhatsAppPhone`) no
  cambia.

## Alcance autorizado

- Lógica pura `isValidPhone` (o equivalente) en `src/lib/domain/` con tests, usada por
  `ClientPicker`, `ScheduleForm` y el portal (`src/components/public/*`).
- Migración NUEVA con `client_phone_is_valid(text)` inmutable, usada por `schedule_appointment` y
  `public_request_booking` (mismas firmas y grants). Suite SQL.
- Fuera: limpiar teléfonos inválidos ya guardados (se reporta cuántos, no se tocan).

## TDD

Estricto. Runner `npm run test:run`. SQL en CI (`sql-regression`).

## Tareas

- [x] **T1** — Regla pura TS + tests (RED→GREEN). Ruta: delegada (escritor único T1–T3).
- [x] **T2** — UI: mensaje "Escribe un teléfono válido" y botón bloqueado en "+ Nueva clienta" y
  en el portal.
- [x] **T3** — Servidor: migración nueva + suite SQL.

## Progreso

- Rama `fix/phone-validation` desde `origin/develop`.
- T1 `245fab4`: `isValidPhone` + `PHONE_INVALID_MESSAGE` en `clients.ts` (RED 6 fallos, GREEN 25/25).
- T2 `7af71d0`: aviso accesible y envío bloqueado en "+ Nueva clienta" (vacío permitido) y en el
  portal (obligatorio).
- T3 `038c96f`: migración `20261104000001_client_phone_validation.sql` con
  `client_phone_is_valid(text)`; ambas RPC rechazan antes de escribir. Excepción: con `p_client_id`,
  el teléfono ya guardado de esa clienta se acepta aunque sea antiguo e inválido (si no, elegirla
  fallaría). Suite `client-phone-validation.sql` (sin ejecutar localmente).
- Verificación: test:run 707/707, typecheck y build OK.
