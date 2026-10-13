import { describe, it, expect } from 'vitest';
import { parseMySubscription, subscriptionNotice } from './subscriptionView';
import type { SubscriptionState } from './types';

const row = {
  business_id: 7,
  status: 'TRIAL',
  operational: true,
  days_left: 5,
  ends_at: '2026-10-18T12:00:00+00:00',
  trial_ends_at: '2026-10-18T12:00:00+00:00',
  paid_until: null,
  exempt: false,
};

describe('parseMySubscription', () => {
  it('convierte la fila de my_subscription() en el estado del dominio', () => {
    expect(parseMySubscription([row])).toEqual({
      status: 'TRIAL',
      ends_at: '2026-10-18T12:00:00+00:00',
      days_left: 5,
      operational: true,
    });
  });

  it('devuelve null si la respuesta viene vacía (no es miembro o sin suscripción)', () => {
    expect(parseMySubscription([])).toBeNull();
    expect(parseMySubscription(null)).toBeNull();
  });

  it('acepta una sola fila suelta además de la lista', () => {
    expect(parseMySubscription(row)?.status).toBe('TRIAL');
  });

  it('acepta ends_at nulo (BLOCKED y EXEMPT)', () => {
    const blocked = { ...row, status: 'BLOCKED', operational: false, days_left: 0, ends_at: null };
    expect(parseMySubscription([blocked])).toEqual({ status: 'BLOCKED', ends_at: null, days_left: 0, operational: false });
  });

  it('rechaza una forma inesperada devolviendo null', () => {
    expect(parseMySubscription([{ ...row, status: 'ALGO' }])).toBeNull();
    expect(parseMySubscription([{ ...row, days_left: 'x' }])).toBeNull();
    expect(parseMySubscription([{ ...row, operational: 'si' }])).toBeNull();
    expect(parseMySubscription('texto')).toBeNull();
  });
});

const state = (p: Partial<SubscriptionState>): SubscriptionState => ({
  status: 'TRIAL',
  ends_at: '2026-10-18T12:00:00Z',
  days_left: 5,
  operational: true,
  ...p,
});

describe('subscriptionNotice', () => {
  it('no muestra nada sin estado (falla abierta), al día ni exento', () => {
    expect(subscriptionNotice(null)).toEqual({ kind: 'none' });
    expect(subscriptionNotice(state({ status: 'ACTIVE' }))).toEqual({ kind: 'none' });
    expect(subscriptionNotice(state({ status: 'EXEMPT', ends_at: null, days_left: 0 }))).toEqual({ kind: 'none' });
  });

  it('avisa en prueba con los días que quedan', () => {
    const n = subscriptionNotice(state({ status: 'TRIAL', days_left: 5 }));
    expect(n).toEqual({ kind: 'warning', status: 'TRIAL', days_left: 5, message: 'Te quedan 5 días de prueba gratis.' });
  });

  it('usa singular con 1 día', () => {
    const n = subscriptionNotice(state({ status: 'TRIAL', days_left: 1 }));
    expect(n.kind === 'warning' && n.message).toBe('Te queda 1 día de prueba gratis.');
  });

  it('avisa en gracia con los días antes del bloqueo', () => {
    const n = subscriptionNotice(state({ status: 'GRACE', days_left: 3 }));
    expect(n).toEqual({
      kind: 'warning',
      status: 'GRACE',
      days_left: 3,
      message: 'Tu plan venció. Te quedan 3 días para pagar o la app se bloqueará.',
    });
  });

  it('gracia con 1 día en singular', () => {
    const n = subscriptionNotice(state({ status: 'GRACE', days_left: 1 }));
    expect(n.kind === 'warning' && n.message).toBe('Tu plan venció. Te queda 1 día para pagar o la app se bloqueará.');
  });

  it('bloquea con BLOCKED', () => {
    expect(subscriptionNotice(state({ status: 'BLOCKED', operational: false, ends_at: null, days_left: 0 }))).toEqual({ kind: 'blocked' });
  });
});
