// Vocabulario de estilos compartido (clases Tailwind reutilizables).
// Mantiene el look consistente sin repetir cadenas largas en cada componente.
// Los neutros (`paper`, `ink`, `muted`, `line`) y la fuente salen de `index.css`;
// el acento de marca lo elige cada negocio (`brand-*`) y el texto sobre un relleno
// de marca usa `brand-fg`, que el tema calcula según la luminosidad del color.

// Foco visible en todo lo que se toca; el color es el de la marca, oscurecido.
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

// Superficie blanca con borde fino (sin sombra): la separación sale del tono, no de una sombra igual bajo todo.
export const card = 'rounded-2xl bg-white p-4 ring-1 ring-line';

export const btnPrimary =
  'min-h-11 rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-brand-fg transition hover:bg-brand-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand-600 disabled:hover:text-brand-fg ' +
  focus;

export const btnGhost =
  'min-h-11 rounded-xl bg-white px-4 py-2.5 font-medium text-ink ring-1 ring-line transition hover:bg-paper disabled:opacity-40 ' +
  focus;

// Variantes compactas (acciones en fila): siguen siendo de 44px de alto para el dedo.
export const btnPrimarySm =
  'min-h-11 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-brand-fg transition hover:bg-brand-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand-600 disabled:hover:text-brand-fg ' +
  focus;

export const btnGhostSm =
  'min-h-11 rounded-xl bg-white px-3 text-sm font-medium text-ink ring-1 ring-line transition hover:bg-paper disabled:opacity-40 ' +
  focus;

// Botón de solo texto (Cancelar, Cerrar...) con área táctil de 44px.
export const btnText = 'min-h-11 rounded-lg px-3 text-sm hover:underline ' + focus;

// Chip de selección (servicios, horarios): 44px de alto; el color lo pone quien lo usa.
export const chip = 'min-h-11 rounded-full border px-4 text-sm transition ' + focus;

// Tarjeta de cifra (KPI): menos relleno y el dinero puede partirse en pantallas angostas.
export const kpi = 'rounded-2xl bg-white p-3 ring-1 ring-line break-words';

export const input =
  'min-h-11 w-full rounded-xl bg-white px-3 py-2 text-ink ring-1 ring-line outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-brand-700';

export const field = 'flex flex-col gap-1 text-sm';

export const fieldLabel = 'text-muted';
