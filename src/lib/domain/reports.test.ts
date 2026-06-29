import { describe, it, expect } from 'vitest';
import { weekSummary } from './reports';
import type { Appointment } from './types';

// Cita COMPLETED con valores ya congelados.
function completed(partial: Partial<Appointment>): Appointment {
  return {
    id: 1,
    business_id: 1,
    service_id: 1,
    client: 'Ana',
    datetime: '2026-06-29T10:00:00.000Z',
    status: 'COMPLETED',
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
    expect(r.net_profit).toBe(5800);
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
    expect(r.net_profit).toBe(4000);
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
    expect(r.net_profit).toBe(4000);
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
    expect(r.net_profit).toBe(0);
    expect(r.most_profitable_service).toBeNull();
  });
});
