// Vocabulario de estilos compartido (clases Tailwind reutilizables).
// Mantiene el look consistente sin repetir cadenas largas en cada componente.

export const card = 'rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm';

export const btnPrimary =
  'min-h-11 rounded-xl bg-brand-600 px-4 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40';

export const btnGhost =
  'min-h-11 rounded-xl border border-neutral-300 px-4 py-2.5 font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40';

// Variantes compactas (acciones en fila): siguen siendo de 44px de alto para el dedo.
export const btnPrimarySm =
  'min-h-11 rounded-xl bg-brand-600 px-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40';

export const btnGhostSm =
  'min-h-11 rounded-xl border border-neutral-300 px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40';

// Botón de solo texto (Cancelar, Cerrar...) con área táctil de 44px.
export const btnText = 'min-h-11 px-3 text-sm hover:underline';

// Chip de selección (servicios, horarios): 44px de alto; el color lo pone quien lo usa.
export const chip = 'min-h-11 rounded-full border px-4 text-sm';

// Tarjeta de cifra (KPI): menos relleno y el dinero puede partirse en pantallas angostas.
export const kpi = 'rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm break-words';

export const input =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export const field = 'flex flex-col gap-1 text-sm';

export const fieldLabel = 'text-neutral-600';
