import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  fetchAdminBusinesses,
  fetchIsPlatformAdmin,
  fetchMySubscription,
  registerSubscriptionPayment,
  setBusinessExempt,
} from './subscriptionApi';

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fetchMySubscription', () => {
  it('llama my_subscription y mapea la fila', async () => {
    rpc.mockResolvedValue({
      data: [{ business_id: 1, status: 'GRACE', operational: true, days_left: 3, ends_at: '2026-10-20T00:00:00Z', trial_ends_at: 'x', paid_until: null, exempt: false }],
      error: null,
    });
    expect(await fetchMySubscription()).toEqual({ status: 'GRACE', ends_at: '2026-10-20T00:00:00Z', days_left: 3, operational: true });
    expect(rpc).toHaveBeenCalledWith('my_subscription');
  });

  it('falla abierta: si la RPC da error devuelve null y lo registra', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await fetchMySubscription()).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('falla abierta: si la RPC lanza devuelve null', async () => {
    rpc.mockRejectedValue(new Error('sin red'));
    expect(await fetchMySubscription()).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('fetchIsPlatformAdmin', () => {
  it('true solo si la RPC devuelve true', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await fetchIsPlatformAdmin()).toBe(true);
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await fetchIsPlatformAdmin()).toBe(false);
  });

  it('ante un error oculta el panel (false)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await fetchIsPlatformAdmin()).toBe(false);
  });
});

describe('fetchAdminBusinesses', () => {
  it('devuelve las filas mapeadas', async () => {
    rpc.mockResolvedValue({
      data: [{ business_id: 1, name: 'A', slug: null, plan: null, trial_ends_at: null, paid_until: null, exempt: true, status: 'EXEMPT', last_payment_at: null, last_payment_cents: null }],
      error: null,
    });
    const r = await fetchAdminBusinesses();
    expect(r).toEqual({ ok: true, businesses: [expect.objectContaining({ business_id: 1, status: 'EXEMPT' })] });
  });

  it('entrega el mensaje del servidor si falla', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'No autorizado' } });
    expect(await fetchAdminBusinesses()).toEqual({ ok: false, message: 'No autorizado' });
  });

  it('una respuesta ilegible es un error, no una lista vacía', async () => {
    rpc.mockResolvedValue({ data: [{ name: 1 }], error: null });
    expect((await fetchAdminBusinesses()).ok).toBe(false);
  });
});

describe('registerSubscriptionPayment', () => {
  const args = { amount_cents: 150000, paid_until: '2026-12-01T23:59:59-04:00', method: 'TRANSFER' as const, note: null };

  it('llama admin_register_payment con los parámetros correctos', async () => {
    rpc.mockResolvedValue({ data: 9, error: null });
    expect(await registerSubscriptionPayment(4, args)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('admin_register_payment', {
      p_business_id: 4,
      p_amount_cents: 150000,
      p_paid_until: '2026-12-01T23:59:59-04:00',
      p_method: 'TRANSFER',
      p_note: null,
    });
  });

  it('muestra el mensaje del servidor tal cual', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'La nueva fecha debe ser posterior a la actual' } });
    expect(await registerSubscriptionPayment(4, args)).toEqual({ ok: false, message: 'La nueva fecha debe ser posterior a la actual' });
  });
});

describe('setBusinessExempt', () => {
  it('llama admin_set_exempt', async () => {
    rpc.mockResolvedValue({ data: 'EXEMPT', error: null });
    expect(await setBusinessExempt(4, true)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('admin_set_exempt', { p_business_id: 4, p_exempt: true });
  });

  it('devuelve el error del servidor', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'El negocio no existe' } });
    expect(await setBusinessExempt(4, false)).toEqual({ ok: false, message: 'El negocio no existe' });
  });
});
