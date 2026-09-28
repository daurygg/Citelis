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

- [ ] **T1 · Lógica pura** (inline): `src/lib/push/` (clave VAPID, estado del
  botón) + mensaje en `supabase/functions/_shared/`. RED primero.
- [ ] **T2 · Migración** (inline): `push_subscription` + RLS con `is_member` y
  `user_id = auth.uid()`, `pg_net`, trigger leyendo Vault. Test SQL.
- [ ] **T3 · Edge Function** `notify-new-booking` (inline).
- [ ] **T4 · PWA** (delegada, 4+ archivos): `public/manifest.webmanifest`,
  íconos, `public/sw.js`, registro del SW, metas de iOS en `index.html`.
- [ ] **T5 · UI** (inline): botón en "Mi negocio"; abrir la pestaña de reservas
  al tocar la notificación.
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
`ask-on-risk` (pendiente de elegir cadena).

## Progreso

- 2026-09-27: rama `feat/owner-push-notifications` desde `develop` (`0115f72`).
  Documento creado.

## Siguiente paso

T1.
