# Avisarle a la clienta cuando se responde su solicitud

## Objetivo

Que la clienta se entere de si su cita quedó confirmada o rechazada, con un solo
toque desde el teléfono de la dueña.

## Problema

Hoy la clienta NO se entera de nada. Verificado:

- Las cuatro RPC públicas son `public_business`, `public_hours`, `public_busy` y
  `public_request_booking`. Ninguna devuelve el estado de una solicitud: no hay
  página donde ella pueda consultar.
- No se le pide correo. Solo nombre y teléfono.
- Al rechazar, la solicitud desaparece de la bandeja de la dueña y el hueco se
  libera (`occupiesSchedule` excluye `REJECTED`, y `public_busy` solo cuenta
  `REQUESTED`, `PENDING`, `IN_PROGRESS`, `COMPLETED`). Correcto por dentro, mudo
  por fuera.

Resultado: la clienta espera una respuesta que nunca llega, y puede aparecerse
en el salón. Rechazar sin avisar es peor que no tener portal.

## Por qué así y no automático

Decisión del usuario (2026-09-22): se usa un enlace `wa.me` que abre WhatsApp con
el mensaje ya escrito, y la dueña solo pulsa enviar. El API oficial de WhatsApp
exige verificación de Meta, número dedicado, plantillas aprobadas y pago por
conversación: es papeleo y semanas, no programación. Queda aplazado, no
descartado — ver `docs/whatsapp-api.md`.

## Alcance

DENTRO:
- Módulo puro: normalizar el teléfono a formato internacional, redactar el
  mensaje de aceptada y el de rechazada, y armar el enlace `wa.me`.
- Botón "Avisar a la clienta" en la bandeja, en los DOS caminos.
- Guía escrita para implementar el WhatsApp automático cuando toque.

FUERA:
- El API oficial de WhatsApp. Solo se documenta.
- SMS como respaldo.
- Página pública de "estado de mi cita".

## Diseño

El mensaje lo compone el dominio a partir de textos ya formateados (`dateLabel`,
`timeLabel`) que le pasa la UI: así el dominio no arrastra el formateo de fechas
y los tests quedan directos.

El de rechazo no puede limitarse a decir que no: tiene que reabrir la
conversación, o la clienta se queda sin salida.

## Modo TDD

Estricto, activo. Runner: `npm run test:run` (vitest).

## Tareas

- [x] **T1 · Módulo puro** `src/lib/domain/whatsapp.ts` + test. RED primero.
- [x] **T2 · Bandeja**: panel de respuesta para aceptada Y rechazada, con el botón.
- [ ] **T3 · Guía** `docs/whatsapp-api.md` con los requisitos reales, verificados
  contra fuentes primarias.

## Criterios de aceptación

1. Aceptar una solicitud ofrece avisar, con fecha y hora en el mensaje.
2. Rechazar una solicitud TAMBIÉN ofrece avisar.
3. Una solicitud sin teléfono no ofrece el botón, y lo dice.
4. El teléfono se normaliza a internacional (RD: 10 dígitos → prefijo 1).

## Verificación

`npm run test:run`, `npm run typecheck`, `npm run build`.

## Progreso

- 2026-09-23 · T1 y T2 cerradas. ROJO observado en T1 (`Failed to load url ./whatsapp`),
  VERDE con 178 tests (11 nuevos). typecheck y build correctos.
- T3 (la guía) pendiente de la investigación contra fuentes primarias.
