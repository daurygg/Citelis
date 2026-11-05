// Módulos opcionales por negocio (odd/tasks/business-modules.md): Tienda y Equipo.
// Solo el administrador de la plataforma los activa o desactiva; apagado, el módulo
// desaparece de la app y sus datos se conservan. Agenda, Servicios, Créditos y el
// Reporte de servicios no son módulos: siempre están. Lógica pura (INVARIANTE 5).

import type { Business, BusinessModule } from './types';

/** Los módulos en el orden en que se muestran, con su nombre visible. */
export const BUSINESS_MODULES: readonly { id: BusinessModule; label: string }[] = [
  { id: 'store', label: 'Tienda' },
  { id: 'team', label: 'Equipo' },
];

export type ModuleFlags = Record<BusinessModule, boolean>;

/**
 * Qué módulos ve este negocio. Una columna ausente (front nuevo contra una base sin
 * migrar) cuenta como activa: así se comporta como antes de existir los módulos.
 * Sin negocio cargado no se muestra nada opcional.
 */
export function businessModules(business: Pick<Business, 'store_enabled' | 'team_enabled'> | null): ModuleFlags {
  if (business === null) return { store: false, team: false };
  return { store: business.store_enabled !== false, team: business.team_enabled !== false };
}
