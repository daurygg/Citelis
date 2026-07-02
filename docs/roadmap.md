# Roadmap — funciones planificadas (aún NO construidas)

> Ideas acordadas para más adelante. No romper invariantes del PLAN/CLAUDE.md.
> Lo ya construido (Slices 0–4.5) no se documenta aquí; ver git tags
> `mvp-en-memoria`, `mvp-realista`, `mvp-persistente`.

---

## 1. Asistente de configuración inicial (onboarding interactivo)

**Objetivo:** cuando el dueño se registra por **primera vez** y elige "Crear mi
negocio", en vez de caer en una app vacía, el sistema lo guía con preguntas paso a
paso para dejar su negocio configurado. En lenguaje de la dueña (INVARIANTE 4).

**Cuándo se dispara:** solo en el flujo "Crear mi negocio" del onboarding
(`create_business`). NO para quien se une con código (ese hereda el negocio ya
configurado).

**Pasos propuestos (todos salteables; puede terminar antes y configurar luego en
la pantalla Servicios):**
1. **Nombre del negocio** (ya se pide al crear).
2. **Tus servicios:** agregar algunos con nombre, precio y duración; marcar si el
   precio es variable (trenzas, maquillaje…).
3. **Materiales por servicio (opcional):** "¿qué usas?", "¿cuánto pagaste?",
   "¿para cuántas clientas alcanza?" → calcula el costo. Puede omitirse.
4. **Gastos fijos mensuales (opcional):** luz, agua, transporte…
5. **Resumen y entrar.**

**Notas de implementación:**
- Reutiliza métodos del store existentes (`addService`, `addSupplyToService`,
  `addFixedExpense`) → es sobre todo UI/flujo sobre capacidades ya construidas.
- Persiste vía el data layer actual (Supabase).
- Barra de progreso; cada paso con botón "Omitir" y "Más tarde".
- Estado "onboarding completado" (p. ej. un flag en `business` o simplemente
  detectar si ya hay servicios) para no volver a mostrarlo.

---

## 2. Módulo de venta de ropa (separado de servicios)

**Objetivo:** registrar ventas de ropa y saber si ese negocio funciona, SIN
mezclarlo con servicios (INVARIANTE 3: lógicas distintas).

**Decisiones ya tomadas:**
- **Después** de Supabase (es aditivo; no obliga a rehacer nada). ✅ ya estamos ahí.
- **Modelo simple:** producto (nombre, precio de venta, costo) + registrar ventas
  → ganancia de ropa. Sin stock por talla/color por ahora.
- **Segregado:** dominio propio (`src/lib/domain/inventory/`), su store/tablas,
  su pantalla y su **reporte aparte**. En la UI, un switch de modo
  "Servicios / Ropa". Comparte solo el `business_id`.

**Pendiente de confirmar antes de construir:** ¿registrar solo la venta, o también
cuántas unidades quedan (stock básico)? (Se acordó "simple", confirmar el mínimo.)

---

## 3. Otras ideas sueltas (sin comprometer)

- Reactivar confirmación de correo en Auth para producción.
- Flujo de invitación más rico (roles dueño/ayudante, revocar acceso).
- Indicadores en la agenda (días con citas), vista de semana.
- Depósitos/adelantos y método de pago en la cita (la dueña los mencionó).
