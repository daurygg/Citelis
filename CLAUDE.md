# CLAUDE.md — Reglas del proyecto Citelis

> Estas son las **INVARIANTES** del proyecto (copiadas de `PLAN.md` §1). Aplican a **toda**
> generación de código. Si una tarea parece pedir violar una de estas reglas, **detente y pregunta**.

## Invariantes (no se negocian)

1. **Aislamiento por tenant.** Toda tabla y toda consulta incluye y filtra por `negocio_id`.
   Ninguna lectura/escritura de datos de negocio puede omitir este filtro. En MVP siempre vale `1`,
   pero la columna y el filtro existen desde el día uno.

2. **Inmutabilidad del historial.** `precio_cobrado`, `costo_real` y `ganancia` de una cita se
   **congelan en el momento de COMPLETAR**, nunca al agendar. Una cita `COMPLETADA` es un hecho
   histórico inmutable (append-only). Cambiar precios o insumos afecta solo citas futuras/pendientes,
   jamás retroactivamente.

3. **Servicios y productos NO se mezclan.** Lógicas distintas (tiempo vs. inventario físico).
   No crear tablas, tipos ni componentes que mezclen ambas. El MVP solo toca servicios.

4. **Lenguaje de la dueña, no técnico.** En la **UI** (solo textos visibles) nunca se piden unidades
   técnicas (ml, gramos). Se pregunta "¿cuánto pagaste?" y "¿para cuántas clientas alcanza?". El sistema
   hace la matemática. (Esto NO aplica al código: ver convenciones de idioma abajo.)

5. **Separación cálculo / presentación.** Las fórmulas y transiciones de estado viven en una capa de
   lógica pura (funciones sin efectos secundarios, testeables). La UI solo llama a esa capa.

6. **El costo del servicio es un cache.** `costo_insumo` se almacena memoizado y solo se recalcula
   cuando la dueña edita un insumo del servicio. La operación diaria nunca recalcula insumos.

7. **Estado de cita = máquina de estados estricta.** Las únicas transiciones válidas son las de
   `PLAN.md` §3.3. Cualquier otra transición es un error.

## Convenciones de código

- **Idioma:** TODO el código en **inglés** (variables, tipos, interfaces, funciones, archivos).
  **Solo comentarios y mensajes de commit en español.** El contrato del PLAN se traduce a inglés:
  `Negocio`→`Business`, `Servicio`→`Service`, `Insumo`→`Supply`, `Cita`→`Appointment`,
  `negocio_id`→`business_id`, etc. (Estados: `PENDING`/`IN_PROGRESS`/`COMPLETED`/`CANCELED`.)
- **TypeScript estricto.** Tipos del dominio en un solo lugar: `src/lib/domain/types.ts`.
- **Lógica pura separada de componentes.** Nada de cálculos de dinero dentro de JSX.
- **Dinero en centavos enteros** internamente (evita errores de coma flotante). Se formatea a moneda
  solo en la capa de presentación.
- **Campos en `snake_case`** (mapean directo a columnas Postgres en la Fase 4); funciones en `camelCase`;
  tipos/interfaces en `PascalCase`.

## Estructura objetivo

```
src/
  lib/
    domain/          ← lógica pura, CERO dependencias de React
      types.ts       ← contratos de datos
      costs.ts       ← fórmulas de costo/ganancia (puras)
      appointments.ts← máquina de estados de citas (pura)
      reports.ts     ← agregaciones (puras)
    store/           ← estado en memoria (Fases 1-3) / data layer (Fase 4)
  components/        ← UI por pantalla
```

## Entorno de trabajo

- **Node y npm están disponibles localmente.** Si falta `node_modules`, corre `npm install` una vez.
  El loop de tests se cierra en local: `npm run test:run` (vitest) y `npm run typecheck` (tsc --noEmit).
- GitHub Actions (`.github/workflows/ci.yml`) vuelve a correr los tests en cada push; es la red de
  seguridad, no el único sitio donde se verifica. Despliegue en Vercel.
- Trabajo por **slices verticales** (ver `PLAN.md` §4). No empezar un slice sin cumplir el DoD del anterior.

## Ramas

Tres ramas de larga duración. **A `main` nunca se commitea directo**: es producción.

| Rama | Qué es | Recibe |
|---|---|---|
| `main` | Producción. Lo que está desplegado. | Merges desde `develop` (releases) y desde `maintenance` (hotfixes). |
| `develop` | Integración. Donde se prueba todo junto. | PRs de las ramas de trabajo. **Destino por defecto de un PR.** |
| `maintenance` | Arreglos sobre lo que ya está en producción. | PRs de `fix/*` que no pueden esperar al próximo release. |

Ramas de trabajo: `feat/*`, `fix/*`, `chore/*`, `docs/*`. Salen de `develop` (o de
`maintenance` si es un arreglo urgente de producción) y vuelven por PR, nunca por push
directo.

Un hotfix que entra por `maintenance` hay que devolverlo también a `develop`, o el
próximo release lo pisa.

## MCP de Supabase

`.mcp.json` declara **dos** servidores contra `https://mcp.supabase.com/mcp`, que
autentican por OAuth en el navegador. **No hace falta ningún token en disco.**

| Servidor | Modo | Para qué |
|---|---|---|
| `supabase` | solo lectura | Consultar esquema, datos y logs. El de diario. |
| `supabase-write` | escritura | Aplicar migraciones. Solo cuando toca. |

Son dos porque el peligro tiene que verse: las herramientas del segundo se llaman
`mcp__supabase-write__*`, así que no se puede escribir sin que quede a la vista en el
nombre de la operación.

Antes esto era una sola entrada con `read_only` en una variable de entorno. No
funcionaba: Claude Code deriva la identidad del servidor de la URL resuelta, así que
cambiar la variable creaba un servidor distinto y obligaba a reautenticar cada vez.

Primera vez, para cada uno: `/mcp` → eliges el servidor → `Authenticate` → autorizas en
el navegador. La credencial queda en `~/.claude/.credentials.json` y persiste entre
sesiones.

Una sola variable de entorno, para acotar el alcance a un proyecto:

```bash
export SUPABASE_PROJECT_REF=...   # Settings → General → Reference ID
```

Sin `project_ref` los servidores tendrían acceso a **todos** tus proyectos. Y como la
identidad depende de la URL, cambiar de proyecto obliga a autorizar de nuevo: esa
fricción es deliberada.
