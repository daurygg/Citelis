import { describe, it, expect } from 'vitest';
import { unitCost, suppliesCost, effectiveCost, profit } from './costs';
import type { Supply } from './types';

// Helper: arma un insumo con valores en centavos.
function supply(partial: Partial<Supply>): Supply {
  return {
    id: 1,
    service_id: 1,
    name: 'insumo',
    purchase_price: 0,
    servings: 1,
    ...partial,
  };
}

describe('unitCost', () => {
  // DoD: costo_unitario = precio_compra / rendimiento
  // DoD Slice 2: "$40, alcanza 8" → costo unitario $5
  it('divide precio de compra entre rendimiento (4000¢ / 8 = 500¢)', () => {
    expect(unitCost(supply({ purchase_price: 4000, servings: 8 }))).toBe(500);
  });

  it('redondea a centavos enteros', () => {
    // 1000 / 3 = 333.33… → 333
    expect(unitCost(supply({ purchase_price: 1000, servings: 3 }))).toBe(333);
  });

  // DoD Slice 0: manejo de rendimiento = 0 (no dividir por cero)
  it('devuelve 0 cuando servings = 0 (no divide por cero)', () => {
    expect(unitCost(supply({ purchase_price: 5000, servings: 0 }))).toBe(0);
  });

  it('devuelve 0 cuando servings es negativo', () => {
    expect(unitCost(supply({ purchase_price: 5000, servings: -2 }))).toBe(0);
  });
});

describe('suppliesCost', () => {
  // DoD Slice 0: suma de insumos correcta
  it('suma los costos unitarios de todos los insumos', () => {
    const supplies = [
      supply({ id: 1, purchase_price: 4000, servings: 8 }), // 500
      supply({ id: 2, purchase_price: 1200, servings: 4 }), // 300
      supply({ id: 3, purchase_price: 1000, servings: 5 }), // 200
    ];
    expect(suppliesCost(supplies)).toBe(1000);
  });

  it('una lista vacía cuesta 0', () => {
    expect(suppliesCost([])).toBe(0);
  });
});

describe('effectiveCost', () => {
  // DoD Slice 0 / Slice 2: el override gana sobre el cache
  it('usa el cache supply_cost cuando no hay override', () => {
    expect(effectiveCost({ supply_cost: 1000, cost_override: null })).toBe(1000);
  });

  it('el override gana sobre el cache cuando existe', () => {
    expect(effectiveCost({ supply_cost: 1000, cost_override: 700 })).toBe(700);
  });

  it('un override de 0 también gana sobre el cache', () => {
    expect(effectiveCost({ supply_cost: 1000, cost_override: 0 })).toBe(0);
  });
});

describe('profit', () => {
  it('ganancia = precio cobrado − costo real', () => {
    expect(profit(5000, 1000)).toBe(4000);
  });

  it('puede ser negativa (pérdida)', () => {
    expect(profit(800, 1000)).toBe(-200);
  });
});
