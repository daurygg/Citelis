// Editar los servicios de una cita ya agendada (INVARIANTES 1, 2, 5 y 7).
// Función pura: sin React, sin I/O. La UI y el store solo llaman a esto.
//
// Qué se puede editar: solo citas que aún no son historia. REQUESTED, PENDING e
// IN_PROGRESS sí; COMPLETED (hecho inmutable, INVARIANTE 2), CANCELED, NO_SHOW y
// REJECTED no.
//
// Cuándo "cabe": la nueva suma de duraciones tiene que entrar en el mismo inicio
// de la cita sin chocar con otras citas, con un bloqueo, ni salirse del horario
// del negocio. No se reimplementa nada: el choque entre citas es
// `findScheduleConflict` y el horario/bloqueos/fallo seguro de duración
// desconocida es `generateSlots`, las mismas funciones que usan agendar y el
// portal. Eso evita que "lo que cabe aquí" y "lo que cabe allá" se separen.
import type { Appointment, AppointmentStatus, BookingPolicy, BusinessHours, Service, TimeBlock } from './types';
import { appointmentServiceIds, holdsSchedule } from './appointments';
import { generateSlots } from './availability';
import { findScheduleConflict, resolveServiceIds, servicesDurationMs } from './scheduling';

/** ¿Una cita en este estado admite cambiar sus servicios? (INVARIANTES 2 y 7) */
export function canEditServices(status: AppointmentStatus): boolean {
  return status === 'REQUESTED' || status === 'PENDING' || status === 'IN_PROGRESS';
}

export type ServicesEditCheck =
  | { ok: true; service_ids: number[]; duration_min: number }
  /** `reason` va en el idioma de la dueña: la UI lo muestra tal cual. */
  | { ok: false; reason: string };

export interface ServicesEditInput {
  appointment: Appointment;
  /** Los servicios que quedarían. El primero será el principal (`service_id`). */
  serviceIds: readonly number[];
  /** Catálogo del negocio. */
  services: readonly Service[];
  /** Citas del negocio (puede incluir la propia: se excluye por `id`). */
  appointments: readonly Appointment[];
  hours: readonly BusinessHours[];
  blocks: readonly TimeBlock[];
}

const MINUTE_MS = 60_000;

// El dueño agenda sin respetar la política de reserva del portal (anticipación,
// horizonte, descanso, paso). Para comprobar si un inicio YA fijado cabe, se
// neutraliza: paso de 1 min (cualquier minuto es candidato), sin descanso, y un
// `now` una hora antes de la cita para que ni la anticipación ni el horizonte
// la descarten (una cita IN_PROGRESS ya empezó).
const NEUTRAL_POLICY: BookingPolicy = {
  business_id: 0,
  slot_step_min: 1,
  buffer_min: 0,
  min_notice_hours: 0,
  max_horizon_days: 2,
};

// Si el negocio nunca definió horarios, el horario no limita a la dueña (agendar
// desde la agenda tampoco lo exige): se considera abierto todo el día.
function openAllDay(): BusinessHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    id: -weekday - 1,
    business_id: 0,
    weekday,
    opens_at: '00:00',
    closes_at: '23:59',
  }));
}

function fitsAt(
  datetime: string,
  candidate: readonly Service[],
  others: readonly Appointment[],
  catalog: readonly Service[],
  hours: readonly BusinessHours[],
  blocks: readonly TimeBlock[],
): boolean {
  const start = datetime.slice(0, 16);
  const now = new Date(new Date(start).getTime() - 60 * MINUTE_MS);
  const slots = generateSlots({
    date: start.slice(0, 10),
    candidateServices: candidate,
    hours,
    blocks,
    appointments: others,
    services: catalog,
    policy: NEUTRAL_POLICY,
    now,
  });
  return slots.some((s) => s.start === start);
}

/**
 * Valida cambiar los servicios de `appointment` por `serviceIds`. No muta nada.
 * Si la duración total no crece (quitar o cambiar por algo igual o más corto)
 * solo se libera tiempo: no hace falta revisar horario, aunque la cita ya
 * estuviera fuera de él.
 */
export function checkServicesEdit(input: ServicesEditInput): ServicesEditCheck {
  const { appointment, serviceIds, services, hours, blocks } = input;

  if (appointment.status === 'COMPLETED') {
    return { ok: false, reason: 'Una cita cobrada no se puede modificar.' };
  }
  if (!canEditServices(appointment.status)) {
    return { ok: false, reason: 'Esta cita ya no se puede modificar.' };
  }
  if (serviceIds.length === 0) return { ok: false, reason: 'Elige al menos un servicio.' };
  if (new Set(serviceIds).size !== serviceIds.length) {
    return { ok: false, reason: 'Un servicio aparece repetido.' };
  }

  // INVARIANTE 1: solo servicios de ESTE negocio.
  const catalog = services.filter((s) => s.business_id === appointment.business_id);
  const { services: chosen, anyMissing } = resolveServiceIds(serviceIds, catalog);
  if (anyMissing) return { ok: false, reason: 'Uno de los servicios ya no existe.' };
  const noDuration = chosen.find((s) => s.duration_min <= 0);
  if (noDuration) {
    return { ok: false, reason: `${noDuration.name} no tiene duración. Ponle cuánto dura en Servicios.` };
  }

  const duration_min = servicesDurationMs(chosen) / MINUTE_MS;
  const ok: ServicesEditCheck = { ok: true, service_ids: [...serviceIds], duration_min };

  // ¿La duración crece? Si no se puede saber la actual (falta un servicio), se
  // revisa todo: ante la duda, no se afloja.
  const current = resolveServiceIds(appointmentServiceIds(appointment), catalog);
  if (!current.anyMissing && servicesDurationMs(chosen) <= servicesDurationMs(current.services)) return ok;

  const others = input.appointments.filter(
    (a) => a.id !== appointment.id && a.business_id === appointment.business_id,
  );

  const clash = findScheduleConflict(
    { datetime: appointment.datetime, service_ids: [...serviceIds], id: appointment.id },
    others,
    catalog,
  );
  if (clash) {
    return {
      ok: false,
      reason: `No cabe: choca con la cita de ${clash.client} a las ${clash.datetime.slice(11, 16)}.`,
    };
  }

  // Horario y bloqueos por separado para poder decir cuál es el problema.
  const effectiveHours = hours.length > 0 ? hours : openAllDay();
  if (!fitsAt(appointment.datetime, chosen, [], catalog, effectiveHours, [])) {
    return { ok: false, reason: `No cabe: ${duration_min} min se pasan del horario del negocio.` };
  }
  if (!fitsAt(appointment.datetime, chosen, [], catalog, effectiveHours, blocks)) {
    return { ok: false, reason: 'No cabe: cae sobre un tiempo bloqueado.' };
  }
  // Último filtro con TODO: atrapa citas de duración desconocida, que
  // `generateSlots` bloquea a propósito (fallo seguro) y `findScheduleConflict` ignora.
  const live = others.filter((a) => holdsSchedule(a.status));
  if (!fitsAt(appointment.datetime, chosen, live, catalog, effectiveHours, blocks)) {
    return { ok: false, reason: 'No cabe: choca con otra cita.' };
  }

  return ok;
}

/**
 * ¿La selección difiere de lo que la cita ya tiene? El ORDEN cuenta: el primero
 * es el servicio principal. Sin cambios no hay nada que guardar.
 */
export function servicesChanged(current: readonly number[], next: readonly number[]): boolean {
  return current.length !== next.length || current.some((id, i) => id !== next[i]);
}

/** Argumentos de la RPC `update_appointment_services`. El negocio va explícito (INVARIANTE 1). */
export function updateServicesRpcArgs(businessId: number, appointmentId: number, serviceIds: readonly number[]) {
  return {
    p_business_id: businessId,
    p_appointment_id: appointmentId,
    p_service_ids: [...serviceIds],
  };
}
