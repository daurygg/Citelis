# El nombre del negocio en su enlace público

## Objetivo

Que el enlace que la dueña reparte por WhatsApp diga su nombre
(`/reservar/salon-rosa`) y no un id de base de datos (`/reservar/negocio-1001`).

## Problema

`updateBookingPolicy` (src/lib/store/StoreContext.tsx:592) genera el slug como
`negocio-${businessId}`. Es el único camino real: el `citelis` bonito que hay en
la base se sembró a mano. Evidencia en CitelisDev:

| Negocio | Slug | Portal |
|---|---|---|
| Citelis | `citelis` | abierto (sembrado a mano) |
| GGAUR4 | `negocio-1001` | cerrado (generado por el código) |

Además la fila de `booking_policy` no nace con el negocio: aparece la primera vez
que la dueña toca un ajuste. Hasta entonces no hay enlace que enseñar.

Choca con la INVARIANTE 4: lo que la dueña reparte a sus clientas es lenguaje
técnico, no el suyo.

## Por qué ahora

Decisión del usuario (2026-09-22): Citelis NO será un directorio donde las
clientas buscan negocios. El enlace es de la dueña y ella lo reparte. Siendo así,
el enlace ES su identidad comercial y tiene que verse como tal.

## Alcance

DENTRO:
- Derivar el slug del nombre al crear el negocio.
- Crear `booking_policy` junto con el negocio (cerrada), para que el enlace exista
  desde el minuto uno.

SACADO DEL ALCANCE DURANTE LA IMPLEMENTACIÓN:
- Renombrar los slugs auto-generados de portales que nunca se abrieron. Hacerlo
  en la migración exigiría reimplementar en SQL el quitado de acentos y la
  normalización que ya vive en `slugifyBusinessName`, y esa copia se separaría de
  la original en la primera corrección. Los negocios existentes conservan su slug;
  solo cambia cómo nacen los nuevos. Renombrar uno vivo mataría los enlaces que
  sus clientas ya guardaron, así que es decisión de la dueña, no de una migración.

FUERA (pasos 2 y 3 del plan, cada uno su propio cambio):
- La tarjeta de vista previa de WhatsApp (nombre y foto del negocio).
- El botón "Avisar a la clienta" con la cita y el calendario.
- Cambiar el slug después del alta. No se ofrece: cada cambio mata los enlaces
  que las clientas ya guardaron. Si se pide, será una decisión con aviso explícito.

## Diseño

Reparto de responsabilidades, siguiendo el precedente de `theme_color` (el
cliente propone el valor, SQL lo valida):

- **TS, puro y testeable**: `slugifyBusinessName(name)` convierte "Estética
  Roelis" en `estetica-roelis`. Sin acentos, sin símbolos, sin efectos.
- **SQL, dentro de `create_business`**: valida el formato (si no cumple, cae a
  `negocio-<id>`) y resuelve choques con sufijo numérico. La unicidad solo la
  puede garantizar la base: `booking_policy.public_slug` ya tiene `UNIQUE`.

La derivación no puede vivir entera en TS porque el choque de slugs solo se ve en
la base; y no puede vivir entera en SQL sin perder el test unitario del "bonito".

## Modo TDD

Estricto, activo. Runner: `npm run test:run` (vitest). El SQL no corre en CI: su
regresión es manual, como `supabase/tests/self-booking-regression.sql`.

## Tareas

- [x] **T1 · Función pura del slug.** `src/lib/domain/slug.ts` + su test. RED antes
  de implementar. Casos: acentos, ñ, mayúsculas, espacios, símbolos, guiones
  repetidos, nombre vacío o solo símbolos, largo máximo.
  Ruta: **inline** (una unidad pura, un archivo y su test; no dispara el gatillo
  de escritor porque el test es del mismo trabajo).
  ROJO observado: `Failed to load url ./slug` (el módulo no existía).
  VERDE: 163 tests, 12 nuevos.
- [x] **T2 · Migración.** `create_business` deriva y asegura el slug, y crea
  `booking_policy` cerrada. Backfill de los slugs `negocio-<id>` cuyo portal
  nunca se abrió (`enabled = false`): si nunca se abrió, nadie repartió ese
  enlace, así que renombrarlo no rompe nada. Regresión SQL propia.
  Ruta: **inline** (necesita el MCP de Supabase para aplicar y verificar el
  rojo/verde contra la base real; un escritor delegado no cierra ese lazo).
  ROJO observado: `function create_business(unknown, unknown, unknown) does not exist`.
  VERDE: las 4 aserciones de supabase/tests/business-public-slug.sql.
- [x] **T3 · Alta del negocio.** `Onboarding.tsx` pasa el slug propuesto a
  `create_business`.
  Ruta: **inline** (un archivo, cambio mecánico ya entendido).

## Criterios de aceptación

1. Crear "Estética Roelis" deja el enlace en `/reservar/estetica-roelis`.
2. Crear un segundo negocio con el mismo nombre no falla: obtiene un sufijo.
3. Un nombre solo de símbolos no rompe el alta: cae a `negocio-<id>`.
4. El enlace se ve en la pantalla de la dueña sin tener que abrir el portal.
5. `citelis` (portal abierto) NO se toca.

## Verificación

- `npm run test:run`, `npm run typecheck`, `npm run build`.
- Regresión SQL manual contra CitelisDev.

## Entrega

Estrategia: `ask-on-risk`. Previsión: bien por debajo de las 400 líneas
autoradas, así que se espera un solo PR contra `develop`.

## Progreso

- 2026-09-22 · Documento creado.
- 2026-09-22 · T1, T2 y T3 cerradas. Verificado: `npm run test:run` 163/163,
  `npm run typecheck` sin errores, `npm run build` correcto, y la regresión SQL
  en verde contra CitelisDev.
- 2026-09-22 · El backfill de slugs viejos salió del alcance (ver Alcance).
  `GGAUR4` conserva `negocio-1001`; su portal está cerrado, así que nadie tiene
  ese enlace.
- PENDIENTE de decisión: enseñarle a la dueña su dirección ya en el alta
  ("tu página será .../reservar/estetica-roelis"). Hoy la ve después, en Reservas,
  que ya cumple el criterio 4 porque la fila nace con el negocio.
- Producción (`fpgzdhfrverxjtwytqxv`) está en otra cuenta de Supabase: toda
  migración de este cambio hay que aplicarla allí a mano.
