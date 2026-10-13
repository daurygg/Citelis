// Qué le mostramos a la dueña según el estado de su suscripción (S5). Lógica pura:
// la UI solo pinta lo que esta capa decide. El estado en sí lo calcula el servidor
// (`my_subscription()`); aquí solo se lee su fila y se decide aviso o bloqueo.
import type { SubscriptionState, SubscriptionStatus } from './types';

const STATUSES: readonly SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'GRACE', 'BLOCKED', 'EXEMPT'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Fila de `my_subscription()` → estado del dominio. La respuesta viene de la red:
 * se valida su forma. Devuelve null si no hay fila o no se entiende; quien llama
 * trata null como "no bloquees" (el servidor ya hace cumplir el bloqueo).
 */
export function parseMySubscription(data: unknown): SubscriptionState | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!isObj(row)) return null;
  const { status, operational, days_left, ends_at } = row;
  if (typeof status !== 'string' || !STATUSES.includes(status as SubscriptionStatus)) return null;
  if (typeof operational !== 'boolean') return null;
  if (typeof days_left !== 'number' || !Number.isInteger(days_left)) return null;
  if (ends_at !== null && typeof ends_at !== 'string') return null;
  return { status: status as SubscriptionStatus, ends_at, days_left, operational };
}

export type SubscriptionNotice =
  | { kind: 'none' }
  | { kind: 'warning'; status: 'TRIAL' | 'GRACE'; days_left: number; message: string }
  | { kind: 'blocked' };

/** Aviso no bloqueante en prueba o gracia; pantalla de bloqueo en BLOCKED; nada en lo demás. */
export function subscriptionNotice(state: SubscriptionState | null): SubscriptionNotice {
  if (state === null) return { kind: 'none' };
  const days = state.days_left;
  switch (state.status) {
    case 'TRIAL':
      return {
        kind: 'warning',
        status: 'TRIAL',
        days_left: days,
        message: days === 1 ? 'Te queda 1 día de prueba gratis.' : `Te quedan ${days} días de prueba gratis.`,
      };
    case 'GRACE':
      return {
        kind: 'warning',
        status: 'GRACE',
        days_left: days,
        message:
          days === 1
            ? 'Tu plan venció. Te queda 1 día para pagar o la app se bloqueará.'
            : `Tu plan venció. Te quedan ${days} días para pagar o la app se bloqueará.`,
      };
    case 'BLOCKED':
      return { kind: 'blocked' };
    default:
      return { kind: 'none' };
  }
}

/**
 * Enlace de wa.me con el mensaje ya escrito para pagar el plan. Si se conoce el
 * nombre del negocio (sin espacios sobrantes) va en el mensaje; si no, el mensaje
 * sale sin nombre. El texto se codifica para que acentos y símbolos no rompan el enlace.
 */
export function whatsappPaymentLink(phone: string, businessName?: string | null): string {
  const name = businessName?.trim() ?? '';
  const message = name === '' ? 'Hola, quiero renovar mi plan de Citelis.' : `Hola, quiero renovar el plan de Citelis de ${name}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
