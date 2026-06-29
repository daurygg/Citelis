// Fórmulas de costo y ganancia — funciones puras (PLAN.md §3.2).
// Todo en centavos enteros. CERO dependencias de React.
//
//   unit_cost   = purchase_price / servings
//   supply_cost = Σ unit_cost de todos los insumos del servicio
//   effective_cost = cost_override ?? supply_cost     (el override gana si existe)
//   profit      = charged_price − actual_cost          (solo al completar)

import type { Supply, Service } from './types';

/**
 * Costo unitario de un insumo: lo que cuesta atender a UNA clienta con ese insumo.
 * Centavos enteros (redondeado). Maneja `servings <= 0` sin dividir por cero → 0.
 */
export function unitCost(supply: Supply): number {
  if (supply.servings <= 0) return 0;
  return Math.round(supply.purchase_price / supply.servings);
}

/**
 * Costo de insumos de un servicio: suma de los costos unitarios de TODOS sus insumos.
 * Este es el valor que se memoiza en `Service.supply_cost` (INVARIANTE 6).
 */
export function suppliesCost(supplies: readonly Supply[]): number {
  return supplies.reduce((total, supply) => total + unitCost(supply), 0);
}

/**
 * Costo efectivo del servicio: el override manual gana sobre el cache si existe.
 * `cost_override === null` → usa el cache `supply_cost`.
 */
export function effectiveCost(service: Pick<Service, 'supply_cost' | 'cost_override'>): number {
  return service.cost_override ?? service.supply_cost;
}

/** Ganancia de una cita: precio cobrado menos costo real. */
export function profit(chargedPrice: number, actualCost: number): number {
  return chargedPrice - actualCost;
}
