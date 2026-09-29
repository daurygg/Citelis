import { describe, it, expect } from 'vitest';
import {
  unitCost,
  suppliesCost,
  effectiveCost,
  profit,
  priceForServices,
  allocateProportionally,
} from './costs';
import type { Supply, Service } from './types';

function service(partial: Partial<Service> = {}): Service {
  return {
    id: 1,
    business_id: 1,
    name: 'Servicio',
    price: 5000,
    supply_cost: 1000,
    cost_override: null,
    duration_min: 60,
    variable_price: false,
    ...partial,
  };
}

// Helper: arma un insumo con valores en centavos.
function supply(partial: Partial<Supply>): Supply {
  return {
    id: 1,
    business_id: 1,
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

describe('priceForServices', () => {
  // D4: el precio de un CONJUNTO se calcula en un solo sitio. Hoy es una suma;
  // cuando entren los combos, este es el único lugar que cambia.
  it('suma los precios de lista', () => {
    const r = priceForServices([service({ id: 1, price: 500000 }), service({ id: 2, price: 400000 })]);
    expect(r.total).toBe(900000);
    expect(r.needsPrice).toEqual([]);
  });

  it('un conjunto vacío cuesta cero', () => {
    expect(priceForServices([]).total).toBe(0);
  });

  it('un servicio de precio variable SIN precio no se cuenta como cero: se reporta', () => {
    // Contarlo como 0 sería cobrar de menos en silencio, que es peor que
    // negarse a cerrar la cuenta.
    const trenzas = service({ id: 2, name: 'Trenzas', price: 0, variable_price: true });
    const r = priceForServices([service({ id: 1, price: 150000 }), trenzas]);
    expect(r.total).toBe(150000);
    expect(r.needsPrice.map((s) => s.id)).toEqual([2]);
  });

  it('un servicio de precio variable CON precio puesto sí se cuenta', () => {
    const trenzas = service({ id: 2, price: 0, variable_price: true });
    const r = priceForServices([service({ id: 1, price: 150000 }), trenzas], new Map([[2, 250000]]));
    expect(r.total).toBe(400000);
    expect(r.needsPrice).toEqual([]);
  });

  it('devuelve el precio de cada servicio, que es el peso del reparto', () => {
    const r = priceForServices([service({ id: 1, price: 500000 }), service({ id: 2, price: 400000 })]);
    expect(r.lines).toEqual([
      { service_id: 1, price: 500000 },
      { service_id: 2, price: 400000 },
    ]);
  });
});

describe('allocateProportionally', () => {
  // El caso que pidió el usuario: micropigmentación 5.000 + labios 4.000, pero
  // juntos 8.000. Repartir 8.000 a prorrata de 5.000/4.000 da decimales.
  it('reparte a prorrata y la suma es EXACTAMENTE el total', () => {
    const partes = allocateProportionally(800000, [500000, 400000]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(800000);
    expect(partes).toEqual([444444, 355556]);
  });

  it('ningún céntimo se crea ni se pierde, con números que no dividen redondo', () => {
    const casos: Array<[number, number[]]> = [
      [100, [1, 1, 1]],
      [1, [1, 1]],
      [999999, [7, 11, 13]],
      [12345, [1, 2, 3, 4]],
      [7, [1, 1, 1, 1, 1, 1]],
    ];
    for (const [total, pesos] of casos) {
      const partes = allocateProportionally(total, pesos);
      expect(partes.reduce((a, b) => a + b, 0)).toBe(total);
      expect(partes.length).toBe(pesos.length);
      expect(partes.every((p) => Number.isInteger(p))).toBe(true);
    }
  });

  it('con un solo servicio le toca todo', () => {
    expect(allocateProportionally(123456, [999])).toEqual([123456]);
  });

  it('total cero reparte ceros', () => {
    expect(allocateProportionally(0, [500, 300])).toEqual([0, 0]);
  });

  it('pesos todos en cero reparte en partes iguales, sin dividir por cero', () => {
    // Una cita regalada, o servicios de precio 0: a prorrata no significa nada,
    // así que se reparte por igual. Lo que NO puede pasar es un NaN.
    const partes = allocateProportionally(1000, [0, 0, 0]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(partes.every((p) => Number.isInteger(p))).toBe(true);
  });

  it('sin servicios no reparte nada', () => {
    expect(allocateProportionally(1000, [])).toEqual([]);
  });
});
