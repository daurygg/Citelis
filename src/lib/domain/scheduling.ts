// Detección de choques de horario entre citas (función pura, INVARIANTE 5).
// Cada cita ocupa [inicio, inicio + duración_TOTAL_de_sus_servicios). Dos
// citas chocan si sus intervalos se solapan. Qué estados ocupan horario lo
// decide `holdsSchedule` (appointments.ts, dueño de la semántica de estados):
// hoy CANCELED, NO_SHOW y REJECTED no ocupan.
//
// T1 (odd/tasks/multi-service-appointments.md): una cita puede llevar VARIOS
// servicios. `appointmentServiceIds` es el ÚNICO sitio que decide cuáles son
// los servicios de una cita — nadie más debe leer `service_id`/`service_ids`
// directamente para ese propósito.
import type { Appointment, Service } from './types';
import { holdsSchedule } from './appointments';

/** Duración del servicio en milisegundos. */
export function serviceDurationMs(service: Service): number {
  return service.duration_min * 60_000;
}

/** Duración TOTAL (ms) de un conjunto de servicios: la suma de cada uno. */
export function servicesDurationMs(services: readonly Service[]): number {
  return services.reduce((total, s) => total + serviceDurationMs(s), 0);
}

/**
 * IDs de servicio de una cita. ÚNICA fuente de verdad de "qué servicios tiene
 * esta cita": si trae `service_ids` (varios), se usan esos; si no (toda cita
 * agendada antes de esta fase, o cualquier pantalla que todavía no escribe
 * varios), se cae al `service_id` único. Ver el comentario de `service_ids`
 * en types.ts.
 */
export function appointmentServiceIds(appointment: Appointment): number[] {
  return appointment.service_ids ?? [appointment.service_id];
}

/** Resultado de resolver una lista de ids de servicio contra un catálogo. */
export interface ResolvedServices {
  /** Los servicios de `ids` que sí aparecen en `catalog`, en el orden hallado. */
  services: Service[];
  /** true si CUALQUIERA de los ids no apareció en `catalog` (no solo si faltan todos). */
  anyMissing: boolean;
}

/**
 * Resuelve una lista de ids de servicio contra el catálogo. Es la base del
 * fallo seguro (decisión A6, ver `occupiesSchedule` en availability.ts): con
 * varios servicios, basta con que UNO desaparezca del catálogo para no poder
 * confiar en la duración total — por eso `anyMissing` se activa con que falte
 * uno solo, no con que falten todos.
 */
export function resolveServiceIds(
  ids: readonly number[],
  catalog: readonly Service[],
): ResolvedServices {
  const services: Service[] = [];
  let anyMissing = false;
  for (const id of ids) {
    const found = catalog.find((s) => s.id === id);
    if (found) {
      services.push(found);
    } else {
      anyMissing = true;
    }
  }
  return { services, anyMissing };
}

/** Igual que `resolveServiceIds`, pero a partir de una cita completa. */
export function resolveAppointmentServices(
  appointment: Appointment,
  catalog: readonly Service[],
): ResolvedServices {
  return resolveServiceIds(appointmentServiceIds(appointment), catalog);
}

/** ¿Se solapan los intervalos [aStart, aEnd) y [bStart, bEnd)? (ms) */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Busca una cita existente que CHOQUE con la candidata; devuelve la primera o null.
 * - Ignora canceladas y no-show (liberan el horario).
 * - Ignora la propia cita (por `id`), útil al reprogramar.
 * - El negocio ya viene filtrado por el llamador (INVARIANTE 1).
 * - La candidata trae `service_ids` (uno o varios): su duración es la SUMA.
 * - Si algún servicio (de la candidata o de una cita existente) no está en el
 *   catálogo, esa cita se ignora en la comparación (igual que antes: acá no
 *   se aplica el fallo-a-Infinity, que es propio de `occupiesSchedule`).
 */
export function findScheduleConflict(
  candidate: { datetime: string; service_ids: number[]; id?: number },
  appointments: readonly Appointment[],
  services: readonly Service[],
): Appointment | null {
  const { services: candServices, anyMissing: candMissing } = resolveServiceIds(
    candidate.service_ids,
    services,
  );
  if (candMissing || candServices.length === 0) return null;
  const candStart = new Date(candidate.datetime).getTime();
  if (Number.isNaN(candStart)) return null;
  const candEnd = candStart + servicesDurationMs(candServices);

  for (const a of appointments) {
    if (candidate.id !== undefined && a.id === candidate.id) continue;
    if (!holdsSchedule(a.status)) continue;
    const { services: aServices, anyMissing: aMissing } = resolveAppointmentServices(a, services);
    if (aMissing || aServices.length === 0) continue;
    const start = new Date(a.datetime).getTime();
    if (Number.isNaN(start)) continue;
    const end = start + servicesDurationMs(aServices);
    if (overlaps(candStart, candEnd, start, end)) return a;
  }
  return null;
}
