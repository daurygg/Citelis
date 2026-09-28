import { describe, expect, it, vi } from 'vitest';
import {
  handleNotifyNewBooking,
  type BookingForNotice,
  type NotifyDeps,
  type SendOutcome,
  type StoredSubscription,
} from './notifyNewBooking';

const SECRET = 'secreto-compartido';

const booking: BookingForNotice = {
  id: 42,
  business_id: 7,
  client: 'Ana Pérez',
  datetime: '2026-10-03T15:30',
  status: 'REQUESTED',
  service_name: 'Uñas acrílicas',
};

const sub = (id: number): StoredSubscription => ({
  id,
  endpoint: `https://push.example/${id}`,
  p256dh: `p256dh-${id}`,
  auth: `auth-${id}`,
});

/** Dependencias falsas: cada test cambia solo lo que le importa. */
function fakeDeps(overrides: Partial<NotifyDeps> = {}) {
  const send = vi.fn(async (): Promise<SendOutcome> => 'sent');
  const deps: NotifyDeps = {
    expectedSecret: SECRET,
    loadBooking: vi.fn(async () => booking),
    loadSubscriptions: vi.fn(async () => [sub(1)]),
    prepareSender: vi.fn(async () => send),
    removeSubscriptions: vi.fn(async () => {}),
    logError: vi.fn(),
    ...overrides,
  };
  return { deps, send };
}

function request(
  body: unknown = { appointment_id: 42 },
  { method = 'POST', secret = SECRET }: { method?: string; secret?: string | null } = {},
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (secret !== null) headers.set('x-notify-secret', secret);
  return new Request('https://fn.example/notify-new-booking', {
    method,
    headers,
    body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('handleNotifyNewBooking: quién puede llamar', () => {
  it('solo acepta POST', async () => {
    const { deps } = fakeDeps();
    const res = await handleNotifyNewBooking(request(undefined, { method: 'GET' }), deps);
    expect(res.status).toBe(405);
    expect(deps.loadBooking).not.toHaveBeenCalled();
  });

  it('rechaza sin secreto y con un secreto equivocado, sin tocar la base', async () => {
    const { deps } = fakeDeps();
    expect((await handleNotifyNewBooking(request(undefined, { secret: null }), deps)).status).toBe(401);
    expect((await handleNotifyNewBooking(request(undefined, { secret: 'otro' }), deps)).status).toBe(401);
    // Mismo largo, distinto contenido: la comparación no se queda en la longitud.
    expect((await handleNotifyNewBooking(request(undefined, { secret: 'secreto-compartidX' }), deps)).status)
      .toBe(401);
    expect(deps.loadBooking).not.toHaveBeenCalled();
  });

  it('rechaza un cuerpo sin appointment_id entero', async () => {
    const { deps } = fakeDeps();
    for (const body of ['no-es-json', {}, { appointment_id: '42' }, { appointment_id: 4.2 }]) {
      expect((await handleNotifyNewBooking(request(body), deps)).status).toBe(400);
    }
    expect(deps.loadBooking).not.toHaveBeenCalled();
  });
});

describe('handleNotifyNewBooking: cuándo NO avisar', () => {
  it('no avisa si la cita ya no existe', async () => {
    const { deps, send } = fakeDeps({ loadBooking: vi.fn(async () => null) });
    const res = await handleNotifyNewBooking(request(), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, skipped: 'not_requested' });
    expect(send).not.toHaveBeenCalled();
  });

  it('no avisa si la dueña ya la respondió antes de que saliera el aviso', async () => {
    const { deps, send } = fakeDeps({ loadBooking: vi.fn(async () => ({ ...booking, status: 'PENDING' })) });
    expect(await (await handleNotifyNewBooking(request(), deps)).json())
      .toEqual({ sent: 0, skipped: 'not_requested' });
    expect(send).not.toHaveBeenCalled();
  });

  it('pide las suscripciones del negocio DE LA CITA (INVARIANTE 1)', async () => {
    const { deps } = fakeDeps();
    await handleNotifyNewBooking(request(), deps);
    expect(deps.loadSubscriptions).toHaveBeenCalledWith(7);
  });

  it('sin dispositivos suscritos no prepara el envío (ni exige las claves VAPID)', async () => {
    const { deps } = fakeDeps({ loadSubscriptions: vi.fn(async () => []) });
    expect(await (await handleNotifyNewBooking(request(), deps)).json()).toEqual({ sent: 0 });
    expect(deps.prepareSender).not.toHaveBeenCalled();
  });
});

describe('handleNotifyNewBooking: el envío', () => {
  it('manda a cada dispositivo el mensaje de la solicitud', async () => {
    const { deps, send } = fakeDeps({ loadSubscriptions: vi.fn(async () => [sub(1), sub(2)]) });
    const res = await handleNotifyNewBooking(request(), deps);
    expect(await res.json()).toEqual({ sent: 2, removed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    const [target, payload] = send.mock.calls[0] as unknown as [StoredSubscription, string];
    expect(target).toEqual(sub(1));
    expect(JSON.parse(payload)).toEqual({
      title: 'Nueva solicitud de cita',
      body: 'Ana Pérez pidió Uñas acrílicas para el sábado 3/10 a las 3:30 PM',
      url: '/?vista=reservas',
      tag: 'appointment-42',
    });
  });

  it('borra los dispositivos que ya no existen y conserva los que fallaron por otra cosa', async () => {
    const outcomes: Record<number, SendOutcome> = { 1: 'sent', 2: 'gone', 3: 'failed', 4: 'gone' };
    const send = vi.fn(async (s: StoredSubscription): Promise<SendOutcome> => outcomes[s.id]);
    const { deps } = fakeDeps({
      loadSubscriptions: vi.fn(async () => [sub(1), sub(2), sub(3), sub(4)]),
      prepareSender: vi.fn(async () => send),
    });
    const res = await handleNotifyNewBooking(request(), deps);
    expect(await res.json()).toEqual({ sent: 1, removed: 2 });
    expect(deps.removeSubscriptions).toHaveBeenCalledWith([2, 4]);
    expect(deps.logError).toHaveBeenCalledTimes(1);
  });

  it('si falla el borrado de dispositivos muertos, los avisos ya enviados cuentan igual', async () => {
    const { deps } = fakeDeps({
      loadSubscriptions: vi.fn(async () => [sub(1), sub(2)]),
      prepareSender: vi.fn(async () => vi.fn(async (s: StoredSubscription): Promise<SendOutcome> =>
        s.id === 1 ? 'sent' : 'gone')),
      removeSubscriptions: vi.fn(async () => { throw new Error('db caída'); }),
    });
    const res = await handleNotifyNewBooking(request(), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1, removed: 0 });
    expect(deps.logError).toHaveBeenCalled();
  });

  it('sin dispositivos muertos no llama a borrar', async () => {
    const { deps } = fakeDeps();
    await handleNotifyNewBooking(request(), deps);
    expect(deps.removeSubscriptions).not.toHaveBeenCalled();
  });

  it('un envío que lanza no tumba a los demás', async () => {
    const send = vi.fn(async (s: StoredSubscription): Promise<SendOutcome> => {
      if (s.id === 1) throw new Error('red caída');
      return 'sent';
    });
    const { deps } = fakeDeps({
      loadSubscriptions: vi.fn(async () => [sub(1), sub(2)]),
      prepareSender: vi.fn(async () => send),
    });
    expect(await (await handleNotifyNewBooking(request(), deps)).json()).toEqual({ sent: 1, removed: 0 });
    expect(deps.logError).toHaveBeenCalled();
  });
});

describe('handleNotifyNewBooking: fallos del servidor', () => {
  it('claves VAPID ausentes o inválidas → 500 claro', async () => {
    const { deps } = fakeDeps({ prepareSender: vi.fn(async () => { throw new Error('Falta VAPID_KEYS'); }) });
    const res = await handleNotifyNewBooking(request(), deps);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Push no configurado');
  });

  it('error leyendo la cita o las suscripciones → 500', async () => {
    const boom = vi.fn(async () => { throw new Error('db caída'); });
    expect((await handleNotifyNewBooking(request(), fakeDeps({ loadBooking: boom }).deps)).status).toBe(500);
    expect((await handleNotifyNewBooking(request(), fakeDeps({ loadSubscriptions: boom }).deps)).status)
      .toBe(500);
  });
});
