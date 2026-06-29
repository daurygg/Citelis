// Máquina de estados de citas — funciones puras (PLAN.md §3.3).
// CERO dependencias de React. Modelo append-only (INVARIANTE 2).
//
// Transiciones válidas:
//   PENDING     → IN_PROGRESS   (opcional, "empezó la atención")
//   PENDING     → CANCELED
//   IN_PROGRESS → COMPLETED     ← AQUÍ se congelan charged_price, actual_cost, profit
//   PENDING     → COMPLETED     (atajo permitido: completar directo)
// Cualquier otra transición lanza error. Solo COMPLETED cuenta para reportes.

import type { Appointment, AppointmentStatus, Service } from './types';
import { effectiveCost, profit } from './costs';

/** Transiciones permitidas, indexadas por estado de origen. */
const VALID_TRANSITIONS: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  PENDING: ['IN_PROGRESS', 'CANCELED', 'COMPLETED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELED: [],
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

  const charged_price = overridePrice ?? service.price;
  const actual_cost = effectiveCost(service);

  return {
    ...appointment,
    status: 'COMPLETED',
    charged_price,
    actual_cost,
    profit: profit(charged_price, actual_cost),
  };
}
