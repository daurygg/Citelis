import { describe, expect, it, vi } from 'vitest';
import type { Appointment } from '../domain/types';
import { startLiveAppointments, type LiveClient } from './liveAppointments';

const BUSINESS = 7;

const row = (id: number, status: Appointment['status'] = 'REQUESTED'): Appointment => ({
  id,
  business_id: BUSINESS,
  service_id: 10,
  client: 'Ana',
  datetime: '2026-10-03T15:30',
  status,
  quoted_price: null,
  deposit: null,
  charged_price: null,
  actual_cost: null,
  profit: null,
});

type Handler = (payload: { eventType: string; new: Appointment }) => void;

/**
 * Doble del cliente de Supabase: guarda lo que se pide y deja disparar eventos.
 * Con `deferred`, cada consulta queda pendiente hasta `resolveFetch(i, data)`,
 * para probar respuestas que llegan tarde o fuera de orden.
 */
function fakeClient(
  fetched: { data: Appointment[] | null; error: unknown } = { data: [], error: null },
  { deferred = false } = {},
) {
  const handlers: { filter: Record<string, string>; handler: Handler }[] = [];
  let statusCallback: ((status: string) => void) | null = null;
  const eqCalls: [string, unknown][] = [];
  const topics: string[] = [];
  const pending: ((value: { data: Appointment[] | null; error: unknown }) => void)[] = [];
  const channel = {
    on: vi.fn((_type: string, filter: Record<string, string>, handler: Handler) => {
      handlers.push({ filter, handler });
      return channel;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      statusCallback = cb;
      return channel;
    }),
  };
  const client = {
    channel: vi.fn((topic: string) => {
      topics.push(topic);
      return channel;
    }),
    removeChannel: vi.fn(async () => 'ok'),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((column: string, value: unknown) => {
          eqCalls.push([column, value]);
          return new Promise((resolve) => {
            if (deferred) pending.push(resolve);
            else resolve(fetched);
          });
        }),
      })),
    })),
  };
  return {
    client: client as unknown as LiveClient,
    raw: client,
    channel,
    handlers,
    eqCalls,
    topics,
    emitStatus: (status: string) => statusCallback?.(status),
    emit: (eventType: 'INSERT' | 'UPDATE', appointment: Appointment) =>
      handlers.filter((h) => h.filter.event === eventType).forEach((h) => h.handler({ eventType, new: appointment })),
    resolveFetch: (index: number, data: Appointment[]) => pending[index]({ data, error: null }),
  };
}

function fakeDocument(initial: DocumentVisibilityState = 'visible') {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: initial,
    addEventListener: vi.fn((_: string, fn: () => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: () => void) => listeners.delete(fn)),
  };
  return {
    doc: doc as unknown as Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>,
    setVisibility(state: DocumentVisibilityState) {
      doc.visibilityState = state;
      listeners.forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startLiveAppointments: el canal', () => {
  it('escucha INSERT y UPDATE de appointment filtrados por SU negocio, y nada de DELETE', () => {
    const fake = fakeClient();
    startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange: vi.fn(), onResync: vi.fn() });
    expect(fake.topics[0]).toMatch(new RegExp(`^appointments:${BUSINESS}:`));
    expect(fake.handlers.map((h) => h.filter)).toEqual([
      { event: 'INSERT', schema: 'public', table: 'appointment', filter: `business_id=eq.${BUSINESS}` },
      { event: 'UPDATE', schema: 'public', table: 'appointment', filter: `business_id=eq.${BUSINESS}` },
    ]);
  });

  it('entrega cada evento con su tipo y la fila del servidor', () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange, onResync: vi.fn() });
    fake.emit('INSERT', row(2));
    fake.emit('UPDATE', row(2, 'PENDING'));
    expect(onChange.mock.calls).toEqual([
      [{ eventType: 'INSERT', new: row(2) }],
      [{ eventType: 'UPDATE', new: row(2, 'PENDING') }],
    ]);
  });
});

describe('startLiveAppointments: ponerse al día', () => {
  it('al conectarse (y en cada reconexión) vuelve a pedir las citas DE SU negocio', async () => {
    const fresh = [row(1), row(2)];
    const fake = fakeClient({ data: fresh, error: null });
    const onResync = vi.fn();
    startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange: vi.fn(), onResync });
    fake.emitStatus('SUBSCRIBED');
    await flush();
    fake.emitStatus('SUBSCRIBED'); // reconexión tras perder el socket
    await flush();
    expect(fake.eqCalls).toEqual([['business_id', BUSINESS], ['business_id', BUSINESS]]);
    expect(onResync).toHaveBeenCalledTimes(2);
    expect(onResync).toHaveBeenLastCalledWith(fresh);
  });

  it('al volver a la app desde segundo plano se pone al día; al irse, no', async () => {
    const fake = fakeClient({ data: [row(3)], error: null });
    const page = fakeDocument();
    const onResync = vi.fn();
    startLiveAppointments({ client: fake.client, doc: page.doc, businessId: BUSINESS, onChange: vi.fn(), onResync });
    page.setVisibility('hidden');
    await flush();
    expect(onResync).not.toHaveBeenCalled();
    page.setVisibility('visible');
    await flush();
    expect(onResync).toHaveBeenCalledWith([row(3)]);
  });

  it('los estados de error del canal no disparan la puesta al día', async () => {
    const fake = fakeClient();
    const onResync = vi.fn();
    startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange: vi.fn(), onResync });
    for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) fake.emitStatus(status);
    await flush();
    expect(onResync).not.toHaveBeenCalled();
  });

  it('si la consulta falla, no vacía la lista: conserva lo que había', async () => {
    const fake = fakeClient({ data: null, error: { message: 'sin red' } });
    const onResync = vi.fn();
    const onError = vi.fn();
    startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange: vi.fn(), onResync, onError });
    fake.emitStatus('SUBSCRIBED');
    await flush();
    expect(onResync).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });
});

describe('startLiveAppointments: al parar', () => {
  it('cierra el canal y deja de escuchar la visibilidad', () => {
    const fake = fakeClient();
    const page = fakeDocument();
    const stop = startLiveAppointments({ client: fake.client, doc: page.doc, businessId: BUSINESS, onChange: vi.fn(), onResync: vi.fn() });
    expect(page.listenerCount()).toBe(1);
    stop();
    expect(fake.raw.removeChannel).toHaveBeenCalledWith(fake.channel);
    expect(page.listenerCount()).toBe(0);
  });

  it('una respuesta que llega después de parar no toca el estado', async () => {
    const fake = fakeClient({ data: [row(1)], error: null });
    const onResync = vi.fn();
    const stop = startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange: vi.fn(), onResync });
    fake.emitStatus('SUBSCRIBED');
    stop();
    await flush();
    expect(onResync).not.toHaveBeenCalled();
  });

  it('un evento que llega después de parar no toca el estado', () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    const stop = startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange, onResync: vi.fn() });
    stop();
    fake.emit('INSERT', row(2));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('startLiveAppointments: carreras', () => {
  it('un evento que llega MIENTRAS se pone al día no lo borra la foto vieja', async () => {
    const fake = fakeClient(undefined, { deferred: true });
    const onResync = vi.fn();
    startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange: vi.fn(), onResync });
    fake.emitStatus('SUBSCRIBED'); // arranca la consulta
    fake.emit('INSERT', row(9)); // la reserva entra antes de que responda
    fake.resolveFetch(0, [row(1)]); // la foto se tomó antes de la reserva
    await flush();
    expect(onResync).toHaveBeenCalledWith([row(1), row(9)]);
  });

  it('un cambio de estado que llega mientras se pone al día gana a la foto', async () => {
    const fake = fakeClient(undefined, { deferred: true });
    const onResync = vi.fn();
    startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange: vi.fn(), onResync });
    fake.emitStatus('SUBSCRIBED');
    fake.emit('UPDATE', row(1, 'PENDING'));
    fake.resolveFetch(0, [row(1, 'REQUESTED')]);
    await flush();
    expect(onResync).toHaveBeenCalledWith([row(1, 'PENDING')]);
  });

  it('dos puestas al día cruzadas: la respuesta vieja no pisa a la nueva', async () => {
    const fake = fakeClient(undefined, { deferred: true });
    const page = fakeDocument();
    const onResync = vi.fn();
    startLiveAppointments({ client: fake.client, doc: page.doc, businessId: BUSINESS, onChange: vi.fn(), onResync });
    fake.emitStatus('SUBSCRIBED'); // consulta 0
    page.setVisibility('visible'); // consulta 1
    fake.resolveFetch(1, [row(1), row(2)]); // la nueva responde primero
    await flush();
    fake.resolveFetch(0, [row(1)]); // la vieja llega tarde
    await flush();
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(onResync).toHaveBeenCalledWith([row(1), row(2)]);
  });

  it('los eventos ya aplicados no se vuelven a aplicar en la siguiente puesta al día', async () => {
    const fake = fakeClient(undefined, { deferred: true });
    const page = fakeDocument();
    const onResync = vi.fn();
    startLiveAppointments({ client: fake.client, doc: page.doc, businessId: BUSINESS, onChange: vi.fn(), onResync });
    fake.emitStatus('SUBSCRIBED');
    fake.emit('UPDATE', row(1, 'PENDING'));
    fake.resolveFetch(0, [row(1, 'REQUESTED')]);
    await flush();
    // Más tarde la dueña rechaza en otro dispositivo; la foto nueva ya lo trae.
    page.setVisibility('visible');
    fake.resolveFetch(1, [row(1, 'REJECTED')]);
    await flush();
    expect(onResync).toHaveBeenLastCalledWith([row(1, 'REJECTED')]);
  });

  it('cada arranque usa un canal propio (React puede montar dos veces seguidas)', () => {
    // realtime-js devuelve el canal EXISTENTE si el tema se repite, y a ese ya
    // no se le pueden añadir escuchas: el segundo montaje fallaría.
    const fake = fakeClient();
    const stop = startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange: vi.fn(), onResync: vi.fn() });
    stop();
    startLiveAppointments({ client: fake.client, doc: fakeDocument().doc, businessId: BUSINESS, onChange: vi.fn(), onResync: vi.fn() });
    expect(new Set(fake.topics).size).toBe(2);
  });
});
