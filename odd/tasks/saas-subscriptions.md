# Suscripciones: cada negocio paga un plan mensual a Citelis

## Objetivo

Que cada negocio pague un plan mensual por usar Citelis. En esta fase el cobro es
manual: el negocio transfiere y el administrador de la plataforma registra el pago
desde un panel. Cuando el plan vence, el negocio tiene unos días de gracia con aviso y
después queda bloqueado. Más adelante una pasarela registrará los pagos sola, sin
cambiar el resto.

## Decisiones del usuario (2026-10-12)

- Cobro **manual** (transferencia) en esta fase; **automático** con pasarela después.
  Stripe no opera en RD. Candidatas para después: PayPal, Azul, CardNet, Paddle (sin
  verificar que acepte vendedores en RD).
- **Un solo plan** por ahora; la tabla queda lista para más.
- Negocio nuevo: **14 días de prueba** gratis.
- Al vencer (prueba o pago): **7 días de gracia** con aviso visible, luego **bloqueo**.
  El bloqueo también corta las **reservas públicas**.
- **Panel de administración** dentro de Citelis, visible solo para el administrador de
  la plataforma. Lista los negocios con su estado y tiene "Registrar pago" hasta una
  fecha.
- Negocios que ya existen: **exentos hasta que el administrador lo quite**.

## Valores por defecto tomados (revisables)

- Estados: `TRIAL`, `ACTIVE`, `GRACE`, `BLOCKED`, `EXEMPT`. Gracia = vencido hace
  menos de 7 días, ya sea la prueba o un pago.
- El **recibo público** (`/recibo/<token>`) sigue funcionando con el negocio bloqueado:
  es el comprobante de la clienta, no una función del negocio.
- El administrador de la plataforma vive en una tabla aparte (`platform_admin`), que
  solo se llena por migración o SQL. Nadie puede darse ese permiso desde la app.
- Un pago es un hecho **append-only** (`subscription_payment`): extender la fecha añade
  una fila, nunca edita una anterior.
- Montos en centavos enteros, en RD$.

## Diseño

- **Lógica pura** `src/lib/domain/subscription.ts`: `subscriptionStatus(sub, now)` →
  estado + días restantes. La UI y los tests usan esta función.
- **Base de datos**:
  - `business_subscription(business_id PK, plan, trial_ends_at, paid_until, exempt)`.
  - `subscription_payment(id, business_id, amount_cents, paid_until, method, note,
    recorded_by, created_at)`.
  - `platform_admin(user_id)`.
  - Funciones `subscription_status(b)` y `business_operational(b)`, espejo en SQL de la
    lógica pura.
- **El bloqueo se aplica en el servidor**, no solo en la UI:
  - `is_member(b)` pasa a exigir además `business_operational(b)`. Con el negocio
    bloqueado, toda tabla con RLS queda invisible y no se puede escribir. Es un solo
    punto de cambio.
  - Las RPC públicas de reserva (`public_business`, `public_hours`, `public_busy`,
    `public_request_booking`, `resolve_public_slug`) devuelven "no disponible".
  - `my_subscription()` (security definer) deja que la app lea el estado aunque esté
    bloqueada, para mostrar la pantalla de bloqueo.
- **Panel**: RPC `admin_*` que exigen `is_platform_admin()`.
- **Pasarela futura**: la pasarela será otro llamador de "registrar pago"; el resto del
  sistema no cambia.

## Riesgo principal

Cambiar `is_member` toca toda la RLS del sistema. Mitigación: una suite SQL que pruebe
los 5 estados contra lectura, escritura y reservas públicas, y correr todas las suites
existentes. Un negocio exento o en prueba debe comportarse exactamente igual que hoy.

## Tareas

- [x] **S1 · Estado de la suscripción (dominio puro).** `subscriptionStatus` con tests:
  prueba, al día, gracia (día 0 y día 7), bloqueado, exento y los bordes de fecha.
  - RED: `subscription.test.ts` fallaba al no existir el módulo.
  - GREEN: 11/11 tests; suite completa 572/572; `npm run typecheck` limpio.
  - Ruta: inline (un archivo y su test). Commit `94d36de`. Revisión: riesgo medio, `under_budget` (queda pendiente dentro del corte del PR 1).
- [x] **S2 · Tablas y estado en la base.**
  - Migración: las 3 tablas, `subscription_status` / `business_operational` y
    `is_platform_admin`.
  - Los negocios existentes quedan exentos; `create_business` crea la prueba de 14 días.
  - RLS: la dueña ve su suscripción y no la puede modificar.
  - Suite `supabase/tests/subscription-status.sql`.
  - RED: CI run 38301502577 (commit `a76cb2e`, solo la suite): `FALLÓ 0: falta subscription_status`.
  - GREEN: CI run 38301726713 (commit `2480bec`): las 20 suites SQL y `test` en verde.
  - Ruta: delegado (migración + suite). PR #55 (borrador) hacia `develop`.
  - Revisión del corte (develop..d0623ef): riesgo medio, `under_budget`, sin revisión nativa pendiente.
- [x] **S3 · Bloqueo en el servidor.**
  - `is_member` exige negocio operativo.
  - Las RPC públicas de reserva cortan cuando está bloqueado.
  - `my_subscription()`.
  - Suite `supabase/tests/subscription-block.sql`, y todas las suites existentes en verde.
  - Migración `20261012000002_subscription_block.sql`. `business_operational` es `security definer` (verificado en S2), así que no recursa. `member_select` no se toca.
  - RED: CI run 38429464681 (commit `8a80a01`, solo la suite): `FALLÓ 0: falta my_subscription`.
  - Primer intento de GREEN (run 38429755309, `0967d28`): `FALLÓ 5 [TRIAL]`. Era error de la suite: `public_business` devuelve una fila por servicio y la suite agrega uno en el paso 2. Se cuenta `distinct business_id` (`6827ff4`).
  - GREEN: CI run 38430076566 (`6827ff4`): todas las suites SQL y `test` en verde. Local: typecheck limpio, 572/572.
  - Ruta: delegado (migración + suite).
- [x] **S4 · RPC del administrador.**
  - `admin_list_businesses`, `admin_register_payment`, `admin_set_exempt`.
  - Solo un `platform_admin` puede llamarlas.
  - Suite `supabase/tests/subscription-admin.sql`.
  - Migración `20261012000003_subscription_admin.sql`.
  - Decisiones: quien no es administrador recibe el error "No autorizado" (42501), no una lista vacía, igual en las tres. `admin_register_payment` es atómica (bloquea la fila de suscripción con `for update`), exige monto > 0, vía válida, negocio existente y `paid_until` posterior al actual (nunca acorta), y devuelve el id del pago. `admin_set_exempt` devuelve el estado resultante. Los pagos solo entran por la RPC (la API sigue sin INSERT/UPDATE/DELETE).
  - Endurecimiento: se quita a `authenticated` el permiso de `subscription_status` y `business_operational` (la fuga anotada en S2). Todos sus llamadores son `security definer`; la dueña sigue usando `my_subscription()`. La suite lo comprueba (aserción 7).
  - RED: CI run 38430395418 (`1da884a`, solo la suite): `FALLÓ 0: falta admin_list_businesses`.
  - Primer intento de GREEN (run 38430648294, `7d2a447`): `permission denied for function subscription_status`. Era error de la suite: llamaba a `subscription_status` como `authenticated`, justo lo que el REVOKE prohíbe. Ahora usa el estado que devuelve `admin_set_exempt` (`22f452b`).
  - GREEN: CI run 38431057224 (`22f452b`): todas las suites SQL (S2 y S3 incluidas, con el REVOKE) y `test` en verde. PR 3 = #58, apilado sobre #57.
  - Revisión del tramo `origin/develop..22f452b` (S1–S4): riesgo medio (`executable_change`), `under_budget`, 2.246 líneas; sin revisión nativa obligatoria.
  - Local: `npm run typecheck` limpio; `npm run test:run` verde 572/572 en 34 archivos. Las 22 suites SQL: sin ejecutar.
  - Ruta: delegado (migración + suite).
- [x] **S5 · Aviso y pantalla de bloqueo (dueña).**
  - Aviso en prueba o gracia con los días restantes; pantalla de bloqueo con cómo pagar. Lee `my_subscription()`.
  - Archivos: `src/lib/domain/subscriptionView.ts` (+ test; `parseMySubscription` y `subscriptionNotice`), `src/lib/subscription/subscriptionApi.ts` (+ test), `useSubscriptionState.ts`, `paymentInstructions.ts`, `src/components/SubscriptionNotice.tsx`, `BlockedScreen.tsx`, y `src/App.tsx` (`SubscriptionGate`).
  - Decisiones: el estado se lee **antes** de montar el store (con el negocio bloqueado el servidor ya no deja leer datos). **Falla abierto**: si `my_subscription()` falla o no se entiende, no se bloquea y se deja `console.error`; el bloqueo real es del servidor. ACTIVE y EXEMPT no muestran nada.
  - **Pendiente de producto:** las instrucciones de pago (banco, cuenta, contacto) no están decididas. Es un marcador en una sola constante, `PAYMENT_INSTRUCTIONS` en `src/lib/subscription/paymentInstructions.ts`.
  - RED: `subscriptionView.test.ts` fallaba al no existir el módulo (`Failed to load url ./subscriptionView`); `subscriptionApi.test.ts`, igual con `./subscriptionApi`. Commit RED `28aca0f`.
  - GREEN: `subscriptionView.test.ts` 11/11 y `subscriptionApi.test.ts` 12/12.
  - Local: `npm run typecheck` limpio; `npm run test:run` verde 613/613 en 37 archivos; `npm run build` ok. Sin tests de componentes (el proyecto no tiene testing-library); la pantalla no se ha visto en un dispositivo real.
  - Ruta: delegado (varios componentes y el store).
- [x] **S6 · Panel de administración.**
  - Lista de negocios con su estado, "Registrar pago" (monto en RD$, vía, nota, pagado hasta) y quitar o poner la exención. Visible solo si `is_platform_admin()`.
  - Archivos: `src/lib/domain/subscriptionAdmin.ts` (+ test; mapeo, etiquetas, `parseAmountToCents` y `validatePaymentForm`), tipos en `types.ts`, `src/components/admin/AdminPanel.tsx` (contenedor), `AdminBusinessCard.tsx` y `PaymentForm.tsx` (presentacionales), botón "Administrar" en `App.tsx`.
  - Decisiones: el monto se convierte a centavos con enteros en el dominio; `paid_until` se envía como el final del día elegido en hora de RD (-04:00, sin horario de verano) y se compara como instante, igual que el servidor. El error del servidor se muestra tal cual. Si `is_platform_admin()` falla, el panel queda oculto.
  - RED: `subscriptionAdmin.test.ts` fallaba al no existir el módulo (`Failed to load url ./subscriptionAdmin`). Commit RED `923f753`; el RED de la capa de datos es `3a3383c`.
  - GREEN: `subscriptionAdmin.test.ts` 18/18.
  - Ruta: delegado (varios componentes y el store).

Ruta por tarea: S1 inline (un archivo y su test); S2–S4 delegado (migración + suite);
S5–S6 delegado (varios componentes y el store).

## Entrega

- Rama de trabajo `feat/saas-subscriptions`, saliendo de `develop`.
- Previsión: unas 1.200 líneas de autor, por encima de las ~400. Estrategia
  `ask-on-risk`; cadena elegida (2026-10-12): **PR apilados hacia `develop`**.
- Cortes previstos: PR 1 = S1 + S2; PR 2 = S3; PR 3 = S4; PR 4 = S5 + S6.

## TDD

Modo estricto activado (fuente: CLAUDE.md global del usuario, "Strict TDD Mode: enabled").

- Runners: `npm run test:run` (vitest) para el dominio; las suites SQL corren con `psql`
  contra `supabase db start` local (igual que el job `sql-regression` del CI).
- Cada tarea muestra primero el RED observado.

## Progreso

- 2026-10-12: decisiones tomadas, código mapeado y documento creado.
- 2026-10-12: S1 hecho.
- 2026-10-12: S2 hecho, verificado en CI. PR 1 = #55. Siguiente: S3.
- 2026-10-13: S3 escrito (migración + suite); sin verificación SQL local. Siguiente: CI de S3 y luego S4.
- 2026-10-13: S3 verificado en CI (RED y GREEN). PR 2 = #57, apilado sobre #55.
- 2026-10-13: S4 escrito (migración + suite, más el REVOKE de las funciones de estado); sin verificación SQL local. Siguiente: CI de S4 y luego S5.
- 2026-10-13: S4 verificado en CI (RED y GREEN). Siguiente: S5 + S6 (PR 4).
- 2026-10-13: S5 y S6 hechos en `feat/saas-subscriptions-ui` (PR 4, sin abrir). Pendiente de producto: texto de cómo pagar (`PAYMENT_INSTRUCTIONS`). Sin verificar en CI ni en dispositivo real.
- 2026-10-13: S5 + S6 en CI verde (run 38432032812). PR 4 = #59, apilado sobre #58. Revisión del tramo `origin/develop..7964cbc` (S1–S6): riesgo medio, `under_budget`, 3.253 líneas; sin revisión nativa obligatoria. Pendiente: instrucciones de pago (decisión del producto) y prueba en un teléfono real.
