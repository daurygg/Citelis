// Máquina de estados de citas — funciones puras (PLAN.md §3.3).
// CERO dependencias de React. Modelo append-only (INVARIANTE 2).
//
// Transiciones válidas:
//   PENDING     → IN_PROGRESS   (opcional, "empezó la atención")
//   PENDING     → CANCELED
//   IN_PROGRESS → COMPLETED     ← AQUÍ se congelan charged_price, actual_cost, profit
//   PENDING     → COMPLETED     (atajo permitido: completar directo)
//   REQUESTED   → PENDING       (la dueña acepta la solicitud pública, Slice B)
//   REQUESTED   → REJECTED      (la dueña la rechaza)
//   REQUESTED   → CANCELED      (la clienta se arrepiente antes de que respondan)
// Cualquier otra transición lanza error. Solo COMPLETED cuenta para reportes.
// REQUESTED no puede saltar directo a COMPLETED: una solicitud sin confirmar
// no es una cita aceptada.

import type { Appointment, AppointmentStatus, Service } from './types';
import { allocateProportionally, effectiveCost, priceForServices, profit } from './costs';
import { discountCents, discountError, type LineDiscount, type PricedLine } from './discounts';


/** Transiciones permitidas, indexadas por estado de origen. */
const VALID_TRANSITIONS: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  PENDING: ['IN_PROGRESS', 'CANCELED', 'COMPLETED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELED: [],
  NO_SHOW: [],
  REQUESTED: ['PENDING', 'REJECTED', 'CANCELED'],
  REJECTED: [],
};

/** ¿Es válida la transición `from → to` según la máquina de estados? */
export function isValidTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Cambia el estado de una cita validando la transición.
 * Devuelve una NUEVA cita (no muta la original). Lanza si la transición es inválida.
 *
 * Para completar usar `completeAppointment`, que además congela los valores de dinero.
 */
export function transition(appointment: Appointment, to: AppointmentStatus): Appointment {
  if (!isValidTransition(appointment.status, to)) {
    throw new Error(
      `Transición inválida: ${appointment.status} → ${to} (cita ${appointment.id}).`,
    );
  }
  return { ...appointment, status: to };
}

/**
 * IDs de servicio de una cita. ÚNICA fuente de verdad de "qué servicios tiene
 * esta cita": si trae `service_ids` (varios), se usan esos; si no —toda cita
 * agendada antes de esta fase, o cualquier pantalla que todavía no escribe
 * varios— se cae al `service_id` único. Ver el comentario de `service_ids` en
 * types.ts.
 *
 * Vive aquí y no en scheduling.ts para que la dirección de los imports sea
 * appointments → nada: scheduling.ts ya importa `holdsSchedule` de este módulo,
 * así que tenerlo allá y usarlo acá cerraría un ciclo.
 */
export function appointmentServiceIds(appointment: Appointment): number[] {
  return appointment.service_ids ?? [appointment.service_id];
}

/** Una fila de `appointment_service`: un servicio de una cita. */
export interface AppointmentServiceRow {
  appointment_id: number;
  service_id: number;
  business_id: number;
}

/**
 * Servicios de UNA cita a partir de sus filas de `appointment_service`: el
 * servicio principal (`service_id`) primero y el resto en orden ascendente, para
 * que el orden sea estable entre cargas (la tabla no guarda orden).
 */
export function serviceIdsFromRows(primary: number, rows: readonly AppointmentServiceRow[]): number[] {
  const rest = rows
    .map((r) => r.service_id)
    .filter((id) => id !== primary)
    .sort((a, b) => a - b);
  return rows.some((r) => r.service_id === primary) ? [primary, ...rest] : rest;
}

/**
 * Vuelca las filas de `appointment_service` en `service_ids` de cada cita.
 * Una cita sin filas queda SIN `service_ids`, para que `appointmentServiceIds`
 * caiga a `[service_id]` (citas anteriores, o que aún no tienen sus líneas).
 * Ignora filas de otro negocio (INVARIANTE 1). No muta la lista original.
 */
export function foldServiceIds(
  appointments: readonly Appointment[],
  rows: readonly AppointmentServiceRow[],
  businessId: number,
): Appointment[] {
  const byAppointment = new Map<number, AppointmentServiceRow[]>();
  for (const row of rows) {
    if (row.business_id !== businessId) continue;
    const list = byAppointment.get(row.appointment_id);
    if (list) list.push(row);
    else byAppointment.set(row.appointment_id, [row]);
  }
  return appointments.map((a) => {
    const own = byAppointment.get(a.id);
    if (!own || own.length === 0) return a;
    return { ...a, service_ids: serviceIdsFromRows(a.service_id, own) };
  });
}

/**
 * Nombres de los servicios de la cita, unidos con " + " ("Cejas + Ondas").
 * Un id que no está en el catálogo se omite en vez de reventar; si no se conoce
 * ninguno devuelve '' y quien llama decide el texto de respaldo.
 */
export function serviceNames(appointment: Appointment, services: readonly Service[]): string {
  return appointmentServiceIds(appointment)
    .map((id) => services.find((s) => s.id === id)?.name)
    .filter((name): name is string => name !== undefined)
    .join(' + ');
}

/** Vista previa del cobro: lo que se congelaría si se completara ahora. */
export interface CompletionPreviewValues {
  charged_price: number;
  actual_cost: number;
  profit: number;
}

/**
 * Vista previa de completar una cita con TODOS sus servicios. No congela nada.
 * Misma regla de precio que `completeAppointment`: override > acordado > precio
 * del conjunto. Devuelve null si algún servicio de la cita no está en el
 * catálogo, o si hay uno de precio variable sin precio y sin total dado:
 * inventar el número sería cobrar de menos en silencio.
 */
export function previewCompletion(
  appointment: Appointment,
  services: readonly Service[],
  overridePrice?: number,
  priceOverrides?: ReadonlyMap<number, number>,
  discounts?: ReadonlyMap<number, LineDiscount>,
): CompletionPreviewValues | null {
  const ids = appointmentServiceIds(appointment);
  const found = ids.map((id) => services.find((s) => s.id === id));
  if (found.some((s) => s === undefined)) return null;
  const set = found as Service[];

  // Con el precio que la dueña le puso a cada servicio variable ya no falta
  // ninguno, y el total sale de la suma sin necesidad de un total dado.
  const quote = priceForServices(set, priceOverrides);
  const totalGiven = overridePrice ?? appointment.quoted_price ?? null;
  if (quote.needsPrice.length > 0 && totalGiven === null) return null;

  // Con descuentos, el cobrado es el NETO. Un descuento demasiado grande se recorta
  // aquí (la pantalla lo avisa con `previewLines`); sin descuentos, el bruto de siempre.
  const gross = totalGiven ?? quote.total;
  const discountTotal =
    discounts === undefined || discounts.size === 0
      ? 0
      : resolveDiscounts(gross, set, priceOverrides, discounts).lines.reduce((sum, l) => sum + l.discount, 0);
  const charged_price = gross - discountTotal;
  const actual_cost = set.reduce((sum, s) => sum + effectiveCost(s), 0);
  return { charged_price, actual_cost, profit: profit(charged_price, actual_cost) };
}

/** Una línea del dinero congelado: lo que le tocó a UN servicio de la cita. */
export interface AppointmentServiceLine {
  service_id: number;
  /** Precio bruto de la línea, antes del descuento (P2). */
  list_price: number;
  /** Descuento de la línea en centavos (0 si no hay). */
  discount: number;
  /** El NETO: list_price − discount. Es lo que los reportes leen. */
  charged_price: number;
  actual_cost: number;
  profit: number;
  /** Quién hizo este servicio, si la dueña lo eligió al cobrar. Ausente = sin asignar. */
  employee_id?: number;
}

export interface CompleteOptions {
  /** Empleada de cada servicio, por id de servicio (opcional, solo donde se eligió). */
  employeeIds?: ReadonlyMap<number, number>;
  /** Precio total del cobro, si la dueña cobra algo distinto a la suma de lista. */
  overridePrice?: number;
  /** Precio que la dueña le pone a cada servicio de precio variable, por id. */
  priceOverrides?: ReadonlyMap<number, number>;
  /** Descuento de cada servicio, por id de servicio (opcional, solo donde se pidió). */
  discounts?: ReadonlyMap<number, LineDiscount>;
}

/**
 * Precio de lista de cada línea: el total BRUTO (antes de descuentos) repartido
 * entre los servicios, ponderado por el precio de cada uno. Con UN servicio se
 * lleva todo. Es el mismo reparto de siempre (D1), solo que sobre el bruto.
 *
 * Con un total pactado (`overridePrice`/`quoted_price`) ese total ES el bruto: el
 * pacto fija el reparto entre líneas y el descuento por línea se resta DESPUÉS.
 */
function grossLines(
  gross: number,
  services: readonly Service[],
  priceOverrides?: ReadonlyMap<number, number>,
): { service_id: number; list_price: number }[] {
  if (services.length === 1) return [{ service_id: services[0].id, list_price: gross }];
  const quote = priceForServices(services, priceOverrides);
  const shares = allocateProportionally(gross, quote.lines.map((line) => line.price));
  return quote.lines.map((line, index) => ({ service_id: line.service_id, list_price: shares[index] }));
}

/** Resultado de aplicar los descuentos pedidos al bruto de un cobro. */
export interface ResolvedDiscounts {
  lines: { service_id: number; list_price: number; discount: number }[];
  /** Por servicio, por qué su descuento no vale (mayor que su precio, etc.). */
  errors: Map<number, string>;
}

/**
 * Convierte los descuentos pedidos a centavos sobre el precio de lista de cada
 * línea. No lanza: devuelve los errores aparte para que la pantalla los muestre.
 * Un descuento inválido se recorta (nunca más que el precio) pero queda en `errors`.
 */
export function resolveDiscounts(
  gross: number,
  services: readonly Service[],
  priceOverrides?: ReadonlyMap<number, number>,
  discounts?: ReadonlyMap<number, LineDiscount>,
): ResolvedDiscounts {
  const errors = new Map<number, string>();
  const lines = grossLines(gross, services, priceOverrides).map((line) => {
    const requested = discounts?.get(line.service_id);
    if (requested === undefined) return { ...line, discount: 0 };
    const error = discountError(line.list_price, requested);
    if (error !== null) errors.set(line.service_id, error);
    return { ...line, discount: discountCents(line.list_price, requested) };
  });
  return { lines, errors };
}

/**
 * Descuento en centavos de cada servicio que lo tiene, para `appointmentServiceLines`.
 * Lanza si alguno no es válido: cobrar otra cosa que lo que la dueña escribió no se admite.
 */
export function lineDiscountCents(
  appointment: Appointment,
  services: readonly Service[],
  options: CompleteOptions = {},
): Map<number, number> {
  const gross = grossPrice(appointment, services, options);
  if (gross === null || options.discounts === undefined || options.discounts.size === 0) return new Map();
  return discountCentsById(resolveDiscounts(gross, services, options.priceOverrides, options.discounts), services);
}

/** Descuento en centavos por servicio. Lanza si alguno no es válido. */
function discountCentsById(resolved: ResolvedDiscounts, services: readonly Service[]): Map<number, number> {
  if (resolved.errors.size > 0) {
    const [serviceId, message] = [...resolved.errors][0];
    const name = services.find((s) => s.id === serviceId)?.name ?? `servicio ${serviceId}`;
    throw new Error(`Descuento de ${name}: ${message}`);
  }
  return new Map(resolved.lines.filter((l) => l.discount > 0).map((l) => [l.service_id, l.discount]));
}

/**
 * Total BRUTO de un cobro (antes de descuentos): override > acordado al agendar >
 * precio del conjunto. null si falta algún precio variable y no hay total dado.
 */
export function grossPrice(
  appointment: Appointment,
  services: readonly Service[],
  options: Pick<CompleteOptions, 'overridePrice' | 'priceOverrides'> = {},
): number | null {
  const quote = priceForServices(services, options.priceOverrides);
  const totalGiven = options.overridePrice ?? appointment.quoted_price ?? null;
  if (quote.needsPrice.length > 0 && totalGiven === null) return null;
  return totalGiven ?? quote.total;
}

/**
 * Desglose de un cobro por línea (lista, descuento, neto) para la vista previa de
 * la pantalla de cobro. No congela nada. null si faltan servicios o precios.
 */
export function previewLines(
  appointment: Appointment,
  services: readonly Service[],
  options: CompleteOptions = {},
): { lines: (PricedLine & { service_id: number })[]; errors: Map<number, string> } | null {
  // Solo los servicios DE LA CITA, en su orden: quien llama puede pasar el
  // catálogo entero, y un servicio ajeno inflaría el subtotal o se llevaría
  // parte del total pactado.
  const found = appointmentServiceIds(appointment).map((id) => services.find((s) => s.id === id));
  if (found.some((s) => s === undefined)) return null;
  const own = found as Service[];
  const gross = grossPrice(appointment, own, options);
  if (gross === null) return null;
  const resolved = resolveDiscounts(gross, own, options.priceOverrides, options.discounts);
  return {
    lines: resolved.lines.map((l) => ({ ...l, charged_price: l.list_price - l.discount })),
    errors: resolved.errors,
  };
}

/**
 * Completa una cita congelando su dinero en el momento (INVARIANTE 2).
 *
 * 1. Valida la transición a COMPLETED.
 * 2. Valida que los servicios sean del mismo negocio (INVARIANTE 1) y que sean
 *    EXACTAMENTE los de la cita.
 * 3. bruto         = overridePrice ?? quoted_price ?? precio del conjunto
 *    charged_price = bruto − descuentos por línea (el NETO; sin descuentos = el bruto)
 * 4. actual_cost   = suma de los costos efectivos
 * 5. profit        = charged_price − actual_cost
 *
 * Se NIEGA a completar si algún servicio de precio variable no tiene precio.
 * Ese es el guardián que sustituye al booleano `isVariable`, que con varios
 * servicios dejó de tener respuesta: contar un precio desconocido como cero
 * sería cobrar de menos en silencio.
 */
export function completeAppointment(
  appointment: Appointment,
  services: readonly Service[],
  options: CompleteOptions = {},
): Appointment {
  if (!isValidTransition(appointment.status, 'COMPLETED')) {
    throw new Error(
      `No se puede completar la cita ${appointment.id} desde estado ${appointment.status}.`,
    );
  }

  for (const service of services) {
    if (appointment.business_id !== service.business_id) {
      throw new Error(
        `La cita ${appointment.id} (negocio ${appointment.business_id}) no corresponde al ` +
          `servicio ${service.id} (negocio ${service.business_id}).`,
      );
    }
  }

  const expected = [...appointmentServiceIds(appointment)].sort((a, b) => a - b);
  const given = services.map((s) => s.id).sort((a, b) => a - b);
  if (expected.length !== given.length || expected.some((id, i) => id !== given[i])) {
    throw new Error(
      `Los servicios recibidos (${given.join(', ')}) no son los de la cita ` +
        `${appointment.id} (${expected.join(', ')}).`,
    );
  }

  const quote = priceForServices(services, options.priceOverrides);

  // Solo se bloquea cuando NO hay ningún número con el que cobrar. Un total
  // acordado al agendar (`quoted_price`) o puesto al cobrar (`overridePrice`)
  // cubre a los servicios de precio variable: así funcionaba antes de lo
  // múltiple y no hay motivo para romperlo. Lo que no se admite es cerrar una
  // cuenta donde el precio sencillamente no existe en ninguna parte, porque
  // contar el servicio variable como cero sería cobrar de menos en silencio.
  const totalGiven = options.overridePrice ?? appointment.quoted_price ?? null;
  if (quote.needsPrice.length > 0 && totalGiven === null) {
    throw new Error(
      `Falta ponerle precio a: ${quote.needsPrice.map((s) => s.name).join(', ')}. ` +
        `Sin eso no se puede cerrar la cuenta de la cita ${appointment.id}.`,
    );
  }

  // Prioridad: precio del cobro (override) > precio acordado al agendar > precio del conjunto.
  const gross = totalGiven ?? quote.total;
  // Sin descuentos pedidos no se toca nada: los números son exactamente los de siempre.
  const discountTotal = [...lineDiscountCents(appointment, services, options).values()].reduce((sum, d) => sum + d, 0);
  const charged_price = gross - discountTotal;
  const actual_cost = services.reduce((sum, s) => sum + effectiveCost(s), 0);

  return {
    ...appointment,
    status: 'COMPLETED',
    charged_price,
    actual_cost,
    profit: profit(charged_price, actual_cost),
  };
}

/**
 * Reparte el dinero YA congelado de una cita completada entre sus servicios
 * (decisión D1 de odd/tasks/multi-service-appointments.md).
 *
 * Esto NO recalcula historia: la registra. El reparto se hace en el mismo
 * momento en que se congela el total, a partir de los precios de ese momento,
 * y queda guardado. Así el reporte de "servicio más rentable" lee un dato real
 * en vez de un reparto inventado después, y la factura tiene sus líneas.
 *
 * El costo NO se prorratea: cada servicio aporta su propio `effectiveCost`, que
 * es el valor de verdad y además suma exacto. Solo el precio cobrado se reparte,
 * porque la dueña puede cobrar un total distinto a la suma de lista (un descuento,
 * y mañana un combo). La ganancia de cada línea se DERIVA restando, así cuadra
 * sola aunque sea negativa.
 */
export function appointmentServiceLines(
  appointment: Appointment,
  services: readonly Service[],
  priceOverrides?: ReadonlyMap<number, number>,
  discountsByService?: ReadonlyMap<number, number>,
): AppointmentServiceLine[] {
  if (appointment.charged_price === null || appointment.actual_cost === null) {
    throw new Error(
      `La cita ${appointment.id} no tiene dinero congelado: no hay nada que repartir.`,
    );
  }

  const quote = priceForServices(services, priceOverrides);
  // Con UN solo servicio no hay nada que repartir: se lleva todo, tenga o no
  // precio propio. Con varios sí hace falta el precio de cada uno, porque es el
  // peso del reparto — y repartir con un peso desconocido sería inventarlo.
  if (quote.needsPrice.length > 0 && services.length > 1) {
    throw new Error(
      `No se puede repartir el dinero de la cita ${appointment.id} entre sus servicios: ` +
        `${quote.needsPrice.map((s) => s.name).join(', ')} no tiene precio.`,
    );
  }
  // `appointment.charged_price` es el NETO; el bruto es lo cobrado más lo descontado.
  // Ese bruto se reparte entre las líneas (lista) y a cada una se le resta su descuento.
  const discountOf = (serviceId: number) => discountsByService?.get(serviceId) ?? 0;
  const totalDiscount = services.reduce((sum, s) => sum + discountOf(s.id), 0);
  const lists = grossLines(appointment.charged_price + totalDiscount, services, priceOverrides);

  return lists.map((line) => {
    const service = services.find((s) => s.id === line.service_id)!;
    const discount = discountOf(line.service_id);
    const charged = line.list_price - discount;
    const cost = effectiveCost(service);
    return {
      service_id: line.service_id,
      list_price: line.list_price,
      discount,
      charged_price: charged,
      actual_cost: cost,
      profit: profit(charged, cost),
    };
  });
}

/**
 * ¿El estado ocupa un horario? Única fuente de verdad para esta pregunta:
 * antes vivía duplicada en `scheduling.ts` y `availability.ts`, y cada estado
 * nuevo se tenía que sumar en las dos copias por separado.
 *
 * REQUESTED cuenta como ocupante: una solicitud sin responder debe bloquear su
 * propio horario, si no, dos clientas podrían pedir la misma hora y la dueña
 * heredaría un choque que nunca creó.
 */
export function holdsSchedule(status: AppointmentStatus): boolean {
  return status !== 'CANCELED' && status !== 'NO_SHOW' && status !== 'REJECTED';
}
