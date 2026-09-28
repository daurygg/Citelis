# Reservas en vivo

## Objetivo

Que una reserva nueva, o un cambio de estado, aparezca en la agenda y la bandeja
de la dueña **sin recargar**: en vivo con la app abierta, y al día en cuanto
vuelve a ella.

## Problema

Verificado el 2026-09-27 en la prueba real de los avisos push: llega la
notificación, la dueña abre Citelis y la bandeja sigue vacía hasta que recarga.

- `StoreProvider` (`src/lib/store/StoreContext.tsx:175`) carga todo **una vez**
  al montar. No hay suscripción a cambios.
- En iOS, al volver a una app en segundo plano el sistema la muestra tal como
  estaba: no se recarga.

## Por qué así

Decisión del usuario (2026-09-27): "reactivo como si estuviera usando SignalR".

- **Supabase Realtime** (`postgres_changes`) es ese WebSocket: el servidor
  empuja cada INSERT/UPDATE de `appointment`.
- **Límite de la plataforma:** con la app en segundo plano, iOS suspende el JS y
  corta el socket. Para ese tramo ya está el push. Al volver hay que **ponerse al
  día**, como hace un cliente de SignalR al reconectar.

Verificado en la documentación de Supabase:
- La RLS filtra los INSERT/UPDATE que se entregan.
- Los DELETE **no** pasan por RLS. No se escuchan, y además las citas nunca se
  borran en la app (solo cambian de estado).
- La tabla tiene que estar en la publicación `supabase_realtime`.
- `SUBSCRIBED` se emite también al reconectar.

## Alcance

DENTRO:
- Migración: `appointment` en la publicación `supabase_realtime` (sin recrearla).
- Lógica pura para aplicar un cambio a la lista de citas (insertar sin duplicar,
  reemplazar, ignorar lo de otro negocio).
- Suscripción en el store, filtrada por `business_id`.
- Puesta al día al volver a la app (`visibilitychange`) y en cada `SUBSCRIBED`
  (primera conexión y reconexiones).

FUERA:
- Tiempo real de otras tablas (servicios, insumos, horarios). Solo las cambia la
  dueña desde su propio dispositivo.
- Inventario/ropa.
- El filtro por `business_id` que falta en las lecturas iniciales del store
  (`StoreContext.tsx:200-209`), que hoy depende solo de la RLS. Está anotado y
  va en otro slice.

## Diseño

- `src/lib/store/appointmentSync.ts`, puro:
  `applyAppointmentChange(list, change, businessId)`.
  - Un INSERT que ya existe en la lista (el eco de una escritura propia) no se
    duplica.
  - El UPDATE reemplaza la fila por la del servidor.
  - Una fila de otro negocio se ignora. Es una defensa redundante con la RLS y
    el filtro (INVARIANTE 1).
- `src/lib/store/liveAppointments.ts` (sin React; un `useEffect` de `StoreReady`
  la arranca): el canal `appointments:<business_id>:<aleatorio>` con
  `filter: business_id=eq.<id>`, más la puesta al día
  (`select ... eq('business_id', id)`) al volver a la app y en cada `SUBSCRIBED`.
  Los eventos que llegan con la consulta en vuelo se reaplican sobre la foto. Se
  limpia al desmontar.
- **INVARIANTE 2:** el eco de una cita COMPLETADA trae los mismos valores
  congelados. El cliente nunca recalcula dinero a partir de un evento.

## Modo TDD

Estricto, activo. Fuente: convención de `odd/tasks/*.md`. Runner:
`npm run test:run` (vitest).

## Tareas

- [x] **T1 · Migración** (inline): `appointment` en `supabase_realtime`, de forma
  idempotente. En CitelisDev la publicación existía vacía. Test
  `supabase/tests/live-appointments.sql`: RED (`FALLÓ 1`) → aplicada
  `20260928000001` → VERDE 3/3.
- [x] **T2 · Lógica pura** (inline): `src/lib/store/appointmentSync.ts`. RED
  (módulo inexistente) → GREEN 8/8; `tsc` limpio.
- [x] **T3 · Cableado** (inline): `src/lib/store/liveAppointments.ts`, sin React y
  probado con dobles del cliente y del documento. Cubre el canal con filtro por
  negocio (sin DELETE), la puesta al día en cada `SUBSCRIBED` y al volver a la
  app, conservar la lista si la consulta falla, la respuesta vieja que no pisa a
  la nueva y la limpieza al parar. RED → GREEN 9/9. Un `useEffect` en
  `StoreReady`; la bandeja lee el mismo estado (`pendingRequests`,
  `StoreContext.tsx:348`). Suite 266/266, `tsc` y build limpios.
- [x] **T4 · Prueba real** (2026-09-27, PR #23 mergeado en `develop`, preview
  contra CitelisDev): el usuario confirmó que con la app abierta la reserva
  desde otro teléfono **aparece en vivo**. El caso de volver desde segundo plano
  no se reportó por separado: cubierto por tests (`visibilitychange`), sin
  prueba manual.

## Criterios de aceptación

1. Con la bandeja abierta, una reserva del portal aparece en segundos sin tocar nada.
2. Aceptar o rechazar en un dispositivo se refleja en otro que tenga la app abierta.
3. Al volver a la app tras tenerla en segundo plano, lo que entró mientras tanto ya está.
4. Nunca aparece una cita de otro negocio.
5. Una escritura propia no se duplica al llegar su eco.

## Revisión

Lineage `review-0985bf955505599f` sobre `develop..aa275c0` (594 líneas, riesgo
medio). Usuario: `granted`. **Aprobada** y reconocida (`burned`). Tres notas,
todas válidas. RED (4 tests fallando por las tres) → GREEN:

- ✅ Una puesta al día en vuelo pisaba los eventos que llegaban mientras tanto
  (justo al conectar) → se guardan y se reaplican sobre la foto.
- ✅ El ticket contra respuestas viejas no estaba probado (el doble respondía al
  instante) → doble con consultas diferidas y prueba de respuestas fuera de orden.
- ✅ Tema fijo por negocio: realtime-js devuelve el canal existente
  (`RealtimeClient.js:340`), y con el doble montaje de StrictMode fallaría →
  tema único por arranque.

Suite 271/271, `tsc` y build limpios.

## Entrega

Pronóstico: ~300 líneas, por debajo de las ~400. Un solo PR contra `develop`.

## Progreso

- 2026-09-27: rama `feat/live-appointments` desde `develop` (`1e6183a`).
- 2026-09-27: PR #23 (`6d8b3e7..7a7faac`, +709) mergeado en `develop` (`56ebcae`).

## Siguiente paso

**En producción desde el 2026-09-27** (release #25, `main` `97fa485`).
`20260928000001` se aplicó con `db push`. Prueba real del usuario en producción:
la reserva apareció sola en la bandeja.

Queda por hacer: probar a mano la vuelta desde segundo plano (hoy solo la
cubren los tests), y el filtro por `business_id` en las lecturas iniciales del
store (`StoreContext.tsx:200-209`), que va en otro slice.
