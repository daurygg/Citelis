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

/** Una línea del dinero congelado: lo que le tocó a UN servicio de la cita. */
export interface AppointmentServiceLine {
  service_id: number;
  charged_price: number;
  actual_cost: number;
  profit: number;
}

export interface CompleteOptions {
  /** Precio total del cobro, si la dueña cobra algo distinto a la suma de lista. */
  overridePrice?: number;
  /** Precio que la dueña le pone a cada servicio de precio variable, por id. */
  priceOverrides?: ReadonlyMap<number, number>;
}

/**
 * Completa una cita congelando su dinero en el momento (INVARIANTE 2).
 *
 * 1. Valida la transición a COMPLETED.
 * 2. Valida que los servicios sean del mismo negocio (INVARIANTE 1) y que sean
 *    EXACTAMENTE los de la cita.
 * 3. charged_price = overridePrice ?? quoted_price ?? precio del conjunto
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
  const charged_price = totalGiven ?? quote.total;
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
  if (services.length === 1) {
    const only = services[0];
    const cost = effectiveCost(only);
    return [
      {
        service_id: only.id,
        charged_price: appointment.charged_price,
        actual_cost: cost,
        profit: profit(appointment.charged_price, cost),
      },
    ];
  }

  const weights = quote.lines.map((line) => line.price);
  const chargedShares = allocateProportionally(appointment.charged_price, weights);

  return quote.lines.map((line, index) => {
    const service = services.find((s) => s.id === line.service_id)!;
    const charged = chargedShares[index];
    const cost = effectiveCost(service);
    return {
      service_id: line.service_id,
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
