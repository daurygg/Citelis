# Rediseño del portal público de reservas

> Documento vivo de ODD. Espejo en Engram: `odd/public-booking-redesign/tasks`.
> Locator: `odd/tasks/public-booking-redesign.md`

## Objetivo

Que la clienta que llega desde un enlace de Instagram o WhatsApp sienta que está en el
sitio del negocio (no en una plantilla) y pida su cita en menos de un minuto desde el
teléfono. Pantalla piloto del nuevo lenguaje visual; si funciona, se extiende al resto.

## Problema

`PublicBooking.tsx` usa el vocabulario genérico de `ui.ts`: tarjetas blancas idénticas,
fuente del sistema, indicador de pasos "1. Servicio · 2. Día y hora", metadatos unidos con
"·". El nombre del negocio es un `text-xl` centrado. Los horarios son una rejilla plana sin
agrupar. El resumen de lo elegido solo aparece en el último paso.

## Restricción clave

El acento lo pone cada negocio (`--color-brand-*`, rampa OKLCH en `theme.ts`). El diseño
debe verse bien con CUALQUIER color. La identidad sale de tipografía, estructura y neutros.

## Plan de diseño

- **Sujeto:** clienta de un negocio de belleza pequeño, en el teléfono. Tarea: elegir
  servicio(s), día y hora, dejar nombre y teléfono, enviar la solicitud (no se autoconfirma).
- **Tipografía:** Bricolage Grotesque variable (ejes `opsz` y `wdth`), una sola familia,
  autoalojada con `@fontsource-variable/bricolage-grotesque` (sin peticiones a terceros).
  Display ancho y pesado para el nombre del negocio; cuerpo en tamaño óptico pequeño.
  Escala: 14 / 16 / 20 / 28 / 40.
- **Color:**
  - papel: `color-mix(in oklch, var(--color-brand-50) 45%, white)` — fondo teñido con la marca
  - superficie: `#ffffff`
  - tinta: `#231f26`
  - tenue: `#6d6772`
  - línea: `#e6e1e8`
  - acento: `--color-brand-600` / `--color-brand-700`
- **Layout:** columna móvil `max-w-md`, alineada a la izquierda.

```
Reserva en
Studio Nails Ana          ← lo memorable: el nombre en display grande
[███▒▒▒▒▒▒]               ← progreso de 3 segmentos, sin numeración
¿Qué te vas a hacer?
 Uñas acrílicas      RD$1,500   ← filas con línea fina, no tarjetas
 90 min                    ✓
 ...
┌─ barra fija abajo ─────────┐
│ Uñas acrílicas, 90 min     │  ← resumen de la cita que se construye
│ RD$1,500     [Elegir hora] │     paso a paso; CTA en la zona del pulgar
└────────────────────────────┘
```

  Día: tira horizontal de fichas tipo calendario (día de semana pequeño + número grande).
  Hora: agrupada en Mañana / Tarde / Noche. Éxito: comprobante de la solicitud con estado
  "Pendiente de confirmar".
- **Principios:** una sola audacia (el nombre del negocio); todo lo demás quieto. Sin
  mayúsculas sostenidas en etiquetas, sin metadatos unidos con "·". Un único movimiento: la
  barra de resumen sube al elegir el primer servicio; respeta `prefers-reduced-motion`.
  Foco visible, 44 px mínimos, texto en español claro y en voz activa.

## Alcance autorizado

- `src/components/public/PublicBooking.tsx` (y subcomponentes nuevos en `src/components/public/`).
- `src/index.css`: solo tokens nuevos (fuente, neutros del portal). Sin tocar `ui.ts` ni el
  resto de la app.
- Lógica pura nueva en `src/lib/public/` con sus tests.
- `package.json`: dependencia `@fontsource-variable/bricolage-grotesque`.

Fuera de alcance: lógica de reservas, RPC, máquina de estados, otras pantallas.

## TDD

Modo: estricto (sesión del usuario). Runner: `npm run test:run` (vitest).

## Tareas

- [x] **T1** — Lógica pura `groupSlotsByPeriod` (Mañana < 12:00, Tarde < 19:00, Noche) con
  tests RED→GREEN. Ruta: delegada (escritor único, 3+ archivos no triviales).
- [x] **T2** — Fuente y tokens del portal en `index.css` + dependencia.
- [x] **T3** — Rediseño de `PublicBooking.tsx` según el plan; barra de resumen fija.
- [x] **T4** — Capturas a 390 px con dos colores de marca (claro y oscuro) usando datos
  simulados (`page.route`), sin tocar el Supabase real; autocrítica y ajuste.

- [x] **T5** — Volver atrás con confianza (pedido de la dueña tras ver T1–T4): botón "Atrás"
  visible de 44 px junto al progreso en los pasos 2 y 3 (reemplaza los enlaces grises), y
  pasos sincronizados con el historial del navegador para que el atrás del teléfono vuelva al
  paso anterior conservando lo elegido. Tras enviar, el atrás nunca reabre el formulario.
  Ruta: delegada (lógica pura de pasos + componente).

## Checks

`npm run test:run`, `npm run typecheck`, `npm run build`, capturas de T4.

## Progreso

- Rama `feat/public-booking-redesign` creada desde `develop`.
- T1 `72e7c85`: `groupSlotsByPeriod` (RED: suite no cargaba el módulo; GREEN 624/624).
- T2 `34bac52`: fuente importada solo desde el portal. Desvío: el eje `wdth` llega a 100
  como máximo, así que el nombre usa wdth 100, opsz 96, peso 800.
- T3 `bb7740e`: subcomponentes `BookingProgress`, `ServiceList`, `DayStrip`, `SlotPicker`,
  `SummaryBar`, `RequestReceipt`; extra `src/lib/public/dayLabels.ts` con test (TDD).
- T4 `0a8d87d`: capturas 390/360 px con #f5c2d0 y #1e3a5f; corregidos recortes en la barra
  y el margen de la tira de días. Overflow horizontal 0 px.
- Verificación final: test:run 627/627, typecheck limpio, build OK (aviso de tamaño previo).
- RDD: `review assess` (base `develop`, solo commits, untracked excluidos) → riesgo medium
  (cambio de `package-lock.json`), `review_due=false`, `under_budget`. Queda pendiente en el slice.
- T5 `8b9cea6`: `BackButton` junto al progreso; pasos en `history.state` (`bookingSteps.ts`,
  TDD: RED por módulo ausente, GREEN 636/636). Tras enviar, el registro de detalles se
  reemplaza por `success` y cualquier entrada alcanzada muestra el comprobante. Playwright:
  atrás desde detalles conserva la hora; desde el comprobante no reaparece el formulario.
  Sin confirmar de punta a punta: que el segundo atrás tras enviar salga del portal.

## Pendiente / abierto

- Con marcas muy claras el CTA queda en un malva suave (lo fija el clamp de `theme.ts`).
- El paso "Tus datos" muestra el resumen solo en la barra.
- Siguiente: revisión nativa (RDD) del rango y decidir si se extiende el lenguaje a la agenda.
