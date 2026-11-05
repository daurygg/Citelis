import { describe, it, expect } from 'vitest';
import { BUSINESS_MODULES, businessModules } from './modules';

describe('businessModules', () => {
  it('lee los módulos activos del negocio', () => {
    expect(businessModules({ store_enabled: true, team_enabled: false })).toEqual({ store: true, team: false });
    expect(businessModules({ store_enabled: false, team_enabled: true })).toEqual({ store: false, team: true });
  });

  it('sin la columna (base todavía sin migrar) se comporta como hoy: todo visible', () => {
    expect(businessModules({})).toEqual({ store: true, team: true });
  });

  it('sin negocio cargado no muestra nada opcional', () => {
    expect(businessModules(null)).toEqual({ store: false, team: false });
  });
});

describe('BUSINESS_MODULES', () => {
  it('nombra los módulos en el idioma de quien administra', () => {
    expect(BUSINESS_MODULES).toEqual([
      { id: 'store', label: 'Tienda' },
      { id: 'team', label: 'Equipo' },
    ]);
  });
});
