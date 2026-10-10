import { describe, it, expect } from 'vitest';
import type { Appointment, AppointmentPayment, PaymentMethod } from './types';
import {
  PAYMENT_METHODS,
  appointmentBalance,
  buildPaymentPlan,
  checkPaymentAmount,
  creditsByClient,
  incomeByMethod,
  normalizeClientKey,
  paidTotal,
  paymentMethodLabel,
  paymentStatus,
} from './payments';

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
function pay(appointment_id: number, amount: number, method: PaymentMethod | null = 'cash', over: Partial<AppointmentPayment> = {}): AppointmentPayment {
  seq += 1;
  return { id: seq, business_id: 1, appointment_id, amount, method, kind: 'charge', paid_at: '2026-10-12T10:00:00Z', ...over };
}

describe('paymentMethodLabel', () => {
  it('habla como la dueña', () => {
    expect(paymentMethodLabel('cash')).toBe('Efectivo');
    expect(paymentMethodLabel('transfer')).toBe('Transferencia');
    expect(paymentMethodLabel('card')).toBe('Tarjeta');
  });
  it('un abono histórico no tiene vía y no se inventa una', () => {
    expect(paymentMethodLabel(null)).toBe('Sin vía registrada');
  });
  it('ofrece las tres vías en orden', () => {
    expect(PAYMENT_METHODS).toEqual(['cash', 'transfer', 'card']);
  });
});

describe('paidTotal y saldo', () => {
  it('suma solo los pagos de esa cita y de ese negocio (INVARIANTE 1)', () => {
    const payments = [pay(1, 1000), pay(1, 500, 'card'), pay(2, 9000), pay(1, 7000, 'cash', { business_id: 2 })];
    expect(paidTotal(payments, 1, 1)).toBe(1500);
    expect(paidTotal(payments, 2, 1)).toBe(9000);
    expect(paidTotal([], 1, 1)).toBe(0);
  });

  it('el saldo es lo cobrado menos lo pagado y nunca es negativo', () => {
    expect(appointmentBalance(5000, 2000)).toBe(3000);
    expect(appointmentBalance(5000, 5000)).toBe(0);
    expect(appointmentBalance(5000, 6000)).toBe(0);
    expect(appointmentBalance(0, 0)).toBe(0);
  });
});

describe('paymentStatus', () => {
  it('una cita sin cobrar todavía no tiene saldo', () => {
    const open = apt({ id: 1, status: 'PENDING', charged_price: null });
    expect(paymentStatus(open, [pay(1, 1000, 'cash', { kind: 'deposit' })], 1)).toEqual({ kind: 'NOT_CHARGED', paid: 1000, balance: 0 });
  });
  it('pagada completa', () => {
    expect(paymentStatus(apt({ id: 1 }), [pay(1, 5000)], 1)).toEqual({ kind: 'PAID', paid: 5000, balance: 0 });
  });
  it('con saldo queda a crédito', () => {
    expect(paymentStatus(apt({ id: 1 }), [pay(1, 2000)], 1)).toEqual({ kind: 'CREDIT', paid: 2000, balance: 3000 });
    expect(paymentStatus(apt({ id: 1 }), [], 1)).toEqual({ kind: 'CREDIT', paid: 0, balance: 5000 });
  });
  it('un cobro en cero queda pagado', () => {
    expect(paymentStatus(apt({ id: 1, charged_price: 0 }), [], 1)).toEqual({ kind: 'PAID', paid: 0, balance: 0 });
  });
});

describe('checkPaymentAmount', () => {
  it('acepta un monto positivo que no pasa del saldo', () => {
    expect(checkPaymentAmount(3000, 3000)).toEqual({ ok: true });
    expect(checkPaymentAmount(1, 3000)).toEqual({ ok: true });
  });
  it('rechaza cero, negativos y no enteros', () => {
    expect(checkPaymentAmount(0, 3000)).toEqual({ ok: false, reason: 'Escribe cuánto pagó.' });
    expect(checkPaymentAmount(-5, 3000)).toEqual({ ok: false, reason: 'Escribe cuánto pagó.' });
    expect(checkPaymentAmount(10.5, 3000)).toEqual({ ok: false, reason: 'Escribe cuánto pagó.' });
  });
  it('rechaza pasarse del saldo', () => {
    expect(checkPaymentAmount(3001, 3000)).toEqual({ ok: false, reason: 'Eso es más de lo que debe.' });
  });
});

describe('buildPaymentPlan (pantalla de cobro)', () => {
  it('una fila en efectivo por el saldo es lo normal', () => {
    const plan = buildPaymentPlan([{ amount: '30.00', method: 'cash' }], 5000, 2000);
    expect(plan).toEqual({ payments: [{ amount: 3000, method: 'cash' }], paid: 3000, credit: 0, overpaid: false, invalid: false });
  });
  it('varias filas con vías distintas', () => {
    const plan = buildPaymentPlan(
      [
        { amount: '10.00', method: 'cash' },
        { amount: '20.00', method: 'transfer' },
      ],
      5000,
      2000,
    );
    expect(plan.payments).toEqual([
      { amount: 1000, method: 'cash' },
      { amount: 2000, method: 'transfer' },
    ]);
    expect(plan.credit).toBe(0);
  });
  it('pagar menos deja el resto a crédito', () => {
    const plan = buildPaymentPlan([{ amount: '10.00', method: 'cash' }], 5000, 0);
    expect(plan.credit).toBe(4000);
    expect(plan.overpaid).toBe(false);
  });
  it('sin pagos todo queda a crédito (menos el abono)', () => {
    expect(buildPaymentPlan([], 5000, 2000)).toMatchObject({ payments: [], credit: 3000, overpaid: false });
  });
  it('las filas vacías se ignoran', () => {
    const plan = buildPaymentPlan([{ amount: '', method: 'cash' }, { amount: '10.00', method: 'card' }], 5000, 0);
    expect(plan.payments).toEqual([{ amount: 1000, method: 'card' }]);
    expect(plan.invalid).toBe(false);
  });
  it('un texto que no es dinero (o es cero) es inválido', () => {
    expect(buildPaymentPlan([{ amount: 'abc', method: 'cash' }], 5000, 0).invalid).toBe(true);
    expect(buildPaymentPlan([{ amount: '0', method: 'cash' }], 5000, 0).invalid).toBe(true);
  });
  it('pasarse del total es sobrepago, lo único que bloquea', () => {
    const plan = buildPaymentPlan([{ amount: '40.00', method: 'cash' }], 5000, 2000);
    expect(plan.overpaid).toBe(true);
    expect(plan.credit).toBe(0);
  });
  it('el abono ya pagado cuenta para el tope', () => {
    expect(buildPaymentPlan([{ amount: '30.01', method: 'cash' }], 5000, 2000).overpaid).toBe(true);
    expect(buildPaymentPlan([{ amount: '30.00', method: 'cash' }], 5000, 2000).overpaid).toBe(false);
  });
});

describe('incomeByMethod', () => {
  const appointments = [
    apt({ id: 1, charged_price: 5000 }),
    apt({ id: 2, charged_price: 4000, datetime: '2026-10-13T10:00' }),
    apt({ id: 3, charged_price: 9000, datetime: '2026-11-01T10:00' }), // fuera del periodo
    apt({ id: 4, status: 'PENDING', charged_price: null, datetime: '2026-10-12T12:00' }), // sin cobrar
    apt({ id: 5, business_id: 2, charged_price: 7000 }), // otro negocio
  ];
  const payments = [
    pay(1, 2000, 'cash', { kind: 'deposit' }),
    pay(1, 3000, 'transfer'),
    pay(2, 1000, 'card'),
    pay(2, 500, null, { kind: 'deposit' }),
    pay(3, 9000, 'cash'),
    pay(4, 800, 'cash', { kind: 'deposit' }),
    pay(5, 7000, 'cash', { business_id: 2 }),
  ];
  const report = incomeByMethod(appointments, payments, 1, '2026-10-01T00:00', '2026-11-01T00:00');

  it('suma lo pagado por vía de las citas cobradas del periodo', () => {
    expect(report.by_method).toEqual({ cash: 2000, transfer: 3000, card: 1000, unknown: 500 });
    expect(report.total_paid).toBe(6500);
  });
  it('muestra lo cobrado y lo que quedó a crédito, que no son lo mismo que lo pagado', () => {
    expect(report.total_charged).toBe(9000);
    expect(report.pending_credit).toBe(2500);
    expect(report.total_paid + report.pending_credit).toBe(report.total_charged);
  });
  it('un periodo sin citas da ceros', () => {
    expect(incomeByMethod([], [], 1, '2026-10-01', '2026-11-01')).toEqual({
      by_method: { cash: 0, transfer: 0, card: 0, unknown: 0 },
      total_paid: 0,
      total_charged: 0,
      pending_credit: 0,
    });
  });
});

describe('normalizeClientKey', () => {
  it('ignora mayúsculas, acentos y espacios de más', () => {
    expect(normalizeClientKey('  María   Pérez ')).toBe('maria perez');
    expect(normalizeClientKey('maria perez')).toBe('maria perez');
  });
});

describe('creditsByClient', () => {
  const appointments = [
    apt({ id: 1, client: 'María Pérez', datetime: '2026-10-10T10:00', charged_price: 5000, client_phone: '809-555-0001' }),
    apt({ id: 2, client: ' maria  perez', datetime: '2026-10-12T10:00', charged_price: 4000 }),
    apt({ id: 3, client: 'Rosa', datetime: '2026-10-11T10:00', charged_price: 3000 }),
    apt({ id: 4, client: 'Ana', charged_price: 2000 }), // saldada
    apt({ id: 5, client: 'Eva', status: 'PENDING', charged_price: null }), // sin cobrar
    apt({ id: 6, client: 'Ajena', business_id: 2, charged_price: 8000 }),
  ];
  const payments = [pay(1, 1000), pay(4, 2000), pay(6, 1, 'cash', { business_id: 2 })];
  const credits = creditsByClient(appointments, payments, 1);

  it('agrupa por cliente normalizado y suma el saldo', () => {
    const maria = credits.find((c) => c.key === 'maria perez');
    expect(maria?.balance).toBe(4000 + 4000);
    expect(maria?.appointments.map((a) => a.appointment.id)).toEqual([2, 1]); // la más reciente primero
  });
  it('trae el nombre y el teléfono cuando los hay', () => {
    const maria = credits.find((c) => c.key === 'maria perez');
    expect(maria?.client).toBe('maria perez'); // grafía de la cita más reciente, sin espacios de más
    expect(maria?.phone).toBe('809-555-0001');
  });
  it('ordena por saldo, el mayor primero, y omite saldadas, sin cobrar y de otro negocio', () => {
    expect(credits.map((c) => c.key)).toEqual(['maria perez', 'rosa']);
    expect(credits.reduce((s, c) => s + c.balance, 0)).toBe(11000);
  });
  it('cada cita trae su saldo y lo pagado', () => {
    const rosa = credits.find((c) => c.key === 'rosa');
    expect(rosa?.appointments).toEqual([{ appointment: expect.objectContaining({ id: 3 }), paid: 0, balance: 3000 }]);
  });
});
