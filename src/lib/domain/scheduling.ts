// Detección de choques de horario entre citas (función pura, INVARIANTE 5).
// Cada cita ocupa [inicio, inicio + duración_del_servicio). Dos citas chocan si
// sus intervalos se solapan. Las CANCELED y NO_SHOW no ocupan horario.
import type { Appointment, Service } from './types';

/** Duración del servicio en milisegundos. */
export function serviceDurationMs(service: Service): number {
  return service.duration_min * 60_000;
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
 */
export function findScheduleConflict(
  candidate: { datetime: string; service_id: number; id?: number },
  appointments: readonly Appointment[],
  services: readonly Service[],
): Appointment | null {
  const candService = services.find((s) => s.id === candidate.service_id);
  if (!candService) return null;
  const candStart = new Date(candidate.datetime).getTime();
  if (Number.isNaN(candStart)) return null;
  const candEnd = candStart + serviceDurationMs(candService);

  for (const a of appointments) {
    if (candidate.id !== undefined && a.id === candidate.id) continue;
    if (a.status === 'CANCELED' || a.status === 'NO_SHOW') continue;
    const svc = services.find((s) => s.id === a.service_id);
    if (!svc) continue;
    const start = new Date(a.datetime).getTime();
    if (Number.isNaN(start)) continue;
    const end = start + serviceDurationMs(svc);
    if (overlaps(candStart, candEnd, start, end)) return a;
  }
  return null;
}
