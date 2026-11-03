import { describe, it, expect } from 'vitest';
import type { Appointment, AppointmentPayment } from './types';
import { salesByClient } from './clientSales';

function apt(over: Partial<Appointment> & { id: number }): Appointment {
  return {
    business_id: 1,
    service_id: 1,
    client: 'Ana',
    datetime: '2026-10-12T10:00',
    status: 'COMPLETED',
    quoted_price: null,
    deposit: null,
    charged_price: 5000,
    actual_cost: 1000,
    profit: 4000,
    ...over,
  };
}

let seq = 0;
function pay(appointment_id: number, amount: number, over: Partial<AppointmentPayment> = {}): AppointmentPayment {
  seq += 1;
  return { id: seq, business_id: 1, appointment_id, amount, method: 'cash', kind: 'charge', paid_at: '2026-10-12T10:00:00Z', ...over };
}

const FROM = '2026-10-01T00:00:00';
const TO = '2026-11-01T00:00:00';

describe('salesByClient', () => {
  it('suma por clienta citas, vendido, pagado, debe y ganancia', () => {
    const appointments = [apt({ id: 1 }), apt({ id: 2, datetime: '2026-10-20T09:00', charged_price: 3000, profit: 2000 })];
    const payments = [pay(1, 5000), pay(2, 1000)];
    expect(salesByClient(appointments, payments, 1, FROM, TO)).toEqual([
      { key: 'ana', client: 'Ana', visits: 2, sold: 8000, paid: 6000, owes: 2000, profit: 6000 },
    ]);
  });

  it('agrupa el mismo nombre sin importar mayúsculas, acentos ni espacios y muestra la grafía más reciente', () => {
    const appointments = [
      apt({ id: 1, client: 'maria  perez', datetime: '2026-10-02T10:00' }),
      apt({ id: 2, client: 'María Pérez', datetime: '2026-10-25T10:00' }),
    ];
    const [row] = salesByClient(appointments, [], 1, FROM, TO);
    expect(row.client).toBe('María Pérez');
    expect(row.visits).toBe(2);
  });

  it('cuenta solo citas completadas del negocio dentro del periodo [desde, hasta)', () => {
    const appointments = [
      apt({ id: 1 }),
      apt({ id: 2, status: 'PENDING', charged_price: null, profit: null }),
      apt({ id: 3, business_id: 2 }),
      apt({ id: 4, datetime: '2026-09-30T23:00' }),
      apt({ id: 5, datetime: '2026-11-01T00:00' }),
    ];
    const rows = salesByClient(appointments, [], 1, FROM, TO);
    expect(rows).toHaveLength(1);
    expect(rows[0].visits).toBe(1);
  });

  it('ignora pagos de otro negocio y nunca deja una deuda negativa', () => {
    const appointments = [apt({ id: 1 })];
    const payments = [pay(1, 6000), pay(1, 9999, { business_id: 2 })];
    const [row] = salesByClient(appointments, payments, 1, FROM, TO);
    expect(row.paid).toBe(6000);
    expect(row.owes).toBe(0);
  });

  it('ordena de la que más compró a la que menos; empate por nombre', () => {
    const appointments = [
      apt({ id: 1, client: 'Bea', charged_price: 1000 }),
      apt({ id: 2, client: 'Carla', charged_price: 9000 }),
      apt({ id: 3, client: 'Ana', charged_price: 1000 }),
    ];
    expect(salesByClient(appointments, [], 1, FROM, TO).map((r) => r.client)).toEqual(['Carla', 'Ana', 'Bea']);
  });

  it('sin citas completadas en el periodo devuelve una lista vacía', () => {
    expect(salesByClient([], [], 1, FROM, TO)).toEqual([]);
  });
});
