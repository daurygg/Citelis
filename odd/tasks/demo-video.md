# Demo video: primeros pasos en Citelis

## Objetivo
Video de onboarding (~75s) que muestra a quien empieza a usar Citelis cómo se usa el día a día,
con capturas reales de la app, motion graphics (Remotion) y voz en off grabada por el usuario.

## Alcance
- Workspace aislado en `demo-video/` (no toca el `package.json` de la app).
- Formatos: horizontal 1920x1080 y vertical 1080x1920, 30 fps.
- Capturas contra Supabase **local** (Docker) con un negocio ficticio "Estudio Bella".
- Prohibido: `supabase/seed-data.sql` (datos reales de una clienta), cualquier dato real.
- Textos y voz sin género asumido ("cliente(s)", "tu equipo") — invariante 4 de CLAUDE.md.

## Storyboard aprobado (2026-11-06)
1 Gancho · 2 Crear cuenta · 3 Cuéntanos de ti · 4 Asistente inicial · 5 Servicios e insumos ·
6 Agendar cita · 7 Tu día · 8 Cobrar · 9 Reservas online · 10 Reporte · 11 Cierre.

## Tareas
- [x] T1 Entorno: Docker Desktop + `supabase start` + app local apuntando a la base local. (inline)
  - Evidencia: `supabase start -x vector,logflare,studio,imgproxy,edge-runtime,postgres-meta` sano;
    app en `http://localhost:5180` con `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` por entorno
    (no se tocó `.env`). C: lleno corrompió imágenes de Docker: se borraron y se bajaron de nuevo.
- [x] T2 Capturas: `demo-video/capture.ts` con Playwright, viewport 390x844, novedades apagadas. (delegado: escritor único)
  - Evidencia: `cd demo-video && BASE_URL=http://localhost:5180 npx tsx capture.ts` → 17 tomas OK
    (7 clips 780x1688, 10 PNG). Reset idempotente: borra solo `demo+bella*@citelis.test` y "Estudio Bella"
    en la base local. Datos sembrados por la UI real (14 citas completadas, RD$14,000).
  - Decisiones: escena 9 usa enlace + portal público (no hay QR en "Mi negocio"); el banner de
    prueba se recorta en Remotion.
  - Hallazgo fuera de alcance: `ClientPicker.tsx:96` aún dice "Clienta" (invariante 4) → fix aparte.
- [x] T3 Remotion: copiar plantilla, `config.ts`/`theme.ts` con marca Citelis, stills por escena. (delegado)
  - Evidencia: `npx tsc --noEmit` OK; 22 stills (11 escenas × Landscape/Vertical) revisados en `out/stills/`.
    Sin voz: 62.5 s. Comandos: `npm run studio | render | render:vertical`.
  - Pendiente de decidir: la escena 9 muestra `http://localhost:5180/reservar/estudio-bella`.
- [x] T4 Guion de voz en off por escena → el usuario graba. (inline)
  - 11 WAV del usuario renombrados a `NN-<id>.wav` en `public/voiceover/` (ignorados en git, 20 MB).
- [x] T5 Integrar audios, render horizontal + vertical. (inline)
  - Evidencia: `npm run render` → `out/demo-landscape.mp4` 1920x1080, 79.4 s, 20.4 MB;
    `npm run render:vertical` → `out/demo-vertical.mp4` 1080x1920, 79.4 s, 23.1 MB.
    Audio: pico 30496, voz en 72/79 s. Escena 9 muestra `https://citelis.app/...`.

## Verificación
- Stills por escena revisados antes del render completo.
- MP4 final reproducido; sin datos reales visibles.

## Progreso
- Storyboard aprobado con versión vertical. Docker no estaba instalado: instalación vía winget en curso.

## Siguiente paso
T1: terminar Docker Desktop y habilitar integración con WSL.
