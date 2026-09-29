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

// ── Precio de un CONJUNTO de servicios ──────────────────────────────────────

export interface ServicePriceLine {
  service_id: number;
  price: number; // centavos
}

export interface ServicesPrice {
  /** Suma de lo que SÍ tiene precio conocido. */
  total: number;
  /** Precio de cada servicio con precio conocido. Son los pesos del reparto. */
  lines: readonly ServicePriceLine[];
  /** Servicios de precio variable a los que todavía nadie les puso precio. */
  needsPrice: readonly Service[];
}

/**
 * Cuánto cuesta este conjunto de servicios (decisión D4 de
 * odd/tasks/multi-service-appointments.md).
 *
 * ÚNICO SITIO donde se decide el precio de un conjunto. Hoy es una suma; cuando
 * entren los combos —precio especial por combinación— este es el único lugar que
 * cambia. Si el cálculo se repartiera por el portal, la agenda, el cobro y los
 * reportes, meter combos obligaría a tocarlos todos.
 *
 * Un servicio de precio variable sin precio puesto NO se cuenta como cero: se
 * devuelve en `needsPrice`. Contarlo como cero sería cobrar de menos en silencio,
 * que es peor que negarse a cerrar la cuenta.
 */
export function priceForServices(
  services: readonly Service[],
  priceOverrides?: ReadonlyMap<number, number>,
): ServicesPrice {
  const lines: ServicePriceLine[] = [];
  const needsPrice: Service[] = [];

  for (const service of services) {
    const override = priceOverrides?.get(service.id);
    if (service.variable_price && override === undefined) {
      needsPrice.push(service);
      continue;
    }
    lines.push({ service_id: service.id, price: override ?? service.price });
  }

  return {
    total: lines.reduce((sum, line) => sum + line.price, 0),
    lines,
    needsPrice,
  };
}

/**
 * Reparte `total` centavos entre varios pesos, a prorrata, SIN perder ni crear
 * un céntimo: la suma del resultado es exactamente `total`.
 *
 * El reparto a prorrata da decimales casi siempre (8.000 entre 5.000 y 4.000 da
 * 4.444,44 y 3.555,55), y el dinero vive en centavos enteros. Se reparte el
 * sobrante por el método del resto mayor: gana el que más fracción perdió al
 * truncar, y los empates los decide el orden. Así el reparto es determinista y
 * la factura cuadra.
 *
 * `total` se espera no negativo: se usa sobre precio cobrado y costo, que nunca
 * lo son. La ganancia NO se reparte con esto — se deriva restando, así que sale
 * cuadrada sola aunque sea negativa.
 *
 * Con todos los pesos en cero (una cita regalada) el prorrateo no significa
 * nada, así que reparte por igual. Lo que no puede pasar es un NaN.
 */
export function allocateProportionally(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];

  const sumWeights = weights.reduce((sum, w) => sum + w, 0);
  const effective = sumWeights === 0 ? weights.map(() => 1) : weights;
  const sumEffective = sumWeights === 0 ? weights.length : sumWeights;

  const exact = effective.map((w) => (total * w) / sumEffective);
  const shares = exact.map((value) => Math.floor(value));

  let leftover = total - shares.reduce((sum, s) => sum + s, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; leftover > 0 && i < byRemainder.length; i++, leftover--) {
    shares[byRemainder[i].index] += 1;
  }

  return shares;
}
