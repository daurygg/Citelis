// Lógica pura del botón "Avisarme de nuevas reservas". Sin React y sin tocar
// `navigator`: la UI lee el entorno y se lo pasa. Ver
// odd/tasks/owner-push-notifications.md (T1b).
//
// La regla de iOS que manda en todo esto: desde iOS 16.4 Safari entrega Web
// Push SOLO a webs añadidas a la pantalla de inicio. Fuera de ahí ni siquiera
// existe `PushManager`, así que "no compatible" sería mentira: lo que falta es
// instalar.

export type PushButtonState =
  /** El navegador no puede recibir push (o iOS anterior a 16.4). */
  | 'unsupported'
  /** iPhone/iPad en Safari: primero hay que añadir Citelis a la pantalla de inicio. */
  | 'needs-install'
  /** La dueña bloqueó los avisos; solo se desbloquea desde Ajustes. */
  | 'denied'
  /** Se puede activar con un toque. */
  | 'off'
  /** Este dispositivo ya recibe los avisos. */
  | 'on';

export interface PushEnvironment {
  isIOS: boolean;
  /** Abierta desde la pantalla de inicio (display-mode standalone). */
  isStandalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: NotificationPermission;
  /** Hay una suscripción viva en este dispositivo. */
  subscribed: boolean;
}

/**
 * iPadOS se presenta como Mac en el user agent; lo delata la pantalla táctil
 * (un Mac no tiene `maxTouchPoints`).
 */
export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

export function pushButtonState(env: PushEnvironment): PushButtonState {
  // Antes que "no compatible": en Safari sin instalar falta PushManager a propósito.
  if (env.isIOS && !env.isStandalone) return 'needs-install';
  if (!env.hasServiceWorker || !env.hasPushManager) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return env.permission === 'granted' && env.subscribed ? 'on' : 'off';
}

/** Clave VAPID pública (base64url, sin relleno) → bytes para `applicationServerKey`. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** `PushSubscription.toJSON()` → lo que guarda `save_push_subscription`, o null si está incompleta. */
export function subscriptionToRow(json: PushSubscriptionJSON): SubscriptionRow | null {
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}
