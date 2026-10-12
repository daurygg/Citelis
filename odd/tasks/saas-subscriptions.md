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
- [ ] **S3 · Bloqueo en el servidor.**
  - `is_member` exige negocio operativo.
  - Las RPC públicas de reserva cortan cuando está bloqueado.
  - `my_subscription()`.
  - Suite `supabase/tests/subscription-block.sql`, y todas las suites existentes en verde.
- [ ] **S4 · RPC del administrador.**
  - `admin_list_businesses`, `admin_register_payment`, `admin_set_exempt`.
  - Solo un `platform_admin` puede llamarlas.
  - Suite `supabase/tests/subscription-admin.sql`.
- [ ] **S5 · Aviso y pantalla de bloqueo (dueña).**
  - Aviso en prueba o gracia con los días restantes.
  - Pantalla de bloqueo con cómo pagar.
  - Lee `my_subscription()`.
- [ ] **S6 · Panel de administración.**
  - Lista de negocios con su estado.
  - Registrar pago (monto, vía, nota, pagado hasta).
  - Quitar o poner la exención.
  - Visible solo si `is_platform_admin()`.

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
