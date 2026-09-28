import { describe, expect, it } from 'vitest';
import { initialViewFromSearch } from './initialView';

describe('initialViewFromSearch', () => {
  it('sin parámetros: pantalla de trabajo, pestaña de agenda', () => {
    expect(initialViewFromSearch('')).toEqual({ screen: 'work', serviceView: 'agenda' });
  });

  it('?vista=reservas: abre directo en la bandeja de reservas', () => {
    expect(initialViewFromSearch('?vista=reservas')).toEqual({ screen: 'work', serviceView: 'reservas' });
  });

  it('un valor de vista que no reconoce no cambia nada', () => {
    expect(initialViewFromSearch('?vista=otra-cosa')).toEqual({ screen: 'work', serviceView: 'agenda' });
  });

  it('otros parámetros de la URL no afectan', () => {
    expect(initialViewFromSearch('?utm_source=whatsapp')).toEqual({ screen: 'work', serviceView: 'agenda' });
  });
});
