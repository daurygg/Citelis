# Rediseño de la agenda de la dueña y base visual compartida

> Documento vivo de ODD. Espejo en Engram: `odd/owner-agenda-redesign/tasks`.
> Locator: `odd/tasks/owner-agenda-redesign.md`

## Objetivo

Llevar el lenguaje visual validado en el portal público (`odd/tasks/public-booking-redesign.md`)
a la app de la dueña: una base compartida en toda la app y la agenda del día rediseñada a
medida, porque es la pantalla que abre todos los días.

## Problema

La app usa fuente del sistema, tarjetas blancas idénticas con sombra (`ui.ts`, usado por 34
componentes), una cabecera con el nombre en `text-xl` y pestañas en pastilla gris. La agenda
muestra tres tarjetas KPI iguales y un navegador de día con flechas "‹ ›" y un `input date`
suelto. Al lado del portal nuevo se ve como otro producto.

## Decisión de alcance (elegida por la dueña)

Opción recomendada: base compartida (fuente, neutros, `ui.ts`, cabecera y pestañas) para
toda la app + agenda completa a medida (`ScheduleForm`, `DayAgenda`, `AppointmentRow`). Las
demás pantallas cambian solo por la base, sin rediseño propio.

## Dirección de diseño

- **Audiencia:** la dueña (y empleadas) en el teléfono, varias veces al día, con prisa.
  Herramienta de trabajo: más densa y tranquila que el portal; nada de display gigante.
- **Tipografía:** la misma Bricolage Grotesque Variable del portal, ahora para toda la app.
  Cifras con `tabular-nums`. El nombre del negocio en la cabecera usa el estilo display a
  tamaño contenido (es la firma compartida con el portal).
- **Color:** mismos tokens `portal-paper/ink/muted/line` (renombrables a algo neutral si
  conviene) + acento de marca. Estados de cita distinguibles por texto, no solo por color.
- **Agenda:** el día como encabezado claro (día de la semana y fecha grandes, "hoy" visible,
  navegación anterior/siguiente de 44 px, selector de fecha integrado, no un input suelto).
  Las tres cifras (Ganado, Proyectado, Cobrado) en una sola franja compacta, no tres tarjetas.
  Las citas como línea de tiempo: hora a la izquierda, servicio y clienta, estado y acciones.
- **Referencia de taste-skill (uso moderado):** leer solo las secciones pertinentes de
  `.agents/skills/design-taste-frontend/references/app-screens.md` (85 KB: buscar por
  encabezados, no leerlo entero) y `references/tells.md`.
- **Principios:** sin mayúsculas sostenidas, sin "·" para unir metadatos, sin una sombra
  igual bajo todo, foco visible, 44 px mínimos, `prefers-reduced-motion` respetado.

## Alcance autorizado

- `src/index.css` (tokens y fuente global), `src/components/ui.ts`, la cabecera y pestañas en
  `src/App.tsx`, `src/components/{ScheduleForm,DayAgenda,AppointmentRow}.tsx` y subcomponentes
  nuevos para ellos. Lógica pura nueva en `src/lib/` con tests si hace falta.
- Fuera de alcance: comportamiento, store, dominio, RPC, rediseño propio de otras pantallas.

## TDD

Modo: estricto (sesión del usuario). Runner: `npm run test:run` (vitest).

## Entrega

Rama `feat/owner-agenda-redesign`, apilada sobre `feat/public-booking-redesign` (reusa su
fuente y tokens). Estrategia: cadena de ramas; cada PR va a `develop` en orden.

## Tareas

- [x] **T1** — Base compartida: fuente global, tokens neutrales, `ui.ts` (tarjetas, botones,
  inputs, chips, KPI) sin cambiar los nombres exportados. Ruta: delegada.
- [x] **T2** — Cabecera y pestañas de `App.tsx` con la nueva base. Ruta: delegada.
- [x] **T3** — Agenda a medida: encabezado del día, franja de cifras, línea de tiempo de
  citas, formulario de agendar. Ruta: delegada.
- [x] **T4** — Capturas a 390 px (marca clara y oscura) de la agenda y de 2–3 pantallas que
  solo heredan la base (servicios, reporte, Mi negocio), con datos simulados y sin tocar el
  Supabase real; autocrítica y ajuste.

## Checks

`npm run test:run`, `npm run typecheck`, `npm run build`, capturas de T4.

## Progreso

- Portal público validado por la dueña en el navegador.
- Rama `feat/owner-agenda-redesign` creada desde `feat/public-booking-redesign`.
- T1 `53d85fe`: fuente global en `main.tsx`; tokens `paper/ink/muted/line` (antes `portal-*`);
  `ui.ts` con los mismos nombres, anillo fino en vez de sombra, foco visible, inputs de 44 px.
- T2 `6179596`: nombre en `.display-name`, selector Servicios/Ropa segmentado, pestañas subrayadas.
- T3 `47f3512`: `src/lib/agendaDay.ts` (`dayHeading`, `splitClock`) con TDD (RED por módulo
  ausente, GREEN 640/640); encabezado del día, franja de cifras, línea de tiempo. Extra fuera
  del plan: `ScheduleForm` plegado tras "Agendar una cita" (reversible).
- T4 `54a7c4e`: menú "Más" en la cabecera; dinero de la cita cobrada bajo el nombre.
  Capturas con Supabase simulado (`page.route` + sesión falsa), overflow 0 px.
- `290b8e1`: el menú "Más" se cierra con Escape (foco vuelve al botón) y al tocar fuera.
- taste-skill: `tells.md` + `app-screens.md` §4.3, §4.4, §5, §7.1, §7.3, §7.5, §7.6, §12.
- Verificación: test:run 640/640, typecheck limpio, build OK.

## Pendiente / abierto

- Copia previa confusa en citas completadas: "Cobró" (precio) junto a "Debe". Propuesta: "Precio".
- La quinta pestaña queda cortada a 390 px (desplazable; ya pasaba antes).
- Marcas muy claras: botones en rosa suave por el clamp de `theme.ts`.
