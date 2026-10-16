# Inicio guiado

> Documento vivo de ODD. Espejo en Engram: `odd/guided-onboarding/tasks`.
> Locator: `odd/tasks/guided-onboarding.md`

## Objetivo

Que una dueña nueva pase de "no tengo cuenta" a "mi negocio está listo para recibir
citas" en un flujo fluido y profesional, sin salir confundida ni caer en una agenda vacía.

## Problema

Hoy el flujo es Login → Onboarding (solo nombre + color) → `window.location.reload()` →
agenda vacía. Observado:

- Errores crudos del backend en inglés (`setError(err.message)` en `Login.tsx` y `Onboarding.tsx`).
- Tras registrarse hay que volver a iniciar sesión a mano; sin confirmar contraseña ni regla mínima.
- No se menciona la prueba gratis de 14 días.
- Recarga brusca y aterrizaje sin próximos pasos.
- "Unirme con un código" pesa igual que "Crear mi negocio", sin explicar.
- Cargas en texto plano y `window.alert` en `App.tsx`.

## Decisiones tomadas

| # | Decisión | Fecha |
|---|---|---|
| D1 | Alcance: **asistente guiado** (nombre y color → horarios → primer servicio → listo), pasos opcionales saltables, sin recarga. Elección del usuario. | 2026-10-16 |
| D2 | La creación del negocio sigue usando la RPC `create_business` existente; no se toca el esquema. | 2026-10-16 |

## Alcance autorizado

Login/registro, Onboarding, transición al app, estados de carga, estado vacío de la agenda.
Sin cambios de esquema SQL.

## Invariantes que aplican

- INV. 1 — toda escritura de horarios/servicios va por la capa existente que filtra `business_id`.
- INV. 4 — textos en lenguaje de la dueña; nada de tecnicismos ni inglés en UI.
- INV. 5 — la lógica (traducción de errores, validación, pasos del asistente) vive en funciones puras testeadas.

## Modo TDD

Activado (fuente: `~/.claude/CLAUDE.md` "Strict TDD Mode: enabled"). Runner: `npm run test:run` (vitest).
Checks: `npm run test:run`, `npm run typecheck`.

## Estrategia de entrega

`ask-on-risk`. Previsión: ~700–900 líneas. Cadena elegida por el usuario (2026-10-16): **`stacked-to-main`** (destino `develop`).

## Tareas

- [x] **O1** Dominio puro: traducción de errores de auth/RPC a español, validación de registro (contraseña mínima + confirmación) y de nombre del negocio, modelo de pasos del asistente. Con tests.
- [x] **O2** Login/registro: cabecera con propuesta de valor, confirmar contraseña, errores traducidos, entrada directa tras registrarse cuando hay sesión, mención de la prueba gratis.
- [x] **O3** Asistente: paso 1 nombre y color (sin recarga), paso 2 horarios, paso 3 primer servicio, paso 4 listo; indicador de progreso, saltar pasos opcionales. "Unirme con un código" como vía secundaria explicada.
- [x] **O4** Pulido: carga con marca, sin `window.alert`, estado vacío de la agenda con próximos pasos.

## Progreso

| Tarea | Ruta | Commit | Checks | Revisión |
|---|---|---|---|---|
| O1 | Delegada (escritor único, preparación + escritura) | `070b243` | RED observado (módulos inexistentes) → GREEN; `test:run` 640/640, `typecheck` 0 | medium, `under_budget` (293 líneas) — pendiente en el tramo |
| O2 | Delegada (2 archivos no triviales) | `52dc65c` | `test:run` 642/642, `typecheck` 0, `build` ok (verificado por el orquestador; el escritor no devolvió informe) | high (auth) → consentida → 4 lentes → **aprobada** y confirmada (`review-c0153f1237ebd745`), tramo O1+O2 |
| O2.1 | Inline (2 archivos mecánicos, hallazgos no bloqueantes de la revisión) | `522cdb9` | RED (test de contraseña débil) → GREEN; `test:run` 642/642, `typecheck` 0 | pendiente en el siguiente tramo |

| O3 | Delegada (5 archivos no triviales) | `c8db2e3`, `a38fb15` | RED (`onboardingSetup` inexistente) → GREEN 12 tests; `test:run` 654/654, `typecheck` 0, `build` ok. UI sin prueba en navegador ni tests de componentes. | medium, `under_budget` (743 líneas según la herramienta, que no marcó el tramo como vencido) — pendiente |
| O4 | Delegada (6 archivos) | `5932f3b` | RED (5 tests, `pendingSetupSteps` inexistente) → GREEN; `test:run` 659/659, `typecheck` 0, `build` ok. Sin prueba en navegador. | medium, `under_budget` (889 líneas acumuladas desde `52dc65c` según la herramienta) — sin revisión vencida |

Decisiones de O3: nueva acción `createService` (una sola inserción, evita la carrera `addService`+`updateService`); horarios por preset (L–V / L–S, 09:00–18:00) en vez de reutilizar `BookingSettings`; `wizardActive` solo en memoria; el enlace público se comparte solo si existe el slug y se avisa que el portal se abre en Mi negocio.

Hallazgos no bloqueantes de la revisión: se atendieron `busy` bloqueado ante excepción y el aviso de contraseña débil que prometía de más (O2.1). Quedan como seguimiento: política de contraseña solo en cliente (la regla real vive en la config de Auth de Supabase), y sin tests de componentes (no hay `@testing-library` en el proyecto).

Tramos (stacked-to-main): **Tramo 1** = `070b243`, `52dc65c` (revisado y aprobado). **Tramo 2** = `522cdb9`, `c8db2e3`, `a38fb15` (asistente). **Tramo 3** = `5932f3b` (pulido). Límite revisado: `52dc65c`; tramos 2–3 evaluados `medium/under_budget` por la herramienta, sin revisión.

## Próximo paso

Todas las tareas cerradas. Pendiente del usuario: probar el flujo en navegador (no verificado en runtime) y decidir push/PRs encadenados a `develop`. Seguimientos: tests de componentes, guardado de horarios no esperado (fire-and-forget), ¿abrir el portal de reservas desde el asistente?
