// Cálculos puros de la venta de ropa. CERO dependencias de React. Centavos enteros.
//   revenue = unit_price × quantity
//   cost    = unit_cost  × quantity
//   profit  = (unit_price − unit_cost) × quantity
import type { Sale } from './types';

export function saleRevenue(sale: Sale): number {
  return sale.unit_price * sale.quantity;
}

export function saleCost(sale: Sale): number {
  return sale.unit_cost * sale.quantity;
}

export function saleProfit(sale: Sale): number {
  return (sale.unit_price - sale.unit_cost) * sale.quantity;
}

/** ¿Se pueden vender `quantity` unidades con el stock actual? */
export function canSell(stock: number, quantity: number): boolean {
  return quantity > 0 && quantity <= stock;
}

export interface BestSeller {
  product_id: number;
  units: number; // unidades vendidas en el periodo
}

export interface SalesSummary {
  business_id: number;
  from: string; // ISO (inclusive)
  to: string; // ISO (exclusive)
  units_sold: number;
  total_revenue: number; // centavos
  total_cost: number; // centavos
  total_profit: number; // centavos
  best_seller: BestSeller | null; // producto con más unidades vendidas
}

/**
 * Resumen de ventas de un periodo para un negocio.
 * - Filtra por `business_id` (INVARIANTE 1) y por `datetime` en [from, to).
 * - Suma valores ya congelados; no recalcula precios ni costos.
 */
export function salesSummary(
  sales: readonly Sale[],
  businessId: number,
  from: string,
  to: string,
): SalesSummary {
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();

  const inScope = sales.filter((s) => {
    if (s.business_id !== businessId) return false;
    const t = new Date(s.datetime).getTime();
    return t >= fromTime && t < toTime;
  });

  let units_sold = 0;
  let total_revenue = 0;
  let total_cost = 0;
  let total_profit = 0;
  const unitsByProduct = new Map<number, number>();

  for (const sale of inScope) {
    units_sold += sale.quantity;
    total_revenue += saleRevenue(sale);
    total_cost += saleCost(sale);
    total_profit += saleProfit(sale);
    unitsByProduct.set(sale.product_id, (unitsByProduct.get(sale.product_id) ?? 0) + sale.quantity);
  }

  let best_seller: BestSeller | null = null;
  for (const [product_id, units] of unitsByProduct) {
    if (
      best_seller === null ||
      units > best_seller.units ||
      // Empate: el product_id más bajo, para resultado determinista.
      (units === best_seller.units && product_id < best_seller.product_id)
    ) {
      best_seller = { product_id, units };
    }
  }

  return { business_id: businessId, from, to, units_sold, total_revenue, total_cost, total_profit, best_seller };
}
