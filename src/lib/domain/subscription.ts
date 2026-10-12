// Estado de la suscripción de un negocio a Citelis (odd/tasks/saas-subscriptions.md).
// Función pura: el llamador entrega la suscripción y el instante `now`. La base de datos
// tiene su espejo en `subscription_status()`; si cambia una regla, cambian las dos.
import type { BusinessSubscription, SubscriptionState } from './types';

export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;

const DAY_MS = 86_400_000;

function parseInstant(iso: string, field: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`fecha inválida en ${field}: ${iso}`);
  return ms;
}

// Días que faltan hasta `endMs`, contando un día empezado como un día entero.
function daysUntil(endMs: number, nowMs: number): number {
  return Math.ceil((endMs - nowMs) / DAY_MS);
}

/**
 * Orden de las reglas:
 * 1. Exento: siempre operativo.
 * 2. Pago vigente: al día (gana aunque la prueba siga corriendo).
 * 3. Prueba vigente: en prueba.
 * 4. Vencido hace menos de GRACE_DAYS (contando desde lo último que venció): gracia.
 * 5. Si no, bloqueado.
 */
export function subscriptionStatus(sub: BusinessSubscription, now: Date): SubscriptionState {
  if (sub.exempt) return { status: 'EXEMPT', ends_at: null, days_left: 0, operational: true };

  const nowMs = now.getTime();
  const trialEnd = parseInstant(sub.trial_ends_at, 'trial_ends_at');
  const paidEnd = sub.paid_until === null ? null : parseInstant(sub.paid_until, 'paid_until');

  if (paidEnd !== null && nowMs < paidEnd) {
    return { status: 'ACTIVE', ends_at: sub.paid_until, days_left: daysUntil(paidEnd, nowMs), operational: true };
  }
  if (nowMs < trialEnd) {
    return { status: 'TRIAL', ends_at: sub.trial_ends_at, days_left: daysUntil(trialEnd, nowMs), operational: true };
  }

  const coverageEnd = paidEnd === null ? trialEnd : Math.max(trialEnd, paidEnd);
  const graceEnd = coverageEnd + GRACE_DAYS * DAY_MS;
  if (nowMs < graceEnd) {
    return {
      status: 'GRACE',
      ends_at: new Date(graceEnd).toISOString().replace('.000Z', 'Z'),
      days_left: daysUntil(graceEnd, nowMs),
      operational: true,
    };
  }
  return { status: 'BLOCKED', ends_at: null, days_left: 0, operational: false };
}
