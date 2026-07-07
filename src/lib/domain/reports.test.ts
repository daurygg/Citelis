import { describe, it, expect } from 'vitest';
import { weekSummary, sumFixedExpenses, netProfit, proratedFixedExpenses, expectedProfit } from './reports';
import type { Appointment, FixedExpense, Service } from './types';

function svc(partial: Partial<Service> = {}): Service {
  return {
    id: 1,
    business_id: 1,
    name: 'Servicio',
    price: 0,
    supply_cost: 0,
    cost_override: null,
    duration_min: 60,
    variable_price: false,
    ...partial,
  };
}

// Cita COMPLETED con valores ya congelados.
function completed(partial: Partial<Appointment>): Appointment {
  return {
    id: 1,
    business_id: 1,
    service_id: 1,
    client: 'Ana',
    datetime: '2026-06-29T10:00:00.000Z',
    status: 'COMPLETED',
    quoted_price: null,
    deposit: null,
    charged_price: 5000,
    actual_cost: 1000,
    profit: 4000,
    ...partial,
  };
}

const FROM = '2026-06-29T00:00:00.000Z'; // lunes
const TO = '2026-07-06T00:00:00.000Z'; // lunes siguiente (exclusivo)

describe('weekSummary', () => {
  // DoD Slice 3: las cifras cuadran con la suma manual del periodo
  it('suma ingresos, costos y ganancia neta de las citas COMPLETED del rango', () => {
    const appointments = [
      completed({ id: 1, service_id: 1, charged_price: 5000, actual_cost: 1000, profit: 4000 }),
      completed({ id: 2, service_id: 2, charged_price: 3000, actual_cost: 1200, profit: 1800 }),
    ];
    const r = weekSummary(appointments, 1, FROM, TO);
    expect(r.completed_count).toBe(2);
    expect(r.total_income).toBe(8000);
    expect(r.total_cost).toBe(2200);
    expect(r.gross_profit).toBe(5800);
  });

  // DoD Slice 3: solo cuenta citas COMPLETED dentro del rango
  it('ignora citas que no están COMPLETED', () => {
    const appointments = [
      completed({ id: 1, profit: 4000 }),
      completed({ id: 2, status: 'PENDING', profit: null }),
      completed({ id: 3, status: 'CANCELED', profit: null }),
      completed({ id: 4, status: 'IN_PROGRESS', profit: null }),
    ];
    const r = weekSummary(appointments, 1, FROM, TO);
    expect(r.completed_count).toBe(1);
    expect(r.gross_profit).toBe(4000);
  });

  it('ignora citas fuera del rango [from, to)', () => {
    const appointments = [
      completed({ id: 1, datetime: '2026-06-28T23:59:59.000Z' }), // antes de FROM
      completed({ id: 2, datetime: '2026-06-29T00:00:00.000Z' }), // == FROM (incluida)
      completed({ id: 3, datetime: '2026-07-06T00:00:00.000Z' }), // == TO (excluida)
      completed({ id: 4, datetime: '2026-07-02T12:00:00.000Z' }), // dentro
    ];
    const r = weekSummary(appointments, 1, FROM, TO);
    expect(r.completed_count).toBe(2); // ids 2 y 4
  });

  // INVARIANTE 1: filtrado por business_id
  it('solo cuenta citas del business_id indicado', () => {
    const appointments = [
      completed({ id: 1, business_id: 1, profit: 4000 }),
      completed({ id: 2, business_id: 2, profit: 9999 }), // otro tenant
    ];
    const r = weekSummary(appointments, 1, FROM, TO);
    expect(r.completed_count).toBe(1);
    expect(r.gross_profit).toBe(4000);
  });

  it('identifica el servicio más rentable del periodo', () => {
    const appointments = [
      completed({ id: 1, service_id: 1, profit: 1000 }),
      completed({ id: 2, service_id: 1, profit: 1000 }), // servicio 1 acumula 2000
      completed({ id: 3, service_id: 2, profit: 1500 }), // servicio 2 acumula 1500
    ];
    const r = weekSummary(appointments, 1, FROM, TO);
    expect(r.most_profitable_service).toEqual({ service_id: 1, profit: 2000 });
  });

  it('en empate de ganancia elige el service_id más bajo (determinista)', () => {
    const appointments = [
      completed({ id: 1, service_id: 2, profit: 1000 }),
      completed({ id: 2, service_id: 1, profit: 1000 }),
    ];
    const r = weekSummary(appointments, 1, FROM, TO);
    expect(r.most_profitable_service).toEqual({ service_id: 1, profit: 1000 });
  });

  it('sin citas en el rango devuelve ceros y servicio más rentable null', () => {
    const r = weekSummary([], 1, FROM, TO);
    expect(r.completed_count).toBe(0);
    expect(r.total_income).toBe(0);
    expect(r.total_cost).toBe(0);
    expect(r.gross_profit).toBe(0);
    expect(r.most_profitable_service).toBeNull();
  });
});

function expense(partial: Partial<FixedExpense>): FixedExpense {
  return { id: 1, business_id: 1, concept: 'Luz', amount: 0, period: 'MONTHLY', ...partial };
}

describe('sumFixedExpenses', () => {
  it('suma los gastos fijos del negocio indicado', () => {
    const expenses = [
      expense({ id: 1, business_id: 1, amount: 5000 }),
      expense({ id: 2, business_id: 1, amount: 3000 }),
    ];
    expect(sumFixedExpenses(expenses, 1)).toBe(8000);
  });

  // INVARIANTE 1: filtrado por business_id
  it('ignora gastos de otro negocio', () => {
    const expenses = [
      expense({ id: 1, business_id: 1, amount: 5000 }),
      expense({ id: 2, business_id: 2, amount: 9999 }),
    ];
    expect(sumFixedExpenses(expenses, 1)).toBe(5000);
  });

  it('sin gastos devuelve 0', () => {
    expect(sumFixedExpenses([], 1)).toBe(0);
  });
});

describe('netProfit', () => {
  it('neta = bruta − gastos fijos', () => {
    expect(netProfit(10000, 3000)).toBe(7000);
  });

  it('puede ser negativa si los gastos superan la ganancia', () => {
    expect(netProfit(2000, 5000)).toBe(-3000);
  });
});

describe('expectedProfit (proyección de citas abiertas)', () => {
  it('servicio de precio fijo: precio − costo', () => {
    const service = svc({ price: 5000, supply_cost: 1000 });
    expect(expectedProfit(completed({ quoted_price: null }), service)).toBe(4000);
  });

  it('servicio variable SIN precio acordado: null (no se proyecta)', () => {
    const service = svc({ price: 0, supply_cost: 2000, variable_price: true });
    expect(expectedProfit(completed({ quoted_price: null }), service)).toBeNull();
  });

  it('servicio variable CON precio acordado: usa el acordado', () => {
    const service = svc({ price: 0, supply_cost: 2000, variable_price: true });
    expect(expectedProfit(completed({ quoted_price: 7000 }), service)).toBe(5000);
  });
});

describe('proratedFixedExpenses', () => {
  it('un mes (30 días) devuelve el total mensual', () => {
    expect(proratedFixedExpenses(30000, 30)).toBe(30000);
  });

  it('una semana (7 días) devuelve ~1/4 del mes', () => {
    expect(proratedFixedExpenses(30000, 7)).toBe(7000);
  });

  it('un día devuelve 1/30 del mes', () => {
    expect(proratedFixedExpenses(30000, 1)).toBe(1000);
  });
});
