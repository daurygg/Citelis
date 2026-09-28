import { describe, expect, it, vi } from 'vitest';
import { isGoneStatus, retryingOnce, toBookingForNotice } from './notifyWiring';

describe('isGoneStatus', () => {
  it('404 y 410 significan que el dispositivo ya no existe', () => {
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(410)).toBe(true);
  });

  it('cualquier otro fallo NO borra el dispositivo', () => {
    for (const status of [400, 401, 403, 413, 429, 500, 502, 503]) {
      expect(isGoneStatus(status)).toBe(false);
    }
  });
});

describe('retryingOnce', () => {
  it('construye una sola vez mientras funcione', async () => {
    const factory = vi.fn(async () => 'servidor');
    const get = retryingOnce(factory);
    expect(await get()).toBe('servidor');
    expect(await get()).toBe('servidor');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('tras un fallo, la siguiente llamada lo vuelve a intentar', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('Falta VAPID_KEYS'))
      .mockResolvedValueOnce('servidor');
    const get = retryingOnce(factory);
    await expect(get()).rejects.toThrow('Falta VAPID_KEYS');
    expect(await get()).toBe('servidor');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('dos llamadas simultáneas comparten la misma construcción', async () => {
    const factory = vi.fn(async () => 'servidor');
    const get = retryingOnce(factory);
    await Promise.all([get(), get()]);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('toBookingForNotice', () => {
  const row = { id: 42, business_id: 7, client: 'Ana', datetime: '2026-10-03T15:30', status: 'REQUESTED' };

  it('aplana el servicio cuando el join llega como objeto', () => {
    expect(toBookingForNotice({ ...row, service: { name: 'Uñas' } })).toEqual({ ...row, service_name: 'Uñas' });
  });

  it('aplana el servicio cuando el join llega como arreglo', () => {
    expect(toBookingForNotice({ ...row, service: [{ name: 'Uñas' }] }).service_name).toBe('Uñas');
  });

  it('sin servicio, null (el mensaje dirá "una cita")', () => {
    expect(toBookingForNotice({ ...row, service: null }).service_name).toBeNull();
    expect(toBookingForNotice({ ...row, service: [] }).service_name).toBeNull();
  });
});
