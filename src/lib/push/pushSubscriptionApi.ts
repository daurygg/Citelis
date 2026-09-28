// Adaptador de push: habla con `navigator`/`Notification`/`PushManager` y con
// Supabase. NO es dominio (T5, odd/tasks/owner-push-notifications.md): toca
// APIs del navegador y la red a propósito, así que no tiene la garantía de
// "cero efectos secundarios" de src/lib/domain. Qué estado mostrar según el
// entorno sigue siendo pura (`pushButtonState` en pushSupport.ts); este
// módulo solo junta los datos que esa función necesita y ejecuta la acción
// que la dueña pide. La UI (`PushNotificationSettings`) es su única llamadora.
import { supabase } from '../supabase/client';
import { isIOSDevice, subscriptionToRow, urlBase64ToUint8Array, type PushEnvironment } from './pushSupport';

/** Arma el `PushEnvironment` que consume `pushButtonState`, leyendo el navegador actual. */
export async function readPushEnvironment(): Promise<PushEnvironment> {
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in window;
  const standaloneMedia =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  // `navigator.standalone` es de Safari/iOS, no está en el lib.dom estándar.
  const iosStandaloneFlag = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const permission: NotificationPermission = 'Notification' in window ? Notification.permission : 'denied';

  let subscribed = false;
  if (hasServiceWorker && hasPushManager) {
    try {
      // `getRegistration()` y no `ready`: `ready` no falla si el service worker
      // no llegó a registrarse, se queda esperando para siempre y el bloque
      // se quedaría en "Comprobando…".
      const registration = await navigator.serviceWorker.getRegistration();
      subscribed = (await registration?.pushManager.getSubscription()) != null;
    } catch {
      subscribed = false;
    }
  }

  return {
    isIOS: isIOSDevice(navigator.userAgent, navigator.maxTouchPoints),
    isStandalone: standaloneMedia || iosStandaloneFlag,
    hasServiceWorker,
    hasPushManager,
    permission,
    subscribed,
  };
}

/**
 * Pide permiso y suscribe este dispositivo. REGLA DE iOS: `requestPermission()`
 * tiene que ser la PRIMERA `await` de la cadena que arranca con el toque de la
 * dueña — cualquier `await` antes (leer el entorno, una consulta a Supabase…)
 * rompe el gesto de usuario y Safari deniega el permiso solo, sin preguntar.
 */
export async function enablePush(businessId: number, vapidPublicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('No diste permiso para los avisos.');
  }

  // `getRegistration()` y no `ready`, igual que en readPushEnvironment: si el
  // service worker no se registró, `ready` no falla nunca y el botón se quedaría
  // en "Activando…" para siempre.
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    throw new Error('Citelis no terminó de prepararse. Recarga Citelis e inténtalo de nuevo.');
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    // Cast necesario: TS 5.7 tipa `Uint8Array.from(...)` como
    // `Uint8Array<ArrayBufferLike>`, que ya no encaja con el `BufferSource`
    // más estricto de lib.dom (exige `ArrayBuffer`, no `SharedArrayBuffer`).
    // En tiempo de ejecución sí es un `ArrayBuffer` normal: nunca viene de
    // memoria compartida.
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });

  const row = subscriptionToRow(subscription.toJSON());
  if (!row) {
    throw new Error('El teléfono no entregó los datos completos de la suscripción.');
  }

  const { error } = await supabase.rpc('save_push_subscription', {
    p_business_id: businessId,
    p_endpoint: row.endpoint,
    p_p256dh: row.p256dh,
    p_auth: row.auth,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Borra la suscripción de este dispositivo, tanto en Supabase como en el navegador. */
export async function disablePush(businessId: number): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  // RLS solo deja borrar las filas propias (business_member); borrar primero
  // en Supabase y luego en el navegador para no dejar un endpoint muerto que
  // Edge Function siga intentando avisar.
  // El negocio va explícito aunque la RLS ya lo limite (INVARIANTE 1).
  const { error } = await supabase
    .from('push_subscription')
    .delete()
    .eq('business_id', businessId)
    .eq('endpoint', subscription.endpoint);
  if (error) {
    throw new Error(error.message);
  }
  await subscription.unsubscribe();
}
