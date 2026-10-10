// Agregaciones de reportes — funciones puras (PLAN.md §3, Slice 3).
// Solo LECTURA: agrega valores ya congelados de citas COMPLETED. No recalcula nada.
// CERO dependencias de React. Todo en centavos enteros.

import type { Appointment, FixedExpense, Service } from './types';
import { effectiveCost, priceForServices, profit } from './costs';

export interface MostProfitableService {
  service_id: number;
  profit: number; // ganancia acumulada del servicio en el periodo (centavos)
}

/**
 * Una línea de `appointment_service` con su ganancia congelada (decisión D1). Es lo
 * que hace falta para repartir la ganancia de una cita entre sus servicios.
 * `profit` es null mientras la cita no está COMPLETED.
 */
export interface ServiceProfitLine {
  appointment_id: number;
  service_id: number;
  business_id: number;
  profit: number | null;
}

export interface WeekSummary {
  business_id: number;
  from: string; // ISO 8601 (inclusive)
  to: string; // ISO 8601 (exclusive)
  completed_count: number;
  total_income: number; // Σ charged_price (centavos)
  total_cost: number; // Σ actual_cost de insumos (centavos)
  gross_profit: number; // Σ profit de las citas (centavos) — ANTES de gastos fijos
  most_profitable_service: MostProfitableService | null;
}

/**
 * Resumen de un periodo para un negocio.
 *
 * - Filtra por `business_id` (INVARIANTE 1: ninguna lectura omite el tenant).
 * - Cuenta SOLO citas COMPLETED cuyo `datetime` cae en el rango `[from, to)`
 *   (desde inclusive, hasta exclusivo — evita solapes entre semanas).
 * - Suma los valores congelados; nunca recalcula precios ni costos.
 * - Los totales salen de la cita misma. El "servicio más rentable" suma la
 *   ganancia congelada de cada LÍNEA (`lines`), de modo que un servicio acompañante
 *   recibe lo suyo y no queda tapado por el principal. Una cita sin líneas con
 *   ganancia se atribuye a su servicio principal (cita anterior al reparto): nunca
 *   se redistribuye ni se recalcula la historia (INVARIANTE 2).
 */
export function weekSummary(
  appointments: readonly Appointment[],
  businessId: number,
  from: string,
  to: string,
  lines: readonly ServiceProfitLine[] = [],
): WeekSummary {
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();

  const inScope = appointments.filter((a) => {
    if (a.business_id !== businessId) return false;
    if (a.status !== 'COMPLETED') return false;
    const t = new Date(a.datetime).getTime();
    return t >= fromTime && t < toTime;
  });

  let total_income = 0;
  let total_cost = 0;
  let gross_profit = 0;
  const profitByService = new Map<number, number>();

  // Líneas con ganancia congelada, por cita (INVARIANTE 1: solo las de este negocio).
  const linesByAppointment = new Map<number, ServiceProfitLine[]>();
  for (const line of lines) {
    if (line.business_id !== businessId || line.profit === null) continue;
    const list = linesByAppointment.get(line.appointment_id);
    if (list) list.push(line);
    else linesByAppointment.set(line.appointment_id, [line]);
  }

  for (const a of inScope) {
    // Las citas COMPLETED tienen los tres valores congelados (no null), pero
    // el contrato los tipa como `number | null`; el `?? 0` es defensivo.
    total_income += a.charged_price ?? 0;
    total_cost += a.actual_cost ?? 0;
    gross_profit += a.profit ?? 0;

    const own = linesByAppointment.get(a.id);
    if (own && own.length > 0) {
      for (const line of own) {
        profitByService.set(line.service_id, (profitByService.get(line.service_id) ?? 0) + (line.profit ?? 0));
      }
    } else {
      profitByService.set(a.service_id, (profitByService.get(a.service_id) ?? 0) + (a.profit ?? 0));
    }
  }

  let most_profitable_service: MostProfitableService | null = null;
  for (const [service_id, serviceProfit] of profitByService) {
    if (
      most_profitable_service === null ||
      serviceProfit > most_profitable_service.profit ||
      // Empate: el service_id más bajo, para resultado determinista.
      (serviceProfit === most_profitable_service.profit &&
        service_id < most_profitable_service.service_id)
    ) {
      most_profitable_service = { service_id, profit: serviceProfit };
    }
  }

  return {
    business_id: businessId,
    from,
    to,
    completed_count: inScope.length,
    total_income,
    total_cost,
    gross_profit,
    most_profitable_service,
  };
}

/** Suma los gastos fijos de un negocio (INVARIANTE 1). Todo en centavos. */
export function sumFixedExpenses(expenses: readonly FixedExpense[], businessId: number): number {
  return expenses
    .filter((e) => e.business_id === businessId)
    .reduce((total, e) => total + e.amount, 0);
}

/** Suma los gastos fijos de UN mes concreto ('YYYY-MM') de un negocio. */
export function fixedExpensesForMonth(
  expenses: readonly FixedExpense[],
  businessId: number,
  month: string,
): number {
  return expenses
    .filter((e) => e.business_id === businessId && e.month === month)
    .reduce((total, e) => total + e.amount, 0);
}

/**
 * Ganancia NETA = ganancia bruta (de las citas) − gastos fijos del periodo.
 * Responde a lo que la dueña quiere ver: "cuánto gané en limpio".
 */
export function netProfit(grossProfit: number, fixedExpensesTotal: number): number {
  return grossProfit - fixedExpensesTotal;
}

/**
 * Ganancia ESPERADA de una cita aún abierta (para la proyección del día).
 * Usa el precio acordado (quoted_price) si existe; si el precio efectivo queda
 * en 0 (servicio variable sin precio acordado) devuelve null → NO se proyecta
 * (precio desconocido, mejor que estimar en negativo por el costo de insumos).
 */
export function expectedProfit(appointment: Appointment, service: Service): number | null {
  const price = appointment.quoted_price ?? service.price;
  if (price <= 0) return null;
  return profit(price, effectiveCost(service));
}

/**
 * Ganancia esperada de una cita abierta con TODOS sus servicios (`services` son
 * los de la cita). Precio: el acordado al agendar, o el del conjunto
 * (`priceForServices`). Devuelve null si no hay servicios, si hay uno de precio
 * variable sin precio y sin acuerdo, o si el precio total es 0 (desconocido):
 * mejor no sumar nada que inventar dinero. Con un solo servicio da lo mismo que
 * `expectedProfit`.
 */
export function expectedProfitForServices(
  appointment: Appointment,
  services: readonly Service[],
): number | null {
  if (services.length === 0) return null;
  const quote = priceForServices(services);
  if (quote.needsPrice.length > 0 && appointment.quoted_price === null) return null;
  const price = appointment.quoted_price ?? quote.total;
  if (price <= 0) return null;
  const cost = services.reduce((sum, s) => sum + effectiveCost(s), 0);
  return profit(price, cost);
}

/**
 * Prorratea un total de gastos fijos MENSUAL a un periodo de `days` días.
 * Base de 30 días/mes. Así la ganancia neta es comparable en día/semana/mes/rango.
 */
export function proratedFixedExpenses(monthlyTotal: number, days: number): number {
  return Math.round((monthlyTotal * days) / 30);
}
