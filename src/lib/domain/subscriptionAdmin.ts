// Lógica pura del panel de administración de la plataforma (S6): mapeo de las filas de
// `admin_list_businesses()`, etiquetas en lenguaje claro y validación del formulario
// "Registrar pago". El servidor vuelve a validar todo; esto solo da respuesta inmediata.
import type { AdminBusiness, SubscriptionPaymentMethod, SubscriptionStatus } from './types';

const STATUSES: readonly SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'GRACE', 'BLOCKED', 'EXEMPT'];
export const SUBSCRIPTION_PAYMENT_METHODS: readonly SubscriptionPaymentMethod[] = ['TRANSFER', 'CASH', 'CARD', 'OTHER'];

// República Dominicana no tiene horario de verano: UTC-4 fijo todo el año.
const DR_OFFSET = '-04:00';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(field: string): never {
  throw new Error(`Respuesta inesperada del servidor en ${field}.`);
}
// PostgREST entrega bigint como número, pero puede llegar como texto: se normaliza.
function toInt(v: unknown, field: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) return fail(field);
  return n;
}
function toIntOrNull(v: unknown, field: string): number | null {
  return v === null || v === undefined ? null : toInt(v, field);
}
function toStrOrNull(v: unknown, field: string): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? v : fail(field);
}

/** Filas de `admin_list_businesses()` → `AdminBusiness[]`. Lanza si una fila no se entiende. */
export function parseAdminBusinesses(data: unknown): AdminBusiness[] {
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) return fail('la lista');
  return data.map((row) => {
    if (!isObj(row)) return fail('una fila');
    if (typeof row.name !== 'string') return fail('name');
    if (typeof row.exempt !== 'boolean' && row.exempt !== null) return fail('exempt');
    const status = toStrOrNull(row.status, 'status');
    if (status !== null && !STATUSES.includes(status as SubscriptionStatus)) return fail('status');
    return {
      business_id: toInt(row.business_id, 'business_id'),
      name: row.name,
      slug: toStrOrNull(row.slug, 'slug'),
      plan: toStrOrNull(row.plan, 'plan'),
      trial_ends_at: toStrOrNull(row.trial_ends_at, 'trial_ends_at'),
      paid_until: toStrOrNull(row.paid_until, 'paid_until'),
      exempt: row.exempt === true,
      status: status as SubscriptionStatus | null,
      last_payment_at: toStrOrNull(row.last_payment_at, 'last_payment_at'),
      last_payment_cents: toIntOrNull(row.last_payment_cents, 'last_payment_cents'),
    };
  });
}

/** Estado en palabras de todos los días (INVARIANTE 4: nada de TRIAL/GRACE en pantalla). */
export function subscriptionStatusLabel(status: SubscriptionStatus | null): string {
  const labels: Record<SubscriptionStatus, string> = {
    TRIAL: 'En prueba',
    ACTIVE: 'Al día',
    GRACE: 'Vencido, con plazo',
    BLOCKED: 'Bloqueado',
    EXEMPT: 'Exento',
  };
  return status === null ? 'Sin plan' : labels[status];
}

export function subscriptionPaymentMethodLabel(method: SubscriptionPaymentMethod): string {
  const labels: Record<SubscriptionPaymentMethod, string> = {
    TRANSFER: 'Transferencia',
    CASH: 'Efectivo',
    CARD: 'Tarjeta',
    OTHER: 'Otro',
  };
  return labels[method];
}

/**
 * Monto en RD$ escrito por el administrador → centavos enteros. Acepta "1500",
 * "1,500.50" y "RD$ 99.9". Aritmética de enteros (sin `* 100` en coma flotante).
 * Devuelve null si no es un monto bien formado (máximo 2 decimales). El 0 se devuelve
 * como 0: decidir si es válido es cosa de `validatePaymentForm`.
 */
export function parseAmountToCents(text: string): number | null {
  const cleaned = text.replace(/RD\$/gi, '').replace(/\s/g, '');
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.replace(/,/g, '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export interface PaymentFormInput {
  amount: string; // RD$ tal como lo escribió
  paid_until: string; // 'YYYY-MM-DD'
  method: string;
  note: string;
}

export interface PaymentArgs {
  amount_cents: number;
  paid_until: string; // ISO con zona, fin del día elegido
  method: SubscriptionPaymentMethod;
  note: string | null;
}

export type PaymentFormErrors = Partial<Record<'amount' | 'paid_until' | 'method', string>>;
export type PaymentFormResult = { ok: true; value: PaymentArgs } | { ok: false; errors: PaymentFormErrors };

/** 'YYYY-MM-DD' real → ISO al final de ese día (hora de RD), o null si no es una fecha. */
function endOfDayIso(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${date}T23:59:59${DR_OFFSET}`;
}

/**
 * Valida "Registrar pago" con las mismas reglas que `admin_register_payment`: monto > 0,
 * fecha presente y posterior a la actual (`currentPaidUntil`; null si nunca pagó), y vía
 * válida. Devuelve todos los errores juntos para marcarlos de una vez.
 */
export function validatePaymentForm(input: PaymentFormInput, currentPaidUntil: string | null): PaymentFormResult {
  const errors: PaymentFormErrors = {};

  const cents = parseAmountToCents(input.amount);
  if (cents === null || cents <= 0) errors.amount = 'Escribe un monto mayor que cero. Ejemplo: 1500 o 1,500.50';

  const paidUntil = endOfDayIso(input.paid_until);
  if (paidUntil === null) {
    errors.paid_until = 'Elige hasta qué fecha queda pagado.';
  } else if (currentPaidUntil !== null && Date.parse(paidUntil) <= Date.parse(currentPaidUntil)) {
    errors.paid_until = 'La fecha debe ser posterior a la que ya tiene pagada.';
  }

  const method = SUBSCRIPTION_PAYMENT_METHODS.find((m) => m === input.method);
  if (method === undefined) errors.method = 'Elige cómo pagó.';

  if (Object.keys(errors).length > 0 || cents === null || paidUntil === null || method === undefined) {
    return { ok: false, errors };
  }
  const note = input.note.trim();
  return { ok: true, value: { amount_cents: cents, paid_until: paidUntil, method, note: note === '' ? null : note } };
}
