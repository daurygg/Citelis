// Lógica de la Edge Function `notify-new-booking`, sin Deno, sin Supabase y sin
// la librería de push: todo lo que toca el exterior llega como dependencia. Así
// vitest prueba cada rama (quién puede llamar, cuándo no avisar, qué se limpia)
// y `index.ts` se queda en cablear lo real.

import { newBookingMessage } from './newBookingMessage.ts';

export interface BookingForNotice {
  id: number;
  business_id: number;
  client: string;
  datetime: string;
  status: string;
  service_name: string | null;
}

export interface StoredSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 'gone' = el dispositivo ya no existe (404/410) y hay que olvidarlo. */
export type SendOutcome = 'sent' | 'gone' | 'failed';

export type Sender = (subscription: StoredSubscription, payload: string) => Promise<SendOutcome>;

export interface NotifyDeps {
  expectedSecret: string;
  loadBooking(appointmentId: number): Promise<BookingForNotice | null>;
  loadSubscriptions(businessId: number): Promise<StoredSubscription[]>;
  /** Se pide solo si hay a quién enviar; lanza si las claves VAPID no sirven. */
  prepareSender(): Promise<Sender>;
  removeSubscriptions(ids: number[]): Promise<void>;
  logError(message: string, detail?: unknown): void;
}

/** Comparación en tiempo constante: no filtra el secreto por lo que tarda. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function handleNotifyNewBooking(req: Request, deps: NotifyDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameSecret(req.headers.get('x-notify-secret') ?? '', deps.expectedSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body: { appointment_id?: unknown } = await req.json().catch(() => ({}));
  const appointmentId = body?.appointment_id;
  if (typeof appointmentId !== 'number' || !Number.isInteger(appointmentId)) {
    return new Response('appointment_id inválido', { status: 400 });
  }

  let booking: BookingForNotice | null;
  let subscriptions: StoredSubscription[];
  try {
    booking = await deps.loadBooking(appointmentId);
    // Ya respondida o borrada antes de que saliera el aviso: no hay nada que decir.
    if (!booking || booking.status !== 'REQUESTED') {
      return Response.json({ sent: 0, skipped: 'not_requested' });
    }
    subscriptions = await deps.loadSubscriptions(booking.business_id); // INVARIANTE 1
  } catch (err) {
    deps.logError('lectura fallida', String(err));
    return new Response('Error leyendo la cita', { status: 500 });
  }
  if (subscriptions.length === 0) return Response.json({ sent: 0 });

  let send: Sender;
  try {
    send = await deps.prepareSender();
  } catch (err) {
    deps.logError('claves VAPID inválidas o ausentes', String(err));
    return new Response('Push no configurado', { status: 500 });
  }

  const payload = JSON.stringify(newBookingMessage({
    appointment_id: booking.id,
    client: booking.client,
    service_name: booking.service_name,
    datetime: booking.datetime,
  }));

  // Cada dispositivo por su cuenta: uno caído no deja sin aviso a los demás.
  const outcomes = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      const outcome = await send(subscription, payload);
      if (outcome === 'failed') deps.logError('push fallido', subscription.id);
      return outcome;
    } catch (err) {
      deps.logError('push fallido', `${subscription.id}: ${String(err)}`);
      return 'failed' as const;
    }
  }));

  const gone = subscriptions.filter((_, i) => outcomes[i] === 'gone').map((s) => s.id);
  let removed = 0;
  if (gone.length) {
    // Los avisos ya salieron: un fallo al limpiar no convierte eso en un 500.
    // Se reintentará solo, la próxima vez que esos dispositivos respondan 404/410.
    try {
      await deps.removeSubscriptions(gone);
      removed = gone.length;
    } catch (err) {
      deps.logError('no se pudieron borrar suscripciones muertas', String(err));
    }
  }

  return Response.json({
    sent: outcomes.filter((o) => o === 'sent').length,
    removed,
  });
}
