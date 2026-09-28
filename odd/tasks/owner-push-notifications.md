# Avisarle a la dueña cuando entra una reserva

## Objetivo

Que al iPhone de la dueña le llegue una notificación, como la de cualquier app,
en cuanto una clienta pide cita desde el portal público.

## Problema

Hoy la dueña solo se entera si abre Citelis y recarga. Verificado:

- `public_request_booking` inserta la cita con `status = 'REQUESTED'` y
  `source = 'SELF'` (`20260918000001_baseline_existing_schema.sql:174-249`). No
  avisa a nadie.
- No hay reactividad: los datos se cargan una vez al montar (`StoreContext.tsx`).
- No existe nada de la infraestructura: sin `public/`, sin manifest, sin
  service worker, sin Edge Functions, sin `pg_net`.

## Por qué Web Push

Decisión del usuario (2026-09-27): push antes que correo. Desde iOS 16.4 Safari
entrega Web Push estándar (Push API + service worker + VAPID) **solo a webs
añadidas a la pantalla de inicio**. Gratis, sin cuenta de Apple ni terceros.
El permiso solo se puede pedir tras un toque de la dueña.

## Alcance

DENTRO:
- Citelis instalable: manifest, íconos, service worker.
- Botón "Avisarme de nuevas reservas" en "Mi negocio", con los estados
  "no compatible", "instala primero en la pantalla de inicio", "activo".
- Tabla `push_subscription` aislada por `business_id`.
- Disparador en base de datos al insertar una cita `REQUESTED` + Edge Function
  que envía el push y limpia suscripciones muertas (404/410).
- Tocar la notificación abre la bandeja de solicitudes.

FUERA:
- Correo como respaldo.
- Tiempo real con la app abierta (Supabase Realtime). Complementario, otro slice.
- Avisos de otros eventos (cancelaciones, recordatorios).

## Diseño

- **Disparador**: trigger `AFTER INSERT` en `appointment` cuando
  `status = 'REQUESTED'`, que llama a `net.http_post` hacia la Edge Function
  `notify-new-booking` con el `id` de la cita. URL y secreto compartido salen de
  Supabase Vault (`notify_new_booking_url`, `notify_new_booking_secret`), así la
  misma migración vale para CitelisDev y producción. Si falta la config, el
  trigger no hace nada: **una reserva nunca falla por culpa del aviso**.
- **Edge Function** (`verify_jwt = false`, protegida por el secreto en cabecera):
  lee cita + servicio + suscripciones del negocio con service role, compone el
  mensaje y envía con `npm:web-push`. Borra las suscripciones que respondan
  404/410.
- **Mensaje**: módulo puro sin dependencias de Deno en
  `supabase/functions/_shared/`, testeado por vitest (se amplía `include`).
- **Cliente**: lógica pura en `src/lib/push/` (decodificar la clave VAPID,
  decidir el estado del botón a partir de capacidades del navegador). La UI solo
  la llama.
- **Claves**: pública en `VITE_VAPID_PUBLIC_KEY` (Vercel); privada como secreto
  de la Edge Function.

## Modo TDD

Estricto, activo. Fuente: convención de `odd/tasks/*.md`. Runner:
`npm run test:run` (vitest). SQL: `supabase/tests/*.sql` a mano (no corre en CI).

## Tareas

Ruta por tarea entre paréntesis.

- [x] **T1a · Mensaje** (inline): `supabase/functions/_shared/newBookingMessage.ts`.
  RED (módulo inexistente) → GREEN 6/6; suite 197/197. Commit `7a98001`.
  RDD: riesgo medio, `under_budget` (queda pendiente en el slice).
- [x] **T1b · Lógica pura del cliente** (inline): `src/lib/push/pushSupport.ts`
  (estado del botón, iOS/iPadOS, clave VAPID, fila de suscripción). RED (módulo
  inexistente) → GREEN 17/17; suite 236/236; `tsc` limpio. PR 2.
- [x] **T2 · Migración** (inline): `push_subscription` + RLS con `is_member` y
  `user_id = auth.uid()`, `pg_net`, trigger leyendo Vault. Test SQL.
  CitelisDev: RED (`save_push_subscription does not exist`) → aplicada
  `20260927000001` → VERDE 5/5. El linter señaló `pg_net` en `public` y EXECUTE
  para `anon`: corregido en `20260927000002` (migración aparte porque la primera
  ya había corrido), aserción 6 añadida → VERDE 6/6, sin restos. Commit `0c4c4ed`.
- [x] **T3 · Edge Function** `notify-new-booking` (inline). `deno check` exit 0.
  Sin desplegar (va en T6, necesita secretos). Commit `9f0c06d`.
- [x] **T4 · PWA** (delegada, 4+ archivos): `public/manifest.webmanifest`,
  íconos (`scripts/generate-icons.mjs`, Node sin dependencias: no hay
  ImageMagick/PIL), `public/sw.js` (sin caché), metas de iOS, registro en
  `main.tsx`. `npm run build` deja `dist/sw.js`, manifest e íconos; PNG válidos
  (firma + IHDR 192/512/180). Commit `1a4e0aa`.
- [x] **T5 · UI** (delegada junto a T4): `PushNotificationSettings` en "Mi
  negocio", adaptador `pushSubscriptionApi.ts`, deep link `?vista=reservas` con
  `initialViewFromSearch` (RED → GREEN 4/4). Revisión del padre antes del commit:
  `serviceWorker.ready` se colgaba sin SW → `getRegistration()`; el borrado no
  filtraba `business_id` → filtra (INVARIANTE 1); los tipos de vista pasaron de
  `App.tsx` a `src/lib/initialView.ts` (la lógica no depende de la UI). Suite
  240/240, `tsc` y build limpios. Commit `3cf033d`.
  Pendiente: `.env.example` sin `VITE_VAPID_PUBLIC_KEY` (lectura denegada por
  permisos; no se toca sin el usuario).
- [ ] **T6 · Despliegue en CitelisDev + guía** `docs/push-notifications.md`:
  claves, secretos, Vault, prueba en el iPhone de la dueña.

## Criterios de aceptación

1. En un iPhone con Citelis instalado, la dueña activa el aviso con un toque.
2. Una reserva desde el portal le llega como notificación en segundos, con
   clienta, servicio, día y hora.
3. Tocar la notificación abre la bandeja de solicitudes.
4. En Safari sin instalar, el botón explica cómo instalar en vez de fallar.
5. Una reserva se crea igual aunque el aviso falle o no esté configurado.
6. Nadie ve ni borra suscripciones de otro negocio.

## Entrega

Pronóstico: ~700 líneas, por encima de las ~400 de referencia. Estrategia:
`ask-on-risk`; cadena elegida por el usuario: **stacked-to-main** (contra `develop`).

- **PR 1 · backend** (`feat/owner-push-notifications` → `develop`): T1a, T2, T3.
  **#20** abierto 2026-09-27 (`7a98001..812c68d`, +1093/−1).
- **PR 2 · cliente** (`feat/owner-push-client` → PR 1): T1b, T4, T5, T6.

Librería de push: `jsr:@negrel/webpush@0.5.0` (WebCrypto). `npm:web-push` falla
en Deno con `crypto.createECDH is not a function`. `deno check` de la función: exit 0.

## Revisión PR 1

Lineage `review-7c98f6e33ab42f41`, riesgo medio, `slice_budget_reached` (624
líneas). Usuario: `granted`. Un lente (`review-reliability`). **Aprobada** y
reconocida (`authority: burned`); frontera revisada = `9f0c06d`. Cinco notas
informativas:

- ✅ Claves VAPID cargadas al importar el módulo → perezosas, 500 controlado (`43ea73d`).
- ✅ Aserción 5 pasaba en vacío → siembra filas ajenas + control positivo (`43ea73d`).
- ✅ Vault a medio configurar daba un falso rojo → cada secreto por separado (`43ea73d`).
- ⛔ `client.trim()` con null: no aplica, `appointment.client` es `not null`.
- ✅ El handler no tenía tests → decisión del usuario: hacerlo ya. Extraído a
  `_shared/notifyNewBooking.ts` con dependencias inyectadas; RED (módulo
  inexistente) → GREEN 13/13; suite 210/210; `deno check` y `tsc` limpios.
  Commit `f7a4760`.

Segunda revisión: lineage `review-167234640809f6b6` sobre `9f0c06d..f7a4760`
(522 líneas, medio). Usuario: `granted`. **Aprobada** y reconocida (`burned`);
frontera revisada = `f7a4760`. Cuatro notas, todas atendidas en `2864548`
(RED → GREEN 9 tests nuevos; suite 219/219; `deno check` y `tsc` limpios):

- ✅ Clasificación 404/410 y reintento del envío sin probar → `_shared/notifyWiring.ts`.
- ✅ Aplanado del join del servicio sin probar → `toBookingForNotice`.
- ✅ Fallo al borrar suscripciones muertas daba 500 → se registra y responde 200.
- ✅ Sin URL/service key, las 401/405 salían como 500 → cliente creado tras autenticar.

`f7a4760..2864548`: riesgo medio, `under_budget` (queda pendiente en el slice).

## Progreso

- 2026-09-27: rama `feat/owner-push-notifications` desde `develop` (`0115f72`).
  Documento creado.

## Siguiente paso

T1.
