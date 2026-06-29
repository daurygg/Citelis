# PLAN.md — Sistema de gestión para negocio de servicios de belleza

> **Cómo usar este archivo:** ponlo en la raíz del repo. Sirve tanto para **Cursor** como para **Claude Code** — solo cambian los nombres de archivo de reglas y la forma de invocar el contexto. Ver la tabla de equivalencias en §0.1. El bloque **REGLAS DEL PROYECTO** (§1) debe copiarse al archivo de reglas de tu herramienta para que aplique a toda generación automáticamente.

## 0.1 EQUIVALENCIAS POR HERRAMIENTA

| Concepto | Cursor | Claude Code |
|---|---|---|
| Archivo de reglas globales (copiar §1 aquí) | `.cursorrules` | `CLAUDE.md` (se lee solo en cada sesión) |
| Referenciar este plan en un prompt | `@PLAN.md` | basta con nombrarlo: *"lee PLAN.md"* (ya tiene acceso al filesystem) |
| Quién corre los tests | normalmente tú, en el editor | la propia herramienta puede correrlos y leer la salida |
| Cerrar el loop de un slice | pídele el código, luego corre tests tú | *"implementa el Slice X y corre los tests hasta que pasen"* |

**Nota:** el resto del documento (contrato de datos, invariantes, slices y DoD) es idéntico para ambas. Solo cambia la mecánica de invocación de arriba.

---

## 0. RESUMEN EJECUTIVO

Sistema multi-tenant para un negocio de belleza que ofrece **servicios** (micropigmentación, trenzas, pestañas). Resuelve dos problemas, en orden de prioridad:

1. **Agendar citas** de servicios.
2. **Conocer la ganancia real** por servicio (cuánto cobra − cuánto invierte).

La venta de ropa queda **fuera de alcance** (fase futura, lógica separada). El sistema debe ser usable por una dueña sin conocimientos técnicos: la complejidad vive en la configuración (una vez); la operación diaria es de uno o pocos toques.

**Alcance de este plan:** Fases 1–4 (MVP funcional en memoria + persistencia real con DB/auth). Las Fases 1–3 corren con estado en memoria; la Fase 4 migra a Supabase y activa auth/multi-tenant.

---

## 1. REGLAS DEL PROYECTO (INVARIANTES — copiar al archivo de reglas: `.cursorrules` en Cursor, `CLAUDE.md` en Claude Code)

Estas reglas NO se negocian y aplican a **toda** generación de código. Si una tarea parece pedir violar una de estas reglas, detente y pregunta.

1. **Aislamiento por tenant.** Toda tabla y toda consulta incluye y filtra por `negocio_id`. Ninguna lectura/escritura de datos de negocio puede omitir este filtro. En MVP siempre vale `1`, pero la columna y el filtro existen desde el día uno.

2. **Inmutabilidad del historial.** `precio_cobrado`, `costo_real` y `ganancia` de una cita se **congelan en el momento de COMPLETAR**, nunca al agendar. Una cita `COMPLETADA` es un hecho histórico inmutable (modelo append-only, como un commit de git). Cambiar precios o insumos afecta solo citas futuras/pendientes, jamás retroactivamente.

3. **Servicios y productos NO se mezclan.** Son lógicas distintas (tiempo vs. inventario físico). No crear tablas, tipos ni componentes que mezclen ambas. El MVP solo toca servicios.

4. **Lenguaje de la dueña, no técnico.** En la UI nunca se piden unidades técnicas (ml, gramos). Se pregunta "¿cuánto pagaste?" y "¿para cuántas clientas alcanza?". El sistema hace la matemática.

5. **Separación cálculo / presentación.** Las fórmulas y transiciones de estado viven en una capa de lógica pura (funciones sin efectos secundarios, fácilmente testeables). La UI solo llama a esa capa y muestra resultados.

6. **El costo del servicio es un cache.** `costo_insumo` se almacena memoizado y solo se recalcula cuando la dueña edita un insumo del servicio. La operación diaria nunca recalcula insumos.

7. **Estado de cita = máquina de estados estricta.** Las únicas transiciones válidas son las definidas en §3.3. Cualquier otra transición es un error.

---

## 2. STACK Y CONVENCIONES

| Capa | MVP (Fases 1–3) | Producción (Fase 4) |
|---|---|---|
| Frontend | React + Tailwind | igual |
| Estado | en memoria (React state / context o Zustand) | igual + sincronía con DB |
| Persistencia | ninguna / localStorage opcional | Supabase (Postgres + Auth + RLS) |
| Lógica de negocio | módulo TS puro (`/lib/domain`) | igual, reutilizado sin cambios |

**Convenciones de código**
- TypeScript estricto. Tipos del dominio en un solo lugar (`/lib/domain/types.ts`).
- Lógica pura separada de componentes. Nada de cálculos de dinero dentro de JSX.
- Dinero en **centavos enteros** internamente (evita errores de coma flotante); se formatea a moneda solo en la capa de presentación.
- Nombres de dominio en español (es el lenguaje del negocio): `Servicio`, `Insumo`, `Cita`, `Negocio`.

**Estructura de carpetas objetivo**
```
src/
  lib/
    domain/
      types.ts        ← contratos de datos (§3)
      costos.ts       ← fórmulas de costo/ganancia (puras)
      citas.ts        ← máquina de estados de citas (pura)
      reportes.ts     ← agregaciones (puras)
    store/            ← estado en memoria (Fase 1-3) / data layer (Fase 4)
  components/         ← UI por pantalla
  pages/ ó app/       ← rutas
```

---

## 3. CONTRATO DE DATOS (fuente de verdad — no inventar otras formas)

### 3.1 Entidades

```ts
type EstadoCita = 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADA' | 'CANCELADA';

interface Negocio {
  id: number;          // el tenant. MVP: siempre 1
  nombre: string;
  plan: string;
}

interface Insumo {
  id: number;
  servicio_id: number;
  nombre: string;
  precio_compra: number;   // centavos. Lo que la dueña pagó por la "tanda"
  rendimiento: number;     // para cuántas clientas alcanza esa tanda (>0)
}

interface Servicio {
  id: number;
  negocio_id: number;      // INVARIANTE 1
  nombre: string;
  precio: number;          // centavos. Precio de venta al cliente
  costo_insumo: number;    // centavos. CACHE: suma de costos unitarios (INVARIANTE 6)
  costo_override: number | null; // si no es null, reemplaza a costo_insumo
  duracion_min: number;
}

interface Cita {
  id: number;
  negocio_id: number;      // INVARIANTE 1
  servicio_id: number;
  cliente: string;
  fecha_hora: string;      // ISO 8601
  estado: EstadoCita;
  // CONGELADOS al COMPLETAR (INVARIANTE 2). null mientras no esté completada:
  precio_cobrado: number | null;
  costo_real: number | null;
  ganancia: number | null;
}
```

### 3.2 Fórmulas (en `/lib/domain/costos.ts`, funciones puras)

```
costo_unitario_insumo = precio_compra ÷ rendimiento
costo_insumo_servicio = Σ costo_unitario de todos sus insumos
costo_efectivo_servicio = costo_override ?? costo_insumo   // override gana si existe
ganancia_cita = precio_cobrado − costo_real                // solo al completar
```

### 3.3 Máquina de estados de citas (en `/lib/domain/citas.ts`)

```
PENDIENTE  → EN_CURSO     (opcional, "empezó la atención")
PENDIENTE  → CANCELADA
EN_CURSO   → COMPLETADA   ← AQUÍ se congelan precio_cobrado, costo_real, ganancia
PENDIENTE  → COMPLETADA   (atajo permitido: completar directo)
```
Cualquier otra transición lanza error. Solo `COMPLETADA` cuenta para reportes.

**`completarCita(cita, servicio, overridePrecio?)`** debe:
1. Validar transición.
2. Tomar `precio_cobrado = overridePrecio ?? servicio.precio` (snapshot del momento).
3. Tomar `costo_real = costo_efectivo_servicio(servicio)` (snapshot del momento).
4. Calcular `ganancia = precio_cobrado − costo_real`.
5. Devolver **una nueva cita** (inmutable) con estado `COMPLETADA` y los tres valores congelados.

---

## 4. PLAN POR SLICES

> Cada slice es un *vertical slice*: funciona de punta a punta y termina en algo demostrable. Constrúyelos en orden. No empieces el siguiente hasta cumplir el **Definition of Done (DoD)** del actual.

### SLICE 0 — Cimientos del dominio
**Objetivo:** la capa de lógica pura, antes de cualquier UI.
**Construir:**
- `types.ts` con todo el §3.1.
- `costos.ts` con las fórmulas (§3.2), incluyendo manejo de `rendimiento = 0` (no dividir por cero).
- `citas.ts` con la máquina de estados y `completarCita` (§3.3).
- `reportes.ts` con `resumenSemana(citas, desde, hasta)` que filtra `COMPLETADA` y suma.

**DoD:**
- [ ] Tests unitarios: `costo_unitario = precio_compra/rendimiento`; suma de insumos correcta; override gana sobre cache.
- [ ] Test: `completarCita` congela los 3 valores y no muta la cita original.
- [ ] Test: transición inválida (ej. `COMPLETADA → PENDIENTE`) lanza error.
- [ ] Test: cambiar `servicio.precio` DESPUÉS de completar NO altera la `ganancia` ya congelada.
- [ ] Cero dependencias de React en esta carpeta.

---

### SLICE 1 — Núcleo de citas (Fase 1)
**Objetivo:** agendar, ver agenda del día, completar, ver ganancia. Con un servicio "semilla" de costo fijo (la calculadora viene en el Slice 2).
**Construir:**
- Store en memoria con `negocio_id = 1` y 1–2 servicios precargados.
- **Agendar** (máx. 3 toques): elegir cliente, servicio (dropdown), fecha/hora. NO se pide precio ni costo.
- **Agenda del día** como pantalla de inicio: citas ordenadas por hora, color por estado, ganancia *proyectada* del día (suma de ganancias potenciales de las pendientes — claramente etiquetada como proyección, no realizada).
- **Completar/cobrar** (1 toque): muestra precio, costo y ganancia calculada; botón "Completar"; opción de editar precio (override para descuentos).

**DoD:**
- [ ] Agendar una cita la deja en `PENDIENTE` con los 3 campos de dinero en `null`.
- [ ] Completar congela los valores y la ganancia coincide con la fórmula.
- [ ] Editar el precio del servicio después de completar NO cambia la cita completada.
- [ ] Toda lectura del store filtra por `negocio_id`.
- [ ] Flujo agendar→completar usable sin tocar el dato técnico.

---

### SLICE 2 — Calculadora "por tandas" (Fase 2)
**Objetivo:** que la dueña configure el `costo_insumo` real de cada servicio en su propio lenguaje.
**Construir:**
- Pantalla de configuración de servicio: nombre, precio de venta, duración.
- Lista de insumos. Por cada insumo se pregunta **"¿cuánto pagaste?"** y **"¿para cuántas clientas alcanza?"** (nunca ml/gramos).
- Al agregar/editar/borrar un insumo → recalcular y **guardar** `costo_insumo` (cache, INVARIANTE 6).
- Campo de **override manual** opcional ("o escribe un costo estimado").
- Mostrar en vivo: costo total y margen (`precio − costo`).

**DoD:**
- [ ] Agregar insumo "$40, alcanza 8" produce costo unitario de $5.
- [ ] El `costo_insumo` solo se recalcula al tocar un insumo, no en cada render.
- [ ] El override, cuando existe, manda sobre el cache.
- [ ] Una cita completada DESPUÉS de editar insumos usa el costo nuevo; las ya completadas no cambian.

---

### SLICE 3 — Reporte de ganancias (Fase 3)
**Objetivo:** ingresos, costos, ganancia neta y servicio más rentable por semana.
**Construir:**
- Vista semanal que llama a `resumenSemana` (Slice 0).
- Mostrar: ingresos totales, costos totales, ganancia neta, servicio más rentable.
- Es solo lectura: agrega valores ya congelados de citas `COMPLETADA`. No recalcula nada.

**DoD:**
- [ ] Solo cuenta citas `COMPLETADA` dentro del rango.
- [ ] Las cifras cuadran con la suma manual de las citas del periodo.
- [ ] Un cambio de precio de servicio no altera reportes de semanas pasadas.
- [ ] Filtrado por `negocio_id`.

**🏁 Fin del MVP.** En este punto el sistema es demostrable de punta a punta en memoria.

---

### SLICE 4 — Persistencia real + Auth + Multi-tenant (Fase 4)
**Objetivo:** migrar de memoria a Supabase sin tocar la capa de dominio (Slice 0 se reutiliza intacto).
**Construir:**
- Esquema Postgres en Supabase con las 4 tablas, FKs y `negocio_id` en cada una.
- **Row Level Security (RLS):** políticas que solo permitan filas donde `negocio_id` = el negocio del usuario autenticado. Esto convierte la INVARIANTE 1 en una garantía a nivel de base de datos, no solo de aplicación.
- Auth de Supabase (email/password basta para empezar).
- Reemplazar el store en memoria por un data layer que llame a Supabase, manteniendo la misma interfaz que consumían los Slices 1–3 (para no reescribir UI).
- Migrar `negocio_id` de hardcoded `1` al id del tenant del usuario logueado.

**DoD:**
- [ ] Un usuario solo ve/edita datos de su `negocio_id` (verificado intentando leer datos de otro tenant → 0 filas).
- [ ] La capa de dominio (Slice 0) no cambió ni una línea.
- [ ] Las invariantes de inmutabilidad siguen cumpliéndose contra la DB real.
- [ ] Las pantallas de los Slices 1–3 funcionan igual con datos persistidos.

---

## 5. ORDEN DE TRABAJO RECOMENDADO

1. Pide a tu herramienta el **Slice 0** completo con sus tests. Verifica DoD antes de seguir — es el cimiento de todo.
2. Slices 1 → 2 → 3 en orden, validando cada DoD.
3. Antes del Slice 4, congela el MVP en una rama (`git tag mvp-en-memoria`).
4. Slice 4 al final, reutilizando el dominio.

**Sugerencia de prompts por slice (Cursor):** usa `@PLAN.md` para cargar el contexto.
> "Lee @PLAN.md. Implementa el SLICE 0 completo: types, costos, citas, reportes, con tests unitarios que cubran cada punto del DoD. Respeta las REGLAS DEL PROYECTO. No escribas UI todavía."

> "Lee @PLAN.md. Implementa el SLICE 1 sobre el dominio ya existente. No dupliques fórmulas: importa desde /lib/domain. Cumple el DoD."

**Sugerencia de prompts por slice (Claude Code):** aprovecha que cierra el loop de tests solo.
> "Lee PLAN.md. Implementa el SLICE 0 completo (types, costos, citas, reportes) con tests unitarios que cubran cada punto del DoD, y corre los tests hasta que todos pasen. Respeta las REGLAS DEL PROYECTO de CLAUDE.md. Sin UI todavía."

> "Lee PLAN.md. Implementa el SLICE 1 sobre el dominio existente, importando fórmulas desde /lib/domain sin duplicarlas. Verifica el DoD corriendo la app/tests antes de terminar."

---

## 6. FUERA DE ALCANCE (no construir aún)
- **Fase 5 — Módulo de ropa/inventario.** Lógica de inventario físico (tallas, colores, cantidades), separada de servicios. Documentar pero no construir.
- Notificaciones, pagos en línea, multi-usuario por negocio, app móvil nativa.
