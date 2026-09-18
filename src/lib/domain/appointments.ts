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
import { effectiveCost, profit } from './costs';

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
 * Completa una cita congelando su dinero en el momento (INVARIANTE 2).
 *
 * 1. Valida la transición a COMPLETED.
 * 2. charged_price = overridePrice ?? service.price       (snapshot del momento)
 * 3. actual_cost   = effectiveCost(service)               (snapshot del momento)
 * 4. profit        = charged_price − actual_cost
 * 5. Devuelve una NUEVA cita inmutable, COMPLETED, con los tres valores congelados.
 *
 * El servicio debe pertenecer al mismo tenant que la cita (INVARIANTE 1).
 */
export function completeAppointment(
  appointment: Appointment,
  service: Service,
  overridePrice?: number,
): Appointment {
  if (!isValidTransition(appointment.status, 'COMPLETED')) {
    throw new Error(
      `No se puede completar la cita ${appointment.id} desde estado ${appointment.status}.`,
    );
  }
  if (appointment.business_id !== service.business_id) {
    throw new Error(
      `La cita ${appointment.id} (negocio ${appointment.business_id}) no corresponde al ` +
        `servicio ${service.id} (negocio ${service.business_id}).`,
    );
  }
  if (appointment.service_id !== service.id) {
    throw new Error(
      `El servicio ${service.id} no corresponde al service_id ${appointment.service_id} ` +
        `de la cita ${appointment.id}.`,
    );
  }

  // Prioridad: precio del cobro (override) > precio acordado al agendar > precio del servicio.
  const charged_price = overridePrice ?? appointment.quoted_price ?? service.price;
  const actual_cost = effectiveCost(service);

  return {
    ...appointment,
    status: 'COMPLETED',
    charged_price,
    actual_cost,
    profit: profit(charged_price, actual_cost),
  };
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
