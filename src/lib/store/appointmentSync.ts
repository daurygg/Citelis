// Aplica a la lista de citas en memoria un cambio que llega por Realtime.
// Pura y sin React: `useLiveAppointments` la llama con cada evento. Ver
// odd/tasks/live-appointments.md (T2).
//
// Solo INSERT y UPDATE: los DELETE no pasan por la RLS en Realtime, así que no
// se escuchan (y en la app las citas nunca se borran, solo cambian de estado).
import type { Appointment } from '../domain/types';

export interface AppointmentChange {
  eventType: 'INSERT' | 'UPDATE';
  /** La fila tal como quedó en el servidor. */
  new: Appointment;
}

function sameIds(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function sameRow(a: Appointment, b: Appointment): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Appointment>;
  for (const key of keys) {
    // `service_ids` es un arreglo: se compara por contenido, no por referencia.
    if (key === 'service_ids') {
      if (!sameIds(a.service_ids, b.service_ids)) return false;
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Devuelve la lista con el cambio aplicado, o la MISMA lista si no hay nada que
 * cambiar (así React no repinta por el eco de una escritura propia).
 *
 * - Una fila de otro negocio se ignora. Es redundante con la RLS y con el filtro
 *   del canal, pero el aislamiento no descansa en una sola capa (INVARIANTE 1).
 * - Si la cita ya está, gana la versión del servidor: INSERT (el eco de lo que
 *   creó la dueña) y UPDATE se tratan igual. Si trae dinero congelado, llega tal
 *   cual (INVARIANTE 2): aquí no se recalcula nada.
 * - `service_ids` no viene en la fila de `appointment` (vive en otra tabla,
 *   `appointment_service`, que Realtime no emite): si la fila entrante no lo trae
 *   se CONSERVA el que ya tenía la cita en memoria, para que un eco no borre lo
 *   hidratado. Quien trae las líneas las pone con `applyServiceIds`.
 * - Si no está, se añade, venga como INSERT o como UPDATE (pudo entrar mientras
 *   la app estaba suspendida).
 */
export function applyAppointmentChange(
  list: readonly Appointment[],
  change: AppointmentChange,
  businessId: number,
): readonly Appointment[] {
  const row = change.new;
  if (row.business_id !== businessId) return list;

  const index = list.findIndex((a) => a.id === row.id);
  if (index === -1) return [...list, row];
  const previous = list[index];
  const merged =
    row.service_ids === undefined && previous.service_ids !== undefined
      ? { ...row, service_ids: previous.service_ids }
      : row;
  if (sameRow(previous, merged)) return list;

  const next = list.slice();
  next[index] = merged;
  return next;
}

/**
 * Pone los servicios (`appointment_service`) de UNA cita ya cargada. Devuelve la
 * MISMA lista si no hay nada que cambiar. Una cita que no está en la lista no se
 * inventa, y una de otro negocio no se toca (INVARIANTE 1).
 */
export function applyServiceIds(
  list: readonly Appointment[],
  appointmentId: number,
  serviceIds: readonly number[],
  businessId: number,
): readonly Appointment[] {
  const index = list.findIndex((a) => a.id === appointmentId && a.business_id === businessId);
  if (index === -1) return list;
  if (sameIds(list[index].service_ids, serviceIds)) return list;
  const next = list.slice();
  next[index] = { ...list[index], service_ids: [...serviceIds] };
  return next;
}
