# Registro de clientas del negocio

> Documento vivo de ODD. Espejo en Engram: `odd/client-directory/tasks`.
> Locator: `odd/tasks/client-directory.md`

## Objetivo

Que la dueña tenga un registro de sus clientas (nombre y teléfono) que se llena solo con
cada cita, y que al agendar pueda elegir a una clienta existente o crear una nueva. Así toda
cita, venga del portal o la cree la dueña, lleva teléfono y el botón "Avisar por WhatsApp"
funciona también en las citas que hace la dueña.

## Problema

- El botón de aviso (`ClientNotice`) ya aparece en citas confirmadas/canceladas de cualquier
  origen, pero necesita `client_phone`.
- "Agendar una cita" (`ScheduleForm`) no pide teléfono y `schedule_appointment` no lo recibe:
  en las citas de la dueña sale "no dejó un teléfono al que escribirle".
- No existe entidad de clienta: nombre y teléfono viven sueltos en cada cita.

## Decisión (elegida por la dueña)

Opción A: tabla propia `client` por negocio (no una lista derivada de las citas). Referencia
visual: selector con búsqueda por nombre o teléfono, iniciales, teléfono debajo, "Sin teléfono"
cuando falta, y "+ Nueva clienta" que se guarda con la cita.

## Reglas de diseño

- `client(id, business_id, name, phone, created_at)` con RLS por miembro del negocio
  (INVARIANTE 1). Teléfono opcional; único por negocio cuando existe (se compara normalizado
  a dígitos).
- `appointment.client_id` opcional (citas antiguas sin él). `appointment.client` y
  `client_phone` se siguen guardando en la cita: son el dato de ESA cita (histórico).
- Portal: al pedir cita, el servidor busca la clienta por teléfono en ese negocio; si no
  existe la crea; si existe NO le cambia el nombre (manda lo que guardó la dueña).
- Dueña: `schedule_appointment` acepta teléfono opcional y `client_id` opcional; crea o
  enlaza la clienta en la misma transacción.
- Relleno inicial desde las citas existentes que tengan teléfono.
- Solo servicios (citas). Ropa queda fuera (INVARIANTE 3).
- UI en lenguaje de la dueña; nada de dinero en JSX.

## Alcance autorizado

- Migración nueva en `supabase/migrations/` + suite `supabase/tests/client-directory.sql`.
- Tipos en `src/lib/domain/types.ts`; lógica pura nueva (búsqueda, iniciales, normalización)
  en `src/lib/domain/` con tests.
- Store (`src/lib/store/StoreContext.tsx`): cargar clientas, pasar teléfono/clienta al agendar.
- UI: selector de clientas en `ScheduleForm` (componente nuevo).
- Fuera: ropa, pantalla de gestión de clientas, envío automático de WhatsApp.

## TDD

Modo: estricto (sesión del usuario). Runner: `npm run test:run` (vitest). SQL: suites en CI
(`sql-regression`); localmente solo si hay Postgres efímero disponible.

## Entrega

Rama `feat/client-directory` desde `develop`. Estrategia `ask-on-risk`. PR a `develop`.

## Tareas

- [x] **T1** — Migración: tabla `client` + RLS + índice único, `appointment.client_id`,
  `schedule_appointment` con teléfono/clienta, RPC pública de reserva crea/enlaza clienta,
  relleno inicial. Suite SQL. Ruta: delegada (escritor único).
- [x] **T2** — Dominio puro: tipo `Client`, búsqueda por nombre/teléfono, iniciales. TDD.
  Ruta: delegada (mismo escritor que T3–T4).
- [x] **T3** — Store: cargar clientas del negocio, `schedule` con `client_id`/teléfono.
- [x] **T4** — UI: selector de clientas en "Agendar una cita" con "+ Nueva clienta".
- [x] **T5** — Capturas a 390 px con Supabase simulado; aviso de WhatsApp en cita de la dueña.

## Checks

`npm run test:run`, `npm run typecheck`, `npm run build`, suite SQL en CI, capturas de T5.

## Progreso

- Rama `feat/client-directory` creada desde `origin/develop` (56e6669).
- T1 `3c172a6`: migración `20261103000001_client_directory.sql` (tabla `client` con
  `phone_digits` generado + índice único parcial; `appointment.client_id`;
  `schedule_appointment(..., p_deposit_method, p_client_phone, p_client_id)` sin sobrecargas;
  `public_request_booking` crea/enlaza sin renombrar; `backfill_client_directory()` sin
  acceso desde la API). Suite `client-directory.sql`. SQL NO corrido localmente (sin docker):
  queda para el job `sql-regression` de CI. test:run 680/680, typecheck limpio.
- T2 `1769d14`: `src/lib/domain/clients.ts` (`phoneDigits`, `searchClients`, `clientInitials`,
  `findClientByPhone`); RED por módulo ausente, GREEN 15/15.
- T3 `b7dc019`: `store.clients` cargado por negocio; `scheduleRpcArgs` manda
  `p_client_phone`/`p_client_id` (RED: 3 tests de `selection.test.ts`); recarga tras agendar.
- T4 `17b1c9b`: `ClientPicker` en `ScheduleForm` (lista en línea, "+ Nueva clienta", aviso de
  teléfono repetido, ficha con "Cambiar"). Verificación: test:run 697/697, typecheck y build OK.
- T5 `26e32b9`: capturas 390/360 px con Supabase simulado. Overflow 0 px, Escape cierra,
  foco visible, objetivos >= 44 px; `schedule_appointment` recibe `p_client_id` y
  `p_client_phone`; la cita de la dueña muestra "Avisar a … por WhatsApp" con enlace wa.me.
  Arreglos: tocar el campo reabre la lista; aviso de duplicada a ancho completo en 360 px.

- RDD: `review assess` → high (`high_risk`). Consentimiento: concedido por la dueña. Revisión
  4R aprobada sin bloqueos; acuse `review-d9c730b6dc05e816` (autoridad quemada). Avisos no
  bloqueantes: carrera al crear clienta desde el portal (dos reservas simultáneas con el mismo
  teléfono → choque con el índice único), clientas sin teléfono duplicadas en cada cita sin
  teléfono, nombre fijado por la primera reserva pública, lo tecleado en la búsqueda no pasa a
  "Nueva clienta" en algún caso, recarga completa de clientas tras cada cita.

## Pendiente / abierto

- Pantalla para editar o fusionar clientas: fuera de alcance.
- `+1 809…` y `809…` cuentan como teléfonos distintos (dígitos exactos, igual que el servidor):
  posible duplicado. Decidir si normalizar el código de país en `phone_digits`.
