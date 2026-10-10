// La pantalla de cobro, sin React (INVARIANTE 5): qué se le pide a la dueña, cuándo
// está lista para cobrar, y qué se manda a persistir. CERO dependencias de React.
//
// Sustituye al booleano `isVariable` de la UI: con varios servicios, "¿esta cita
// es de precio variable?" no tiene respuesta. La pregunta correcta es "¿a qué
// servicios les falta precio?", y se contesta uno por uno (D2 de
// odd/tasks/multi-service-appointments.md).

import type { Appointment, Employee, Service } from './types';
import { activeEmployees } from './employees';
import {
  appointmentServiceIds,
  appointmentServiceLines,
  completeAppointment,
  lineDiscountCents,
  type AppointmentServiceLine,
  type CompleteOptions,
} from './appointments';
import { parseDiscountText, type DiscountText, type LineDiscount } from './discounts';
import { parseMoneyToCents } from '../format';

/** Lo que la dueña ha tecleado en la pantalla de cobro (texto crudo). */
export interface ChargeTexts {
  /** Precio de cada servicio de precio variable, por id de servicio. */
  prices: Record<number, string>;
  /** Total cobrado, opcional (precio pactado / combo). */
  total: string;
  /** Empleada elegida por servicio (id de servicio → id de empleada). Opcional. */
  employees?: Record<number, number | null>;
  /** Descuento tecleado por servicio (id de servicio → monto o %). Opcional. */
  discounts?: Record<number, DiscountText>;
}

export interface ChargeForm {
  /** Servicios de la cita a los que hay que pedirles precio, en orden de la cita. */
  variableServices: Service[];
  /** Precio de cada servicio variable ya tecleado, en centavos. */
  priceOverrides: Map<number, number>;
  /** Empleada elegida por servicio (opcional): solo las activas y de esta cita. */
  employeeIds: Map<number, number>;
  /** Descuento pedido por servicio (solo los que la dueña tecleó y se entienden). */
  discounts: Map<number, LineDiscount>;
  /** Servicios cuyo descuento tecleado no se entiende (letras, % mayor que 100). */
  invalidDiscounts: Set<number>;
  /** Total que manda sobre la suma, si lo hay. */
  overridePrice: number | undefined;
  /** ¿Se puede completar? Todos los variables tienen precio. */
  ready: boolean;
  /** Con un solo servicio variable su precio ES el total: el campo sobra. */
  showTotalField: boolean;
}

/**
 * Servicios de la cita tomados del catálogo, en el orden de la cita. null si
 * falta alguno: cobrar con un servicio de menos congelaría un dinero falso.
 */
export function appointmentServices(appointment: Appointment, catalog: readonly Service[]): Service[] | null {
  const found = appointmentServiceIds(appointment).map((id) => catalog.find((s) => s.id === id));
  if (found.some((s) => s === undefined)) return null;
  return found as Service[];
}

function positiveCents(text: string | undefined): number | null {
  const cents = parseMoneyToCents(text ?? '');
  return cents !== null && cents > 0 ? cents : null;
}

/** Deriva, de lo tecleado, qué se manda al dominio y si se puede cobrar. */
export function buildChargeForm(
  services: readonly Service[],
  texts: ChargeTexts,
  employees: readonly Employee[] = [],
): ChargeForm {
  const variableServices = services.filter((s) => s.variable_price);
  const priceOverrides = new Map<number, number>();
  for (const service of variableServices) {
    const cents = positiveCents(texts.prices[service.id]);
    if (cents !== null) priceOverrides.set(service.id, cents);
  }

  // La empleada es opcional: solo cuenta la que la dueña eligió, para un servicio
  // de ESTA cita y que siga activa (el servidor rechaza a una dada de baja).
  const assignable = new Set(activeEmployees(employees).map((e) => e.id));
  const employeeIds = new Map<number, number>();
  for (const service of services) {
    const chosen = texts.employees?.[service.id];
    if (chosen != null && assignable.has(chosen)) employeeIds.set(service.id, chosen);
  }

  // El descuento es opcional por servicio. Que no se entienda bloquea el cobro
  // (`ready`): cobrar sin él sería cobrar más de lo que la dueña quería. Que sea
  // MAYOR que el precio de la línea lo detecta `previewLines`, que sí conoce el precio.
  const discounts = new Map<number, LineDiscount>();
  const invalidDiscounts = new Set<number>();
  for (const service of services) {
    const parsed = parseDiscountText(texts.discounts?.[service.id]);
    if (parsed.invalid) invalidDiscounts.add(service.id);
    else if (parsed.discount !== null) discounts.set(service.id, parsed.discount);
  }

  const single = services.length === 1;
  const totalCents = texts.total.trim() === '' ? undefined : (parseMoneyToCents(texts.total) ?? undefined);

  // Con UN servicio variable, lo tecleado en su campo es el precio cobrado. Se
  // manda también como total porque el dominio da prioridad al precio acordado al
  // agendar (`quoted_price`), y lo que la dueña escribe ahora debe ganarle.
  const singleVariable = single && variableServices.length === 1 ? priceOverrides.get(variableServices[0].id) : undefined;

  return {
    variableServices,
    priceOverrides,
    employeeIds,
    discounts,
    invalidDiscounts,
    overridePrice: singleVariable ?? totalCents,
    ready: variableServices.every((s) => priceOverrides.has(s.id)) && invalidDiscounts.size === 0,
    showTotalField: !(single && variableServices.length === 1),
  };
}

/**
 * Valores con los que arranca la pantalla. El precio acordado al agendar se
 * precarga donde corresponde: en el campo del servicio si es uno variable solo,
 * en el total en los demás casos.
 */
export function initialChargeTexts(appointment: Appointment, services: readonly Service[]): ChargeTexts {
  const empty: ChargeTexts = { prices: {}, total: '' };
  if (appointment.quoted_price == null) return empty;
  const text = String(appointment.quoted_price / 100);
  if (services.length === 1 && services[0].variable_price) {
    return { prices: { [services[0].id]: text }, total: '' };
  }
  return { prices: {}, total: text };
}

/** Lo que el dominio calculó al completar: la cita congelada y su reparto. */
export interface CompletionPlan {
  completed: Appointment;
  lines: AppointmentServiceLine[];
}

/**
 * Calcula TODO lo que se congela al completar, sin tocar nada. Lanza si la cita
 * no se puede completar, si falta un servicio del catálogo o si el reparto no
 * tiene de dónde salir. Quien persiste solo guarda lo que esto devuelve.
 */
export function planCompletion(
  appointment: Appointment,
  catalog: readonly Service[],
  options: CompleteOptions,
): CompletionPlan {
  const services = appointmentServices(appointment, catalog);
  if (services === null) {
    throw new Error(`Faltan servicios de la cita ${appointment.id} en el catálogo.`);
  }
  const completed = completeAppointment(appointment, services, options);
  const employeeIds = options.employeeIds;
  const discountCents = lineDiscountCents(appointment, services, options);
  const lines = appointmentServiceLines(completed, services, options.priceOverrides, discountCents).map((line) => {
    const employeeId = employeeIds?.get(line.service_id);
    return employeeId === undefined ? line : { ...line, employee_id: employeeId };
  });
  return { completed, lines };
}

/** Argumentos de la RPC `complete_appointment`. El negocio va explícito (INVARIANTE 1). */
export function completeRpcArgs(businessId: number, plan: CompletionPlan) {
  const { completed, lines } = plan;
  return {
    p_business_id: businessId,
    p_appointment_id: completed.id,
    p_charged_price: completed.charged_price as number,
    p_actual_cost: completed.actual_cost as number,
    p_profit: completed.profit as number,
    p_lines: lines,
  };
}
