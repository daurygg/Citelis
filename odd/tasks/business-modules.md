# Módulos por negocio (Tienda y Equipo)

Objetivo: el administrador de la plataforma activa o desactiva módulos por negocio.
Rama: `feat/business-modules` → PR a `develop`, un solo PR con commits por unidad. Tests: vitest (`npm run test:run`), `npm run typecheck`; SQL en CI (`sql-regression`, sin Docker local).

## Specs

- **S1** "Desde un usuario admin poder administrar los modulos. Por ejemplo no todo el mundo usa el modulo tienda. En ese caso quisiera modificarlo para activaselo a los usuario o desacartivarselo ya sea a peticion o po un precio."
- **S2** Módulos que se activan/desactivan: "Tienda (Ropa), Equipo". Agenda, Servicios, Créditos y Reporte de servicios siempre activos.
- **S3** Precio: "Sin precio en el sistema" (el admin solo activa/desactiva; el cobro se acuerda por fuera).
- **S4** Por defecto: "Existentes igual, nuevos sin módulos" — los negocios existentes conservan Tienda y Equipo; los nuevos empiezan sin ninguno.
- **S5** Apagado = desaparece de la app de ese negocio; sus datos se conservan y vuelven al activarlo. (Confirmado al usuario.)
- **S6** Solo el admin cambia los módulos; el dueño o la dueña no puede activárselos (sin permiso de UPDATE en esas columnas; RPC con `is_platform_admin`). El servidor también hace cumplir el apagado (RLS/trigger), no solo la UI. (Decisión técnica.)
- **S7** Compatibilidad: si el front nuevo llega antes que la migración (columnas ausentes), se comporta como hoy (módulos visibles).

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T1 | S2, S5, S7 | inline | hecho | 040ef41 |
| T2 | S2, S4, S5, S6 | inline | hecho (SQL pendiente de CI) | b411575 |
| T3 | S2, S5 | inline | hecho | 4faa637 |
| T4 | S1, S3, S6 | inline | hecho | 0506861 |

- T1 dominio: `businessModules(business)` puro (+ tests), tipos.
- T2 migración: columnas `store_enabled`/`team_enabled` (existentes true, nuevos false), RLS de `product`/`sale`/`employee`, trigger de `appointment_service.employee_id`, `admin_set_module`, `admin_list_businesses` con módulos; suite SQL y ajuste de suites que usan equipo.
- T3 UI del negocio: ocultar Ropa y Equipo según módulos.
- T4 UI admin: interruptores por negocio.

Riesgo: item 1 (columnas nuevas con backfill), item 2 (RLS y funciones `security definer`), item 3 (`admin_list_businesses` cambia de forma).

## Log

- L1 (2026-11-05) Pedido: "Bien. Quiero poder hacer esto... Desde un usuario admin poder administrar los modulos. Por ejemplo no todo el mundo usa el modulo tienda. En ese caso quisiera modificarlo para activaselo a los usuario o desacartivarselo ya sea a peticion o po un precio."
- L2 Respuestas: módulos "Tienda (Ropa), Equipo"; precio "Sin precio en el sistema"; por defecto "Existentes igual, nuevos sin módulos (Recomendado)".
- L3 Mapa: Tienda y Equipo se escriben directo por PostgREST bajo políticas FOR ALL `is_member`; el empleado viaja en `p_lines` de `complete_appointment`. Se gatea con políticas propias de cada tabla y un trigger, sin tocar `is_member` (lo usan ~21 políticas).
- L4 Verificación local: typecheck OK; `npm run test:run` 743 OK (RED observado en modules y subscriptionAdmin). Interruptores del panel revisados en Chromium. Suites `business-modules.sql`, `employees.sql` y `public-receipt.sql` (estas dos activan el Equipo en sus negocios de prueba) solo corren en CI.
- L5 Verificador independiente: sin blockers. Aplicada la advertencia de rendimiento (`(select business_module_on(...))` en las políticas). Pendiente para el usuario: revisar en producción que no haya políticas extra en product/sale/employee.
