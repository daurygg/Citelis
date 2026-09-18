// Disponibilidad de reserva pública (Slice A del self-booking, INVARIANTE 5).
// Función pura: sin React, sin I/O, sin reloj implícito (`now` se inyecta).
// Los datetimes son ISO local SIN zona ('YYYY-MM-DDTHH:MM'), igual que hoy los
// produce `<input type="datetime-local">` y como los guarda `Appointment.datetime`
// (ver decisión D4 del documento ODD de self-booking). No usar `toISOString()`
// aquí: eso convertiría a UTC y correría las horas.
import type {
  Appointment,
  BookingPolicy,
  BusinessHours,
  Service,
  Slot,
  TimeBlock,
} from './types';
import { serviceDurationMs } from './scheduling';
import { holdsSchedule } from './appointments';

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** ¿El string cumple el formato 'YYYY-MM-DD' y representa una fecha real? */
function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(`${date}T00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Descarta fechas que "desbordan" (ej. 2026-02-30 → 2026-03-02).
  return (
    parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
  );
}

/**
 * Interpreta 'HH:MM' y lo combina con `date` para obtener un timestamp local (ms).
 * Devuelve null si el formato o el rango de horas/minutos es inválido.
 */
function parseHHMM(date: string, hhmm: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hours, minutes] = hhmm.split(':').map(Number);
  if (hours > 23 || minutes > 59) return null;
  const ms = new Date(`${date}T${hhmm}`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Formatea un timestamp local (ms) como 'YYYY-MM-DDTHH:MM', igual que el resto del dominio. */
function formatLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** ¿Se solapan los intervalos [aStart, aEnd) y [bStart, bEnd)? (ms) */
function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * ¿El intervalo candidato [start, end) choca con alguna cita ocupante?
 * Qué estados ocupan horario lo decide `holdsSchedule` (appointments.ts, mismo
 * criterio que usa `findScheduleConflict` en `scheduling.ts`). `buffer_min`
 * extiende el ocupado a AMBOS lados de cada cita: el descanso es "entre
 * citas", así que también protege el hueco previo (si no, se podría reservar
 * justo pegado antes de una cita existente y la dueña se quedaría sin respiro).
 *
 * Si el servicio de una cita existente NO está en `services` (por ejemplo, un
 * servicio borrado o filtrado por el llamador) no se puede saber cuánto dura.
 * Se FALLA EN SEGURO: se bloquea desde su inicio en adelante. Ignorarla
 * ofrecería como libre un horario ya ocupado, que es justo la doble reserva
 * que este módulo existe para impedir.
 */
function occupiesSchedule(
  start: number,
  end: number,
  appointments: readonly Appointment[],
  services: readonly Service[],
  bufferMs: number,
): boolean {
  for (const a of appointments) {
    if (!holdsSchedule(a.status)) continue;
    const aStart = new Date(a.datetime).getTime();
    if (Number.isNaN(aStart)) continue;
    const svc = services.find((s) => s.id === a.service_id);
    const occupiedStart = aStart - bufferMs;
    // Duración desconocida → se bloquea hasta el cierre (Infinity acota el día).
    const occupiedEnd = svc ? aStart + serviceDurationMs(svc) + bufferMs : Infinity;
    if (intervalsOverlap(start, end, occupiedStart, occupiedEnd)) return true;
  }
  return false;
}

/** ¿El intervalo candidato [start, end) cae dentro de algún `TimeBlock`? */
function isBlocked(start: number, end: number, blocks: readonly TimeBlock[]): boolean {
  for (const b of blocks) {
    const bStart = new Date(b.starts_at).getTime();
    const bEnd = new Date(b.ends_at).getTime();
    if (Number.isNaN(bStart) || Number.isNaN(bEnd)) continue;
    if (intervalsOverlap(start, end, bStart, bEnd)) return true;
  }
  return false;
}

/**
 * Genera los slots reservables de `service` para `date`, respetando el
 * horario del negocio, los bloqueos, las citas ya ocupadas y la política
 * de reserva. Pura: no muta ninguna entrada y con el mismo `now` siempre
 * devuelve el mismo resultado.
 */
export function generateSlots(input: {
  date: string;
  service: Service;
  hours: readonly BusinessHours[];
  blocks: readonly TimeBlock[];
  appointments: readonly Appointment[];
  services: readonly Service[];
  policy: BookingPolicy;
  now: Date;
}): Slot[] {
  const { date, service, hours, blocks, appointments, services, policy, now } = input;

  if (service.duration_min <= 0) return [];
  if (!isValidDate(date)) return [];

  const durationMs = serviceDurationMs(service);
  const stepMs = Math.max(1, policy.slot_step_min) * ONE_MINUTE_MS;
  const bufferMs = Math.max(0, policy.buffer_min) * ONE_MINUTE_MS;
  const earliestStart = now.getTime() + policy.min_notice_hours * ONE_HOUR_MS;
  const horizonEnd = now.getTime() + policy.max_horizon_days * ONE_DAY_MS;

  const weekday = new Date(`${date}T00:00`).getDay();
  const dayHours = hours.filter((h) => h.weekday === weekday);

  const slots: Slot[] = [];

  for (const h of dayHours) {
    const opensMs = parseHHMM(date, h.opens_at);
    const closesMs = parseHHMM(date, h.closes_at);
    if (opensMs === null || closesMs === null) continue;

    for (let start = opensMs; start + durationMs <= closesMs; start += stepMs) {
      const end = start + durationMs;

      if (start < earliestStart) continue;
      if (start > horizonEnd) continue;
      if (occupiesSchedule(start, end, appointments, services, bufferMs)) continue;
      if (isBlocked(start, end, blocks)) continue;

      slots.push({ start: formatLocal(start), end: formatLocal(end) });
    }
  }

  return slots;
}
