# Tema e identidad por negocio

> Documento vivo de ODD. Espejo en Engram: `odd/business-theming/tasks`.
> Locator: `odd/tasks/business-theming.md`

## Objetivo

Que cada negocio se vea suyo: su color de marca en toda la app y su nombre en la
cabecera y en la pestaña del navegador, también en el portal público, para que la
clienta sepa que está reservando en el sitio correcto.

## Problema

Hoy todo dice "Citelis" y todo es rosa. Está a fuego en `App.tsx:111`,
`Onboarding.tsx:46`, `Login.tsx:39`, `index.html:6`, y el color aparece como
`rose-*` **37 veces repartidas en 16 archivos**.

## Decisiones tomadas

| # | Decisión | Fecha |
|---|---|---|
| T1 | **Selector de color libre**, no paletas predefinidas. Decisión del usuario tras plantearle el riesgo de contraste. | 2026-09-22 |
| T2 | De su color se conservan **tono y croma**; la **luminosidad la fija el sistema** por escalón. Así cada escalón es legible por construcción. | 2026-09-22 |
| T3 | Espacio de color **OKLCH**, no HSL: su L es perceptualmente uniforme, así que la misma rampa se ve consistente en cualquier tono. | 2026-09-22 |
| T4 | El texto sobre el color se **calcula** desde la luminosidad del fondo. Nunca se fuerza el color de ella a ser legible. | 2026-09-22 |
| T5 | El color vive en `business.theme_color`. Se puede cambiar después de crear el negocio, no solo al crearlo. | 2026-09-22 |
| T6 | En `index.css` va `@theme` a secas, **nunca `@theme inline`**: la variante `inline` incrusta el valor y anula la sobrescritura en runtime. | 2026-09-22 |

## Alcance autorizado

El usuario autorizó completar **todos los slices** (2026-09-22). G1–G5 entregados.

## Invariantes que aplican

- INV. 5 — `theme.ts` es puro: sin React, sin DOM, sin I/O.
- INV. 4 — cuando llegue la UI (G4), el texto visible nunca pide un tecnicismo;
  el hex es una comodidad opcional, no la vía principal.
- INV. 1 — el color vivirá en la fila del negocio, ya aislada por tenant.

## Modo TDD

Activo. Runner `npm run test:run` (vitest). RED observado antes de implementar.

## Tareas — G1

- [x] **G1.1** — Tests en `src/lib/domain/theme.test.ts` (31 tests).
- [x] **G1.2** — Implementar `src/lib/domain/theme.ts` hasta GREEN.
- [x] **G1.3** — Verificado: `npm run test:run` → 9 archivos, 151 tests ✓;
      `npm run typecheck` → exit 0.

## Criterios de aceptación

1. `parseHexColor` acepta `#RRGGBB` y `#RGB` sin importar mayúsculas; devuelve
   `null` ante cualquier otra cosa. No lanza nunca.
2. La conversión sRGB→OKLCH es correcta contra valores conocidos (blanco, negro,
   rojo puro) con tolerancia razonable.
3. **Gris puro no produce NaN.** Con croma cero el tono es indefinido y `atan2(0,0)`
   devuelve 0; hay que tratarlo explícitamente.
4. `brandRamp` mantiene el tono del color base en todos los escalones.
5. La luminosidad de cada escalón es la fijada por el sistema, no la del color base.
6. El color del usuario se conserva como escalón `600` si su L cae en la banda
   usable; si no, se ajusta a la banda conservando tono y croma.
7. El croma se reduce en los escalones claros: mantenerlo alto con L alta se sale
   del gamut sRGB y el navegador lo recorta de forma impredecible.
8. `readableForeground` devuelve texto oscuro sobre fondos claros y blanco sobre
   oscuros, con el umbral cubierto por ambos lados.
9. `themeCssVars` ante entrada inválida, vacía o nula devuelve la paleta por
   defecto. **Nunca lanza**: un dato corrupto no puede dejar la app sin estilos.
10. Pureza: no muta entradas y es determinista.

## Progreso

**G1 COMPLETO** (2026-09-22). 120 tests de base → **151** (31 nuevos).

### Validación matemática contra referencia externa

Los tests podrían afirmar valores equivocados y la implementación coincidir con
ellos: pasarían igual sin demostrar nada. Por eso la conversión se comprobó contra
un valor publicado por Tailwind, calculándola por separado:

| Color | Calculado | Referencia |
|---|---|---|
| `#e11d48` | `oklch(0.5858 0.2220 17.58)` | Tailwind `rose-600`: `0.586 0.222 17.585` |
| `#ff0000` | `oklch(0.6280 0.2577 29.23)` | rojo puro: `0.6279 0.2577 29.23` |

### Casos límite cubiertos

- Gris puro, blanco y negro: el tono se fuerza a 0 y **no aparece `NaN`** en
  ninguna parte de la rampa ni de las variables.
- `themeCssVars` cae al color por defecto ante `null`, `undefined`, `''`, basura
  y tipos incorrectos. Nunca lanza.
- El escalón 600 conserva el color del usuario dentro de la banda; fuera de ella se
  recorta a 0.45 o 0.72 conservando tono y croma.
- El texto se deriva de la luminosidad **efectiva** del escalón 600, no de la del
  color crudo — si no, un color recortado llevaría el texto equivocado.

### Deuda menor

`DEFAULT_OKLCH` se calcula con `parseHexColor(...) as Oklch`. Es seguro porque el
hex por defecto es una constante válida que controlamos, pero si alguien la cambia
por un valor inválido la app reventaría al importar el módulo, justo contra la
garantía de "nunca lanza". Un respaldo literal lo cerraría del todo.

## G2–G5 — entregados (2026-09-22)

### G2 — columna y contrato SQL ✅ **verificado por ejecución**
`supabase/migrations/20260922000001_business_theme_color.sql`, **aplicado y
comprobado contra CitelisDev**, no entregado a ciegas.

Dos trampas de Postgres que había que sortear:
- **`create_business` no admite añadir un parámetro sin más.** Dejar la versión de
  un argumento y crear otra de dos con valor por defecto vuelve **ambigua** una
  llamada con un solo argumento, y la app hace justo esa. Hubo que borrar la vieja
  y volver a conceder el `execute`: los grants no sobreviven a un `drop`.
- **`public_business` no se puede ampliar con `create or replace`.** Postgres
  rechaza cambiar la lista de columnas de un `returns table`. Borrar y recrear.

Comprobado en la base: existe **una sola** versión de `create_business`; `anon`
puede ejecutar `public_business` pero **no** `create_business`; el CHECK rechaza un
hex malformado; un color inválido nunca impide crear el negocio, cae al default.

### G3 — tokens de marca ✅
`@theme` con `--color-brand-{50,100,500,600,700}` y `--color-brand-fg`, sembrados
con los valores rosa actuales para que nada cambie de aspecto hasta que alguien
elija color. **37 apariciones de `rose-*` sustituidas en 16 archivos**; quedan cero.

`rose-200` y `rose-300` no tienen equivalente directo (la rampa solo tiene
50/100/500/600/700); ambos se redondearon a `brand-100`. El de `rose-300` es un
borde de hover, y merece una mirada visual cuando alguien pueda.

**Comprobación clave (T6)**: el CSS compilado contiene `var(--color-brand-600)` y
los tokens viven en `:root`. Si hubiera entrado `@theme inline`, ahí aparecería el
valor incrustado y el color no cambiaría nunca — sin error, sin test en rojo.

### G4 — la dueña elige su color ✅
`BrandColorPicker` (`<input type="color">` nativo + campo de hex), en el onboarding
y en configuración (decisión T5). `StoreContext` gana `updateBusinessTheme`.

La vista previa aplica las variables a **su propio contenedor**, no al documento:
la app no parpadea mientras arrastra, y como las variables CSS heredan, todo lo de
dentro se previsualiza solo. Además enseña el recorte de T2 en vez de explicarlo.

Hallazgo incidental: `business` se leía del prop de carga inicial y **nunca se
actualizaba**. Sin promoverlo a estado, guardar un color no habría repintado nada.

### G5 — el nombre del negocio ✅
Cabecera y `document.title` en la app (`"<nombre> — Agenda"`) y en el portal
(`"<nombre> — Reservar"`). `Login.tsx` conserva "Citelis": ahí todavía no se sabe
de qué negocio eres. `index.html` mantiene su título estático como respaldo.

### Refactor durante la revisión
El selector quedó duplicado en `Onboarding` y `BrandSettings`, y **los dos bloques
ya habían divergido en el mismo commit** (uno perdió la aclaración "el de tu logo").
Se extrajo `BrandColorPicker`, componente **hoja**: importa solo `theme.ts` y
`ui.ts`, nunca el store. Eso evita el ciclo
`StoreContext → Onboarding → BrandColorPicker → StoreContext`, que es lo que había
llevado a duplicar en vez de extraer.

## Verificación final

| Comando | Resultado |
|---|---|
| `npm run test:run` | 9 archivos, **151 tests** |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `grep -rE "rose-[0-9]{2,3}" src/` | 0 |
| `grep "var(--color-brand-600)" dist/assets/*.css` | presente |

**Sin verificación visual.** No hay navegador aquí: nadie ha visto el selector, la
vista previa ni el repintado. Eso es lo único que falta para dar la feature por
buena de verdad.

## Siguiente paso

1. **Abrir la app y mirarla.** Elegir un color en el onboarding y en configuración,
   comprobar que repinta, y ver el portal público con el color y el nombre.
2. Revisar el borde de hover que pasó de `rose-300` a `brand-100`.
3. Considerar una pestaña "Negocio" propia si aparecen más ajustes que el color.

## Slices siguientes (planteados, NO autorizados)

- **G2** — SQL aditivo: `business.theme_color` con CHECK de formato,
  `create_business(p_name, p_theme_color)`, y `public_business` devolviendo el color.
- **G3** — `@theme` con tokens `brand-*` y sustitución de las 37 apariciones de `rose-*`.
- **G4** — Selector con vista previa, en onboarding y en configuración.
- **G5** — Nombre del negocio en cabecera y `document.title`, en app y portal.
  El nombre YA está disponible en ambos lados (`Store.business` y
  `public_business.business_name`): es solo usarlo.

## Riesgos abiertos

- El hex exacto del usuario puede no aparecer literal si su luminosidad queda fuera
  de la banda usable. Es deliberado (T2), pero hay que decírselo en la UI de G4.
- G3 toca 16 archivos. Es mecánico, pero conviene que sea su propio commit para que
  el diff se pueda revisar de un vistazo.
