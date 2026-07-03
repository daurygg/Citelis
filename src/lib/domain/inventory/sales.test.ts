import { describe, it, expect } from 'vitest';
import { saleRevenue, saleCost, saleProfit, canSell, salesSummary } from './sales';
import type { Sale } from './types';

function sale(partial: Partial<Sale>): Sale {
  return {
    id: 1,
    business_id: 1,
    product_id: 1,
    quantity: 1,
    unit_price: 5000,
    unit_cost: 2000,
    datetime: '2026-07-02T10:00:00.000Z',
    ...partial,
  };
}

describe('cálculos de una venta', () => {
  it('revenue = precio unitario × cantidad', () => {
    expect(saleRevenue(sale({ unit_price: 5000, quantity: 3 }))).toBe(15000);
  });
  it('cost = costo unitario × cantidad', () => {
    expect(saleCost(sale({ unit_cost: 2000, quantity: 3 }))).toBe(6000);
  });
  it('profit = (precio − costo) × cantidad', () => {
    expect(saleProfit(sale({ unit_price: 5000, unit_cost: 2000, quantity: 3 }))).toBe(9000);
  });
});

describe('canSell', () => {
  it('permite vender si hay stock suficiente', () => {
    expect(canSell(10, 3)).toBe(true);
    expect(canSell(3, 3)).toBe(true);
  });
  it('rechaza si no hay stock o cantidad inválida', () => {
    expect(canSell(2, 3)).toBe(false);
    expect(canSell(5, 0)).toBe(false);
    expect(canSell(5, -1)).toBe(false);
  });
});

const FROM = '2026-07-01T00:00:00.000Z';
const TO = '2026-07-08T00:00:00.000Z';

describe('salesSummary', () => {
  it('suma unidades, ingresos, costos y ganancia del periodo', () => {
    const sales = [
      sale({ id: 1, product_id: 1, quantity: 2, unit_price: 5000, unit_cost: 2000 }), // rev 10000, prof 6000
      sale({ id: 2, product_id: 2, quantity: 1, unit_price: 3000, unit_cost: 1000 }), // rev 3000, prof 2000
    ];
    const r = salesSummary(sales, 1, FROM, TO);
    expect(r.units_sold).toBe(3);
    expect(r.total_revenue).toBe(13000);
    expect(r.total_cost).toBe(5000);
    expect(r.total_profit).toBe(8000);
  });

  it('filtra por business_id (INVARIANTE 1)', () => {
    const sales = [sale({ id: 1, business_id: 1 }), sale({ id: 2, business_id: 2, quantity: 9 })];
    expect(salesSummary(sales, 1, FROM, TO).units_sold).toBe(1);
  });

  it('ignora ventas fuera del rango [from, to)', () => {
    const sales = [
      sale({ id: 1, datetime: '2026-06-30T23:59:59.000Z' }), // antes
      sale({ id: 2, datetime: '2026-07-08T00:00:00.000Z' }), // == TO (excluida)
      sale({ id: 3, datetime: '2026-07-03T12:00:00.000Z' }), // dentro
    ];
    expect(salesSummary(sales, 1, FROM, TO).units_sold).toBe(1);
  });

  it('identifica el producto más vendido (por unidades)', () => {
    const sales = [
      sale({ id: 1, product_id: 1, quantity: 2 }),
      sale({ id: 2, product_id: 2, quantity: 5 }),
      sale({ id: 3, product_id: 1, quantity: 1 }),
    ];
    expect(salesSummary(sales, 1, FROM, TO).best_seller).toEqual({ product_id: 2, units: 5 });
  });

  it('sin ventas devuelve ceros y best_seller null', () => {
    const r = salesSummary([], 1, FROM, TO);
    expect(r.units_sold).toBe(0);
    expect(r.total_profit).toBe(0);
    expect(r.best_seller).toBeNull();
  });
});
