import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// El adaptador habla con Supabase: se sustituye por un doble que registra las
// llamadas en orden, para comprobar QUÉ se pide y CUÁNDO.
const calls: string[] = [];
const db = vi.hoisted(() => ({
  rpcResult: { error: null as { message: string } | null },
  deleteResult: { error: null as { message: string } | null },
  eqArgs: [] as [string, unknown][],
}));

vi.mock('../supabase/client', () => {
  const builder = {
    delete: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      db.eqArgs.push([column, value]);
      return builder;
    }),
    then: (resolve: (r: unknown) => void) => {
      calls.push('db.delete');
      resolve(db.deleteResult);
    },
  };
  return {
    supabase: {
      rpc: vi.fn(async (name: string, args: unknown) => {
        calls.push(`rpc:${name}`);
        (globalThis as { lastRpcArgs?: unknown }).lastRpcArgs = args;
        return db.rpcResult;
      }),
      from: vi.fn(() => builder),
    },
  };
});

import { disablePush, enablePush } from './pushSubscriptionApi';

const VAPID = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

function fakeSubscription(json: PushSubscriptionJSON) {
  return {
    endpoint: json.endpoint,
    toJSON: () => json,
    unsubscribe: vi.fn(async () => {
      calls.push('unsubscribe');
      return true;
    }),
  };
}

type FakeSub = ReturnType<typeof fakeSubscription>;

function installBrowser({
  permission = 'granted' as NotificationPermission,
  registered = true,
  subscription = fakeSubscription({
    endpoint: 'https://web.push.apple.com/abc',
    keys: { p256dh: 'P', auth: 'A' },
  }) as FakeSub | null,
} = {}) {
  const pushManager = {
    subscribe: vi.fn(async () => subscription),
    getSubscription: vi.fn(async () => subscription),
  };
  vi.stubGlobal('Notification', {
    requestPermission: vi.fn(async () => {
      calls.push('requestPermission');
      return permission;
    }),
  });
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: vi.fn(async () => (registered ? { pushManager } : undefined)),
      // Si el código volviera a esperar `ready` sin service worker, el test se colgaría.
      ready: new Promise(() => {}),
    },
  });
  return { pushManager };
}

beforeEach(() => {
  calls.length = 0;
  db.rpcResult = { error: null };
  db.deleteResult = { error: null };
  db.eqArgs = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('enablePush', () => {
  it('pide permiso ANTES que cualquier otra cosa (regla del gesto en iOS)', async () => {
    installBrowser();
    await enablePush(7, VAPID);
    expect(calls[0]).toBe('requestPermission');
  });

  it('guarda la suscripción con el negocio explícito', async () => {
    installBrowser();
    await enablePush(7, VAPID);
    expect(calls).toEqual(['requestPermission', 'rpc:save_push_subscription']);
    expect((globalThis as { lastRpcArgs?: unknown }).lastRpcArgs).toEqual({
      p_business_id: 7,
      p_endpoint: 'https://web.push.apple.com/abc',
      p_p256dh: 'P',
      p_auth: 'A',
    });
  });

  it('si la dueña no da permiso, no suscribe ni guarda nada', async () => {
    const { pushManager } = installBrowser({ permission: 'denied' });
    await expect(enablePush(7, VAPID)).rejects.toThrow('No diste permiso para los avisos.');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(calls).not.toContain('rpc:save_push_subscription');
  });

  it('sin service worker registrado falla con un mensaje, en vez de quedarse colgado', async () => {
    installBrowser({ registered: false });
    await expect(enablePush(7, VAPID)).rejects.toThrow('Recarga Citelis e inténtalo de nuevo.');
  });

  it('una suscripción incompleta no se guarda', async () => {
    installBrowser({ subscription: fakeSubscription({ endpoint: 'https://x', keys: { p256dh: 'P' } }) });
    await expect(enablePush(7, VAPID)).rejects.toThrow('datos completos');
    expect(calls).not.toContain('rpc:save_push_subscription');
  });

  it('un error al guardar llega a la dueña', async () => {
    installBrowser();
    db.rpcResult = { error: { message: 'No perteneces a este negocio' } };
    await expect(enablePush(7, VAPID)).rejects.toThrow('No perteneces a este negocio');
  });
});

describe('disablePush', () => {
  it('borra la fila filtrando por negocio y endpoint, y DESPUÉS desuscribe el navegador', async () => {
    installBrowser();
    await disablePush(7);
    expect(db.eqArgs).toEqual([['business_id', 7], ['endpoint', 'https://web.push.apple.com/abc']]);
    expect(calls).toEqual(['db.delete', 'unsubscribe']);
  });

  it('si falla el borrado, NO desuscribe (no deja una fila huérfana apuntando a la nada)', async () => {
    installBrowser();
    db.deleteResult = { error: { message: 'db caída' } };
    await expect(disablePush(7)).rejects.toThrow('db caída');
    expect(calls).not.toContain('unsubscribe');
  });

  it('sin suscripción en el dispositivo no hace nada', async () => {
    installBrowser({ subscription: null });
    await disablePush(7);
    expect(calls).toEqual([]);
  });
});
