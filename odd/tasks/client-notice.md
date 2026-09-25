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
- [x] **T3 · Guía** `docs/whatsapp-api.md` con los requisitos reales, verificados
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
- 2026-09-23 · T3 cerrada: `docs/whatsapp-api.md`, investigada contra fuentes
  primarias, con lo no verificable marcado como tal.
- CORRECCIÓN a lo que se asumió el 2026-09-22: la verificación de empresa de Meta
  NO es requisito para empezar. Un portafolio nuevo ya manda a 250 clientas
  distintas cada 24 h sin verificar, que para un salón sobra. El freno real es
  que el API exige un número DEDICADO: el WhatsApp que la dueña ya usa no se
  puede registrar sin perderlo en la app de consumidor.

## T4 · El aviso se perdía al recargar (2026-09-25)

Reportado desde producción: aceptas una cita, recargas, y ya no hay forma de
avisar a la clienta. Se queda sin enterarse.

**Causa**: el botón vivía SOLO dentro de `AnsweredPanel`, que es estado de React.
Al recargar moría, y la cita ya no estaba en la bandeja porque había pasado a
PENDING: se había ido a la agenda, donde `AppointmentRow` ofrecía "Calendario"
pero no ofrecía avisar. Fallo de diseño de la entrega anterior, no del usuario.

**Arreglo**: el aviso cuelga de la CITA, no de un panel efímero.
- `noticeOutcomeFor(status)` en el dominio decide qué aviso toca, con un mapa
  EXHAUSTIVO sobre `AppointmentStatus`: si mañana aparece un estado nuevo,
  TypeScript obliga a decidir qué se le dice a la clienta en vez de dejarla sin
  aviso en silencio. PENDING → aceptada; REJECTED y CANCELED → rechazada (para
  la clienta son lo mismo: no hay cita); el resto, nada que avisar.
- `src/components/ClientNotice.tsx`, compartido por la agenda y la bandeja, como
  ya lo era `CalendarActions`.
- La bandeja le pasa el `outcome` explícito porque guarda la solicitud tal como
  estaba ANTES de responder: su estado sigue siendo REQUESTED.

Efecto secundario bueno: ahora también se puede avisar de una cita CANCELADA,
que antes no tenía salida ninguna.

ROJO observado: 5 fallos en `noticeOutcomeFor`. VERDE: 183 tests (5 nuevos),
typecheck limpio, build correcto.

Ruta: **inline** — una unidad coherente (un añadido puro con su test, un
componente nuevo y dos inserciones mecánicas).

## T5 · Que la clienta no teclee su teléfono en cada reserva (2026-09-25)

Pedido por el usuario: el objetivo real no era automatizar WhatsApp, era que la
clienta que vuelve no repita sus datos.

Dos capas, ninguna necesita el API:

1. **`autoComplete`** en los dos campos (`name` y `tel`). Solo había `type="tel"`,
   que saca el teclado numérico pero no pide autorrelleno. Con el atributo, iOS y
   Android ofrecen los datos de la propia clienta incluso la primera vez que
   entra al portal.
2. **Recordar en SU dispositivo** (`src/lib/rememberedClient.ts`). El dato no
   viaja a la base ni lo ve el negocio; vive en el almacenamiento local de su
   navegador. Solo se guarda cuando la reserva se envió bien.

`parseRememberedClient` es estricta a propósito: el contenido sale del
dispositivo de la clienta, puede estar a medias o manipulado, y rellenar el
formulario con basura es peor que no rellenarlo. Rechaza JSON roto, formas que no
corresponden, campos que no son texto, vacíos y valores absurdamente largos.

Lectura y escritura van en try/catch: en modo privado o con el almacenamiento
bloqueado, `localStorage` LANZA. Que no se pueda recordar un teléfono nunca puede
impedir reservar.

Límite honesto, y está escrito en el módulo: es por dispositivo y navegador.

ROJO observado: 8 fallos. VERDE: 191 tests (8 nuevos), typecheck y build limpios.

FUERA por ahora: el enlace con el teléfono ya puesto (`?tel=`). Gana poco mientras
la dueña tenga que armarlo a mano; cobra sentido cuando el envío automático lo
construya solo.

## Siguiente

- Que la página se actualice sola: hoy no hay ninguna suscripción en tiempo real,
  los datos se cargan una vez al montar, así que una solicitud nueva no aparece
  hasta recargar.
- Varios servicios por cita: `appointment.service_id` es una sola columna, y
  cambiarlo arrastra duración, precio, costo, el dinero congelado y las RPC
  públicas.
