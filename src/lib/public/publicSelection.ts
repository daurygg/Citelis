// La selección de servicios del portal público, sin React (INVARIANTE 5).
// Hermana de `domain/selection.ts` (lado de la dueña), pero con la forma que
// devuelve `public_business`: ahí el precio de un servicio variable NO viaja
// (es null), así que no se puede reusar `priceForServices`.

import { formatMoney } from '../format';
import type { PublicBusinessService } from './publicBooking';

export interface PublicSelectionSummary {
  /** Servicios elegidos que existen en el catálogo, sin repetir, en orden de elección. */
  service_ids: number[];
  /** Duración de la visita: la suma de cada servicio, en minutos. */
  duration_min: number;
  /** Suma de los servicios de precio fijo. Los variables NO se cuentan como cero: ver has_variable. */
  fixed_total: number;
  /** true si algún servicio elegido es "a convenir". */
  has_variable: boolean;
  /** ¿Se puede pedir? Hay al menos un servicio. */
  ready: boolean;
}

/** Resume lo elegido. Ids ausentes del catálogo se descartan (el servidor los vuelve a validar). */
export function summarizePublicSelection(
  catalog: readonly PublicBusinessService[],
  selected: readonly number[],
): PublicSelectionSummary {
  const services: PublicBusinessService[] = [];
  for (const id of selected) {
    const found = catalog.find((s) => s.service_id === id);
    if (found && !services.some((s) => s.service_id === id)) services.push(found);
  }
  return {
    service_ids: services.map((s) => s.service_id),
    duration_min: services.reduce((sum, s) => sum + s.duration_min, 0),
    fixed_total: services.reduce((sum, s) => sum + (s.variable_price ? 0 : (s.price ?? 0)), 0),
    has_variable: services.some((s) => s.variable_price),
    ready: services.length > 0,
  };
}

/** Precio de un servicio para la clienta: dinero si es fijo, "A convenir" si no. */
export function servicePriceLabel(service: PublicBusinessService): string {
  return service.variable_price || service.price === null ? 'A convenir' : formatMoney(service.price);
}

/**
 * Estimado de lo elegido. Solo fijos: el total. Solo variables: "A convenir".
 * Mezcla: "Desde X" (X = lo fijo; lo variable se suma después). Vacío sin selección.
 */
export function estimateLabel(summary: PublicSelectionSummary): string {
  if (!summary.ready) return '';
  if (!summary.has_variable) return formatMoney(summary.fixed_total);
  return summary.fixed_total > 0 ? `Desde ${formatMoney(summary.fixed_total)}` : 'A convenir';
}
