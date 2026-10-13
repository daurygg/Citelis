import { describe, it, expect } from 'vitest';
import {
  parseAdminBusinesses,
  parseAmountToCents,
  paymentMethodLabel,
  subscriptionStatusLabel,
  validatePaymentForm,
} from './subscriptionAdmin';

const adminRow = {
  business_id: 3,
  name: 'Studio Ana',
  slug: 'studio-ana',
  plan: 'standard',
  trial_ends_at: '2026-10-01T00:00:00+00:00',
  paid_until: '2026-11-01T00:00:00+00:00',
  exempt: false,
  status: 'ACTIVE',
  last_payment_at: '2026-10-02T15:00:00+00:00',
  last_payment_cents: 150000,
};

describe('parseAdminBusinesses', () => {
  it('mapea las filas de admin_list_businesses()', () => {
    expect(parseAdminBusinesses([adminRow])).toEqual([adminRow]);
  });

  it('el bigint puede llegar como texto y se vuelve número', () => {
    const [r] = parseAdminBusinesses([{ ...adminRow, business_id: '3', last_payment_cents: '150000' }]);
    expect(r.business_id).toBe(3);
    expect(r.last_payment_cents).toBe(150000);
  });

  it('acepta campos nulos (sin pagos ni suscripción)', () => {
    const [r] = parseAdminBusinesses([
      { ...adminRow, plan: null, paid_until: null, status: null, last_payment_at: null, last_payment_cents: null, trial_ends_at: null },
    ]);
    expect(r.status).toBeNull();
    expect(r.last_payment_cents).toBeNull();
  });

  it('lista vacía o null da lista vacía', () => {
    expect(parseAdminBusinesses([])).toEqual([]);
    expect(parseAdminBusinesses(null)).toEqual([]);
  });

  it('lanza si una fila no se entiende', () => {
    expect(() => parseAdminBusinesses([{ ...adminRow, name: 5 }])).toThrow();
    expect(() => parseAdminBusinesses([{ ...adminRow, status: 'RARO' }])).toThrow();
    expect(() => parseAdminBusinesses('x')).toThrow();
  });
});

describe('etiquetas en lenguaje de la dueña', () => {
  it('traduce cada estado', () => {
    expect(subscriptionStatusLabel('TRIAL')).toBe('En prueba');
    expect(subscriptionStatusLabel('ACTIVE')).toBe('Al día');
    expect(subscriptionStatusLabel('GRACE')).toBe('Vencido, con plazo');
    expect(subscriptionStatusLabel('BLOCKED')).toBe('Bloqueado');
    expect(subscriptionStatusLabel('EXEMPT')).toBe('Exento');
    expect(subscriptionStatusLabel(null)).toBe('Sin plan');
  });

  it('traduce cada vía de pago', () => {
    expect(paymentMethodLabel('TRANSFER')).toBe('Transferencia');
    expect(paymentMethodLabel('CASH')).toBe('Efectivo');
    expect(paymentMethodLabel('CARD')).toBe('Tarjeta');
    expect(paymentMethodLabel('OTHER')).toBe('Otro');
  });
});

describe('parseAmountToCents', () => {
  it('convierte RD$ a centavos enteros', () => {
    expect(parseAmountToCents('1500')).toBe(150000);
    expect(parseAmountToCents('1,500.50')).toBe(150050);
    expect(parseAmountToCents('RD$ 99.9')).toBe(9990);
    expect(parseAmountToCents('0.07')).toBe(7);
  });

  it('evita errores de coma flotante', () => {
    expect(parseAmountToCents('1.15')).toBe(115);
    expect(parseAmountToCents('19.99')).toBe(1999);
  });

  it('devuelve null si no es un monto válido', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('-5')).toBeNull();
    expect(parseAmountToCents('1.234')).toBeNull();
    expect(parseAmountToCents('1,5')).toBeNull();
  });
});

const form = (p = {}) => ({ amount: '1500', paid_until: '2026-12-01', method: 'TRANSFER', note: ' pago de noviembre ', ...p });
const current = '2026-11-01T00:00:00+00:00';

describe('validatePaymentForm', () => {
  it('acepta un formulario válido y arma los argumentos de la RPC', () => {
    expect(validatePaymentForm(form(), current)).toEqual({
      ok: true,
      value: {
        amount_cents: 150000,
        paid_until: '2026-12-01T23:59:59-04:00',
        method: 'TRANSFER',
        note: 'pago de noviembre',
      },
    });
  });

  it('la nota vacía viaja como null', () => {
    const r = validatePaymentForm(form({ note: '   ' }), current);
    expect(r.ok && r.value.note).toBeNull();
  });

  it('exige monto mayor que cero', () => {
    for (const amount of ['', '0', '0.00', 'abc']) {
      const r = validatePaymentForm(form({ amount }), current);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.errors.amount).toBeTruthy();
    }
  });

  it('exige la fecha hasta la que queda pagado', () => {
    for (const paid_until of ['', '2026-13-40', 'mañana']) {
      const r = validatePaymentForm(form({ paid_until }), current);
      expect(!r.ok && r.errors.paid_until).toBeTruthy();
    }
  });

  it('la fecha debe ser posterior a la actual', () => {
    // Se compara el instante (fin del día elegido), igual que el servidor.
    const before = validatePaymentForm(form({ paid_until: '2026-10-30' }), current);
    expect(!before.ok && before.errors.paid_until).toBeTruthy();
    const later = validatePaymentForm(form({ paid_until: '2026-11-01' }), current);
    expect(later.ok).toBe(true);
  });

  it('sin pago previo (null) cualquier fecha válida sirve', () => {
    expect(validatePaymentForm(form({ paid_until: '2026-01-01' }), null).ok).toBe(true);
  });

  it('exige una vía de pago válida', () => {
    const r = validatePaymentForm(form({ method: 'BITCOIN' }), current);
    expect(!r.ok && r.errors.method).toBeTruthy();
  });

  it('reporta todos los errores a la vez', () => {
    const r = validatePaymentForm({ amount: '', paid_until: '', method: '', note: '' }, current);
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['amount', 'method', 'paid_until']);
  });
});
