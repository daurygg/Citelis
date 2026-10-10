// Pagos y crédito de servicios (P3), sin React (INVARIANTE 5). Lo pagado de una cita
// es la SUMA de sus pagos; lo que se cobró está congelado en la cita (INVARIANTE 2).
// El saldo es la diferencia, y se deriva: nunca se guarda ni cambia lo congelado.
// CERO dependencias de React. Todo en centavos enteros.

import type { Appointment, AppointmentPayment, PaymentMethod } from './types';
import { parseMoneyToCents } from '../format';

/** Las vías que la dueña ve, en el orden en que se ofrecen. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'transfer', 'card'];

/** Nombre de la vía en el idioma de la dueña. Un abono histórico no tiene vía. */
export function paymentMethodLabel(method: PaymentMethod | null): string {
  switch (method) {
    case 'cash':
      return 'Efectivo';
    case 'transfer':
      return 'Transferencia';
    case 'card':
      return 'Tarjeta';
    default:
      return 'Sin vía registrada';
  }
}

/** Lo pagado de una cita: solo sus pagos y los de ESTE negocio (INVARIANTE 1). */
export function paidTotal(payments: readonly AppointmentPayment[], appointmentId: number, businessId: number): number {
  return payments
    .filter((p) => p.business_id === businessId && p.appointment_id === appointmentId)
    .reduce((sum, p) => sum + p.amount, 0);
}

/** Lo que falta por pagar: cobrado menos pagado, nunca negativo. */
export function appointmentBalance(chargedPrice: number, paid: number): number {
  return Math.max(0, chargedPrice - paid);
}

export type PaymentStatus =
  | { kind: 'NOT_CHARGED'; paid: number; balance: 0 } // todavía no hay total congelado
  | { kind: 'PAID'; paid: number; balance: 0 }
  | { kind: 'CREDIT'; paid: number; balance: number }; // cobrada con saldo: fiado

export function paymentStatus(appointment: Appointment, payments: readonly AppointmentPayment[], businessId: number): PaymentStatus {
  const paid = paidTotal(payments, appointment.id, businessId);
  if (appointment.status !== 'COMPLETED' || appointment.charged_price === null) {
    return { kind: 'NOT_CHARGED', paid, balance: 0 };
  }
  const balance = appointmentBalance(appointment.charged_price, paid);
  return balance > 0 ? { kind: 'CREDIT', paid, balance } : { kind: 'PAID', paid, balance: 0 };
}

export type AmountCheck = { ok: true } | { ok: false; reason: string };

/** ¿Se puede registrar este pago (centavos) contra este saldo? Bloquea solo lo imposible. */
export function checkPaymentAmount(cents: number, balance: number): AmountCheck {
  if (!Number.isInteger(cents) || cents <= 0) return { ok: false, reason: 'Escribe cuánto pagó.' };
  if (cents > balance) return { ok: false, reason: 'Eso es más de lo que debe.' };
  return { ok: true };
}

/** Una fila de la pantalla de cobro: lo tecleado y la vía elegida. */
export interface PaymentRowText {
  amount: string;
  method: PaymentMethod;
}

export interface PaymentPlan {
  /** Lo que se manda al servidor: solo filas con un monto válido. */
  payments: { amount: number; method: PaymentMethod }[];
  /** Suma de estos pagos nuevos (sin contar lo ya abonado). */
  paid: number;
  /** Lo que queda a crédito tras abono y pagos nuevos. */
  credit: number;
  /** Abono + pagos nuevos pasan del total: lo único que bloquea el cobro. */
  overpaid: boolean;
  /** Alguna fila no se entiende (no es dinero o es cero). */
  invalid: boolean;
}

/**
 * Lee los pagos tecleados al cobrar. `total` es lo que se cobra y `alreadyPaid`
 * lo ya abonado antes. Las filas vacías se ignoran; pagar de menos NO bloquea (el
 * resto queda a crédito) y solo el sobrepago impide cobrar.
 */
export function buildPaymentPlan(rows: readonly PaymentRowText[], total: number, alreadyPaid: number): PaymentPlan {
  const payments: { amount: number; method: PaymentMethod }[] = [];
  let invalid = false;
  for (const row of rows) {
    if (row.amount.trim() === '') continue;
    const cents = parseMoneyToCents(row.amount);
    if (cents === null || cents <= 0) {
      invalid = true;
      continue;
    }
    payments.push({ amount: cents, method: row.method });
  }
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const overpaid = alreadyPaid + paid > total;
  return { payments, paid, credit: overpaid ? 0 : Math.max(0, total - alreadyPaid - paid), overpaid, invalid };
}

/** Ingresos de un periodo repartidos por vía. `unknown` = abonos históricos sin vía. */
export interface IncomeByMethod {
  by_method: Record<PaymentMethod | 'unknown', number>;
  /** Σ pagos de las citas cobradas del periodo. */
  total_paid: number;
  /** Σ lo cobrado de esas citas: NO es lo mismo que lo pagado cuando hay crédito. */
  total_charged: number;
  /** Lo cobrado que aún no se ha pagado (crédito vivo). */
  pending_credit: number;
}

/**
 * Pagos por vía de las citas COMPLETED cuyo `datetime` cae en `[from, to)` (la misma
 * regla que `weekSummary`). Cada pago se atribuye a la fecha de SU CITA, no a la del
 * pago: así lo cobrado, lo pagado y el crédito del periodo cuadran entre sí. Un
 * pago de crédito posterior sube el pagado de la cita en su periodo original.
 */
export function incomeByMethod(
  appointments: readonly Appointment[],
  payments: readonly AppointmentPayment[],
  businessId: number,
  from: string,
  to: string,
): IncomeByMethod {
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();
  const by_method: IncomeByMethod['by_method'] = { cash: 0, transfer: 0, card: 0, unknown: 0 };
  let total_paid = 0;
  let total_charged = 0;
  let pending_credit = 0;

  for (const a of appointments) {
    if (a.business_id !== businessId || a.status !== 'COMPLETED') continue;
    const t = new Date(a.datetime).getTime();
    if (t < fromTime || t >= toTime) continue;
    const own = payments.filter((p) => p.business_id === businessId && p.appointment_id === a.id);
    let paid = 0;
    for (const p of own) {
      by_method[p.method ?? 'unknown'] += p.amount;
      paid += p.amount;
    }
    total_paid += paid;
    total_charged += a.charged_price ?? 0;
    pending_credit += appointmentBalance(a.charged_price ?? 0, paid);
  }
  return { by_method, total_paid, total_charged, pending_credit };
}

/**
 * Clave para agrupar el crédito por clienta. El nombre es TEXTO LIBRE (no hay
 * tabla de clientas), así que se normaliza: sin acentos, sin mayúsculas y con los
 * espacios colapsados. El teléfono NO entra en la clave: no todas las citas lo
 * traen y partiría a una misma clienta en dos. Dos personas con el mismo nombre
 * se agrupan juntas: es el límite de no tener ficha de clienta.
 */
export function normalizeClientKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export interface CreditAppointment {
  appointment: Appointment;
  paid: number;
  balance: number;
}

export interface ClientCredit {
  key: string;
  /** Grafía de la cita más reciente, con los espacios limpios. */
  client: string;
  /** El primer teléfono que traiga alguna de sus citas, si lo hay. */
  phone: string | null;
  balance: number;
  /** Citas con saldo, la más reciente primero. */
  appointments: CreditAppointment[];
}

/** Crédito vivo de servicios por clienta, de mayor a menor saldo. */
export function creditsByClient(
  appointments: readonly Appointment[],
  payments: readonly AppointmentPayment[],
  businessId: number,
): ClientCredit[] {
  const groups = new Map<string, ClientCredit>();
  const recentFirst = appointments
    .filter((a) => a.business_id === businessId && a.status === 'COMPLETED' && a.charged_price !== null)
    .sort((a, b) => b.datetime.localeCompare(a.datetime));

  for (const a of recentFirst) {
    const paid = paidTotal(payments, a.id, businessId);
    const balance = appointmentBalance(a.charged_price ?? 0, paid);
    if (balance <= 0) continue;
    const key = normalizeClientKey(a.client);
    let group = groups.get(key);
    if (!group) {
      group = { key, client: a.client.trim().replace(/\s+/g, ' '), phone: null, balance: 0, appointments: [] };
      groups.set(key, group);
    }
    group.balance += balance;
    group.appointments.push({ appointment: a, paid, balance });
    if (group.phone === null && a.client_phone) group.phone = a.client_phone;
  }
  return [...groups.values()].sort((a, b) => b.balance - a.balance || a.key.localeCompare(b.key));
}
