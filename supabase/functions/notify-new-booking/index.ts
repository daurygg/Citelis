// Envía el aviso push a la dueña cuando entra una solicitud desde el portal.
// La llama el trigger `appointment_notify_new_booking` vía pg_net (migración
// 20260927000001). Ver odd/tasks/owner-push-notifications.md (T3).
//
// SE DESPLIEGA CON verify_jwt = false: quien llama es la base de datos, no una
// persona con sesión. La protege el secreto compartido `x-notify-secret`, el
// mismo que guarda Vault como `notify_new_booking_secret`.
//
// Por qué @negrel/webpush y no npm:web-push: web-push usa `crypto.createECDH`
// de Node, que el runtime de Edge (Deno) no tiene. Esta librería firma y cifra
// con WebCrypto (RFC 8291 / RFC 8292).
//
// Secretos de la función:
//   NOTIFY_SECRET   — igual que `notify_new_booking_secret` en Vault.
//   VAPID_KEYS      — JSON {publicKey, privateKey} en formato JWK.
//   VAPID_SUBJECT   — "mailto:..." de contacto para el servicio de push.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { newBookingMessage } from '../_shared/newBookingMessage.ts';

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta el secreto ${name}`);
  return value;
};

// Se construye una vez por instancia y SOLO cuando hay algo que enviar. Si se
// arrancara al cargar el módulo, unas claves mal puestas dejarían una promesa
// rechazada sin manejar, que en Deno puede tumbar el worker en cada llamada
// (incluidas las 401/400) en vez de dar un 500 claro al intentar enviar.
let appServerPromise: Promise<webpush.ApplicationServer> | null = null;

function appServer(): Promise<webpush.ApplicationServer> {
  appServerPromise ??= (async () => {
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(env('VAPID_KEYS')), {
      extractable: false,
    });
    return webpush.ApplicationServer.new({
      contactInformation: env('VAPID_SUBJECT'),
      vapidKeys,
    });
  })().catch((err) => {
    appServerPromise = null; // que el próximo aviso lo reintente tras corregir los secretos
    throw err;
  });
  return appServerPromise;
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameSecret(req.headers.get('x-notify-secret') ?? '', env('NOTIFY_SECRET'))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { appointment_id } = await req.json().catch(() => ({}));
  if (!Number.isInteger(appointment_id)) {
    return new Response('appointment_id inválido', { status: 400 });
  }

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  const { data: appointment, error } = await db
    .from('appointment')
    .select('id, business_id, client, datetime, status, service:service_id (name)')
    .eq('id', appointment_id)
    .maybeSingle();
  if (error) return new Response(error.message, { status: 500 });
  // Ya respondida o borrada antes de que saliera el aviso: no hay nada que decir.
  if (!appointment || appointment.status !== 'REQUESTED') {
    return Response.json({ sent: 0, skipped: 'not_requested' });
  }

  const { data: subscriptions, error: subError } = await db
    .from('push_subscription')
    .select('id, endpoint, p256dh, auth')
    .eq('business_id', appointment.business_id); // INVARIANTE 1
  if (subError) return new Response(subError.message, { status: 500 });
  if (!subscriptions?.length) return Response.json({ sent: 0 });

  const service = appointment.service as { name: string } | { name: string }[] | null;
  const message = newBookingMessage({
    appointment_id: appointment.id,
    client: appointment.client,
    service_name: (Array.isArray(service) ? service[0]?.name : service?.name) ?? null,
    datetime: appointment.datetime,
  });

  let server: webpush.ApplicationServer;
  try {
    server = await appServer();
  } catch (err) {
    console.error('claves VAPID inválidas o ausentes', String(err));
    return new Response('Push no configurado', { status: 500 });
  }
  const payload = JSON.stringify(message);
  const dead: number[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await server
          .subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } })
          .pushTextMessage(payload, { urgency: webpush.Urgency.High, ttl: 60 * 60 * 24 });
        sent++;
      } catch (err) {
        // 410 (isGone) o 404: el dispositivo ya no existe (app borrada, permiso
        // retirado). Se limpia para no insistir en cada reserva.
        if (err instanceof webpush.PushMessageError &&
            (err.isGone() || err.response.status === 404)) {
          dead.push(sub.id);
        } else {
          console.error('push fallido', sub.id, String(err));
        }
      }
    }),
  );

  if (dead.length) await db.from('push_subscription').delete().in('id', dead);
  return Response.json({ sent, removed: dead.length });
});
