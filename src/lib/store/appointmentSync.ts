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

function sameRow(a: Appointment, b: Appointment): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Appointment>;
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
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
  if (sameRow(list[index], row)) return list;

  const next = list.slice();
  next[index] = row;
  return next;
}
