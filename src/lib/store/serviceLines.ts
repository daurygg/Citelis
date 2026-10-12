// Las líneas de `appointment_service` con su ganancia congelada (decisión D1), que
// alimentan el "servicio más rentable" de los reportes. Viven aparte de las citas
// a propósito: Realtime no emite esa tabla y la sincronización de `service_ids`
// (liveAppointments) ya tiene bastantes carreras; mezclar el dinero ahí arriesgaría
// pisar lo congelado. Pura y sin React.
import type { Appointment } from '../domain/types';
import type { ServiceProfitLine } from '../domain/reports';

/**
 * Pone las líneas de las citas que llegan, reemplazando las que ya había de esas
 * mismas citas (una cita se congela entera, nunca línea a línea). Ignora las de otro
 * negocio (INVARIANTE 1). Devuelve la MISMA lista si no hay nada que aplicar.
 */
export function mergeServiceLines(
  prev: readonly ServiceProfitLine[],
  incoming: readonly ServiceProfitLine[],
  businessId: number,
): readonly ServiceProfitLine[] {
  const own = incoming.filter((l) => l.business_id === businessId);
  if (own.length === 0) return prev;
  const replaced = new Set(own.map((l) => l.appointment_id));
  return [...prev.filter((l) => !replaced.has(l.appointment_id)), ...own];
}

/**
 * Ids de citas COMPLETED que todavía no tienen una línea con ganancia en memoria:
 * una cobrada desde otro dispositivo (llega por Realtime sin sus líneas) o una que
 * la carga inicial no pudo traer. Son las que hay que ir a buscar.
 */
export function completedWithoutLines(
  appointments: readonly Appointment[],
  lines: readonly ServiceProfitLine[],
): number[] {
  const have = new Set(lines.filter((l) => l.profit !== null).map((l) => l.appointment_id));
  return appointments.filter((a) => a.status === 'COMPLETED' && !have.has(a.id)).map((a) => a.id);
}
