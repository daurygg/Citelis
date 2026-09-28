// Dónde abre la app cuando la dueña toca el aviso de una reserva nueva (T5,
// odd/tasks/owner-push-notifications.md). Pura: no toca `window` ni el
// historial — App.tsx la llama con `window.location.search` y decide cuándo
// limpiar la URL con `history.replaceState`.

// Viven aquí y no en App.tsx: la capa de lógica no depende de la UI; es App
// quien importa estos tipos.
// La identidad del negocio (hoy el color; mañana nombre o logo) manda sobre las
// dos líneas de negocio y sobre el portal público, así que vive en su propia
// pantalla fuera de los modos, no en una pestaña de Servicios.
export type Screen = 'work' | 'business';
export type ServiceView = 'agenda' | 'reservas' | 'services' | 'report';

export interface InitialView {
  screen: Screen;
  serviceView: ServiceView;
}

const DEFAULT_VIEW: InitialView = { screen: 'work', serviceView: 'agenda' };

/** `?vista=reservas` (el `url` que manda el push) → abrir directo la bandeja de reservas. */
export function initialViewFromSearch(search: string): InitialView {
  const params = new URLSearchParams(search);
  if (params.get('vista') === 'reservas') {
    return { screen: 'work', serviceView: 'reservas' };
  }
  return DEFAULT_VIEW;
}
