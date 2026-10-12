import { describe, it, expect } from 'vitest';
import { GRACE_DAYS, TRIAL_DAYS, subscriptionStatus } from './subscription';
import type { BusinessSubscription } from './types';

const DAY_MS = 86_400_000;

function sub(partial: Partial<BusinessSubscription> = {}): BusinessSubscription {
  return {
    business_id: 1,
    plan: 'standard',
    trial_ends_at: '2026-10-15T12:00:00Z',
    paid_until: null,
    exempt: false,
    ...partial,
  };
}

const at = (iso: string) => new Date(iso);

describe('subscriptionStatus', () => {
  it('usa 14 días de prueba y 7 de gracia', () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(GRACE_DAYS).toBe(7);
  });

  it('un negocio exento siempre está operativo, aunque todo haya vencido', () => {
    const s = subscriptionStatus(sub({ exempt: true, trial_ends_at: '2020-01-01T00:00:00Z' }), at('2026-10-12T12:00:00Z'));
    expect(s).toEqual({ status: 'EXEMPT', ends_at: null, days_left: 0, operational: true });
  });

  it('en prueba cuenta los días que faltan, redondeando hacia arriba', () => {
    const s = subscriptionStatus(sub(), at('2026-10-12T13:00:00Z'));
    expect(s.status).toBe('TRIAL');
    expect(s.ends_at).toBe('2026-10-15T12:00:00Z');
    expect(s.days_left).toBe(3);
    expect(s.operational).toBe(true);
  });

  it('con un pago vigente está al día, aunque la prueba siga corriendo', () => {
    const s = subscriptionStatus(sub({ paid_until: '2026-11-12T12:00:00Z' }), at('2026-10-12T12:00:00Z'));
    expect(s.status).toBe('ACTIVE');
    expect(s.ends_at).toBe('2026-11-12T12:00:00Z');
    expect(s.days_left).toBe(31);
  });

  it('un pago que vence antes que la prueba no le quita los días de prueba', () => {
    const s = subscriptionStatus(sub({ paid_until: '2026-10-13T00:00:00Z' }), at('2026-10-14T00:00:00Z'));
    expect(s.status).toBe('TRIAL');
    expect(s.ends_at).toBe('2026-10-15T12:00:00Z');
  });

  it('justo al vencer la prueba entra en gracia con 7 días para el bloqueo', () => {
    const s = subscriptionStatus(sub(), at('2026-10-15T12:00:00Z'));
    expect(s.status).toBe('GRACE');
    expect(s.ends_at).toBe('2026-10-22T12:00:00Z');
    expect(s.days_left).toBe(7);
    expect(s.operational).toBe(true);
  });

  it('al vencer un pago también entra en gracia', () => {
    const s = subscriptionStatus(
      sub({ trial_ends_at: '2026-09-01T00:00:00Z', paid_until: '2026-10-10T00:00:00Z' }),
      at('2026-10-12T00:00:00Z'),
    );
    expect(s.status).toBe('GRACE');
    expect(s.days_left).toBe(5);
  });

  it('el último instante de la gracia sigue operativo', () => {
    const end = Date.parse('2026-10-15T12:00:00Z') + GRACE_DAYS * DAY_MS;
    const s = subscriptionStatus(sub(), new Date(end - 1));
    expect(s.status).toBe('GRACE');
    expect(s.days_left).toBe(1);
  });

  it('pasada la gracia queda bloqueado', () => {
    const end = Date.parse('2026-10-15T12:00:00Z') + GRACE_DAYS * DAY_MS;
    const s = subscriptionStatus(sub(), new Date(end));
    expect(s).toEqual({ status: 'BLOCKED', ends_at: null, days_left: 0, operational: false });
  });

  it('un pago nuevo saca del bloqueo', () => {
    const s = subscriptionStatus(
      sub({ trial_ends_at: '2026-01-01T00:00:00Z', paid_until: '2026-11-12T00:00:00Z' }),
      at('2026-10-12T00:00:00Z'),
    );
    expect(s.status).toBe('ACTIVE');
    expect(s.operational).toBe(true);
  });

  it('rechaza fechas inválidas en lugar de adivinar', () => {
    expect(() => subscriptionStatus(sub({ trial_ends_at: 'mañana' }), at('2026-10-12T00:00:00Z'))).toThrow();
  });
});
