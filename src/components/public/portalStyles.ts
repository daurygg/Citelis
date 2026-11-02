// Clases del portal público. Solo viven aquí: el resto de la app sigue con `ui.ts`.
// El acento sale de `brand-*` (lo elige cada negocio); el texto sobre relleno de
// marca usa `brand-fg`, que el tema calcula según la luminosidad del color.

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

/** Superficie blanca con borde fino: filas separadas por línea, no tarjetas sueltas. */
export const surface = 'overflow-hidden rounded-2xl bg-white ring-1 ring-portal-line';

export const portalPrimary =
  'min-h-12 shrink-0 rounded-xl bg-brand-600 px-5 font-semibold text-brand-fg transition hover:bg-brand-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand-600 disabled:hover:text-brand-fg ' +
  focusRing;

export const portalBack =
  '-ml-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-portal-muted hover:text-portal-ink ' +
  focusRing;

export const portalInput =
  'min-h-12 w-full rounded-xl bg-white px-3.5 text-base text-portal-ink ring-1 ring-portal-line placeholder:text-portal-muted/70 focus:outline-2 focus:outline-brand-700';

export const stepTitle = 'text-[1.75rem] leading-tight font-semibold tracking-tight text-balance';
