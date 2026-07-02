// Agregaciones de reportes — funciones puras (PLAN.md §3, Slice 3).
// Solo LECTURA: agrega valores ya congelados de citas COMPLETED. No recalcula nada.
// CERO dependencias de React. Todo en centavos enteros.

import type { Appointment, FixedExpense } from './types';

export interface MostProfitableService {
  service_id: number;
  profit: number; // ganancia acumulada del servicio en el periodo (centavos)
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
 */
export function weekSummary(
  appointments: readonly Appointment[],
  businessId: number,
  from: string,
  to: string,
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

  for (const a of inScope) {
    // Las citas COMPLETED tienen los tres valores congelados (no null), pero
    // el contrato los tipa como `number | null`; el `?? 0` es defensivo.
    total_income += a.charged_price ?? 0;
    total_cost += a.actual_cost ?? 0;
    gross_profit += a.profit ?? 0;

    const acc = profitByService.get(a.service_id) ?? 0;
    profitByService.set(a.service_id, acc + (a.profit ?? 0));
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

/**
 * Ganancia NETA = ganancia bruta (de las citas) − gastos fijos del periodo.
 * Responde a lo que la dueña quiere ver: "cuánto gané en limpio".
 */
export function netProfit(grossProfit: number, fixedExpensesTotal: number): number {
  return grossProfit - fixedExpensesTotal;
}

/**
 * Prorratea un total de gastos fijos MENSUAL a un periodo de `days` días.
 * Base de 30 días/mes. Así la ganancia neta es comparable en día/semana/mes/rango.
 */
export function proratedFixedExpenses(monthlyTotal: number, days: number): number {
  return Math.round((monthlyTotal * days) / 30);
}
