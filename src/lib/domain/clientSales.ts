// Ventas de servicios por clienta en un periodo — función pura, solo LECTURA.
// Suma valores ya congelados de citas COMPLETED (INVARIANTE 2); nunca recalcula.
// Solo servicios: la ropa tiene su propio reporte (INVARIANTE 3).
import type { Appointment, AppointmentPayment } from './types';
import { appointmentBalance, normalizeClientKey, paidTotal } from './payments';

export interface ClientSales {
  key: string;
  /** Grafía de la cita más reciente del periodo, con los espacios limpios. */
  client: string;
  /** Citas completadas en el periodo. */
  visits: number;
  /** Σ lo cobrado (centavos). */
  sold: number;
  /** Σ lo pagado de esas citas, venga del abono, del cobro o de un pago posterior. */
  paid: number;
  /** Lo que todavía debe de esas citas. */
  owes: number;
  /** Σ ganancia congelada. */
  profit: number;
}

/**
 * Lo vendido a cada clienta en `[from, to)`, de la que más compró a la que menos.
 * Se agrupa por nombre normalizado, igual que los créditos: las citas anteriores
 * al registro de clientas no traen `client_id` y partirían a una misma clienta.
 */
export function salesByClient(
  appointments: readonly Appointment[],
  payments: readonly AppointmentPayment[],
  businessId: number,
  from: string,
  to: string,
): ClientSales[] {
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();
  const recentFirst = appointments
    .filter((a) => {
      if (a.business_id !== businessId || a.status !== 'COMPLETED') return false;
      const t = new Date(a.datetime).getTime();
      return t >= fromTime && t < toTime;
    })
    .sort((a, b) => b.datetime.localeCompare(a.datetime));

  const groups = new Map<string, ClientSales>();
  for (const a of recentFirst) {
    const key = normalizeClientKey(a.client);
    let group = groups.get(key);
    if (!group) {
      group = { key, client: a.client.trim().replace(/\s+/g, ' '), visits: 0, sold: 0, paid: 0, owes: 0, profit: 0 };
      groups.set(key, group);
    }
    const charged = a.charged_price ?? 0;
    const paid = paidTotal(payments, a.id, businessId);
    group.visits += 1;
    group.sold += charged;
    group.paid += paid;
    group.owes += appointmentBalance(charged, paid);
    group.profit += a.profit ?? 0;
  }
  return [...groups.values()].sort((a, b) => b.sold - a.sold || a.key.localeCompare(b.key));
}
