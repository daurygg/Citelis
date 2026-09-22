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

**Ahora: solo G1** — el módulo puro `src/lib/domain/theme.ts` con sus tests.
Sin SQL, sin UI, sin tocar `index.css` ni ningún componente.

G2–G5 quedan planteados pero **no autorizados**.

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

## Siguiente paso

G1 está cerrado. Lo siguiente, por orden de valor:

1. **G5** — nombre del negocio en cabecera y `document.title`. El más barato y el
   más visible: el nombre ya está disponible en `Store.business` y en
   `public_business.business_name`.
2. **G2** — SQL aditivo para `business.theme_color`.
3. **G3** — tokens `brand-*` y sustitución de las 37 apariciones de `rose-*`.
4. **G4** — selector con vista previa.

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
