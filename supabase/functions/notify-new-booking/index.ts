// Envía el aviso push a la dueña cuando entra una solicitud desde el portal.
// La llama el trigger `appointment_notify_new_booking` vía pg_net (migración
// 20260927000001). Ver odd/tasks/owner-push-notifications.md (T3).
//
// Aquí solo se cablea lo real (Supabase, VAPID, la librería de push). Las
// decisiones viven en `_shared/notifyNewBooking.ts`, que prueba vitest.
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
import { handleNotifyNewBooking, type Sender } from '../_shared/notifyNewBooking.ts';

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta el secreto ${name}`);
  return value;
};

// Se construye una vez por instancia y SOLO cuando hay algo que enviar. Si se
// arrancara al cargar el módulo, unas claves mal puestas dejarían una promesa
// rechazada sin manejar, que en Deno puede tumbar el worker en cada llamada
// (incluidas las 401/400) en vez de dar un 500 claro al intentar enviar.
let senderPromise: Promise<Sender> | null = null;

function prepareSender(): Promise<Sender> {
  senderPromise ??= (async () => {
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(env('VAPID_KEYS')), {
      extractable: false,
    });
    const server = await webpush.ApplicationServer.new({
      contactInformation: env('VAPID_SUBJECT'),
      vapidKeys,
    });
    const send: Sender = async (sub, payload) => {
      try {
        await server
          .subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } })
          .pushTextMessage(payload, { urgency: webpush.Urgency.High, ttl: 60 * 60 * 24 });
        return 'sent';
      } catch (err) {
        // 410 (isGone) o 404: el dispositivo ya no existe (app borrada, permiso retirado).
        if (err instanceof webpush.PushMessageError &&
            (err.isGone() || err.response.status === 404)) {
          return 'gone';
        }
        throw err;
      }
    };
    return send;
  })().catch((err) => {
    senderPromise = null; // que el próximo aviso lo reintente tras corregir los secretos
    throw err;
  });
  return senderPromise;
}

Deno.serve((req) => {
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  return handleNotifyNewBooking(req, {
    expectedSecret: env('NOTIFY_SECRET'),

    async loadBooking(id) {
      const { data, error } = await db
        .from('appointment')
        .select('id, business_id, client, datetime, status, service:service_id (name)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const service = data.service as { name: string } | { name: string }[] | null;
      return {
        id: data.id,
        business_id: data.business_id,
        client: data.client,
        datetime: data.datetime,
        status: data.status,
        service_name: (Array.isArray(service) ? service[0]?.name : service?.name) ?? null,
      };
    },

    async loadSubscriptions(businessId) {
      const { data, error } = await db
        .from('push_subscription')
        .select('id, endpoint, p256dh, auth')
        .eq('business_id', businessId);
      if (error) throw error;
      return data ?? [];
    },

    prepareSender,

    async removeSubscriptions(ids) {
      const { error } = await db.from('push_subscription').delete().in('id', ids);
      if (error) console.error('no se pudieron borrar suscripciones muertas', error.message);
    },

    logError: (message, detail) => console.error(message, detail ?? ''),
  });
});
