// Lógica pura de los pasos de horarios y primer servicio del asistente guiado.
// La UI solo llama a estas funciones (INVARIANTE 5). Dinero en centavos enteros;
// nunca se piden insumos ni unidades técnicas aquí (INVARIANTES 4 y 6).
import { parseMoneyToCents } from '../format';

export interface HoursRow {
  weekday: number; // 0 = domingo … 6 = sábado
  opens_at: string; // 'HH:MM'
  closes_at: string; // 'HH:MM'
}

export type HoursPresetId = 'weekdays' | 'weekdays_saturday';

export const HOURS_PRESETS: readonly { id: HoursPresetId; label: string; weekdays: readonly number[] }[] = [
  { id: 'weekdays', label: 'Lunes a viernes', weekdays: [1, 2, 3, 4, 5] },
  { id: 'weekdays_saturday', label: 'Lunes a sábado', weekdays: [1, 2, 3, 4, 5, 6] },
];

/** Un tramo de horario por cada día del preset elegido. */
export function buildHoursFromPreset(preset: HoursPresetId, opensAt: string, closesAt: string): HoursRow[] {
  const found = HOURS_PRESETS.find((p) => p.id === preset) ?? HOURS_PRESETS[0];
  return found.weekdays.map((weekday) => ({ weekday, opens_at: opensAt, closes_at: closesAt }));
}

/** Mensaje de error, o null si el rango es válido. */
export function validateHoursRange(opensAt: string, closesAt: string): string | null {
  if (opensAt === '' || closesAt === '') return 'Elige la hora de apertura y la de cierre.';
  if (closesAt <= opensAt) return 'La hora de cierre debe ser después de la de apertura.';
  return null;
}

export interface FirstServiceInput {
  name: string;
  priceText: string;
  durationText: string;
}

export interface FirstServiceValue {
  name: string;
  price: number; // centavos
  duration_min: number;
}

export interface FirstServiceResult {
  errors: { name?: string; price?: string; duration?: string };
  value: FirstServiceValue | null;
}

export function validateFirstService({ name, priceText, durationText }: FirstServiceInput): FirstServiceResult {
  const errors: FirstServiceResult['errors'] = {};
  const trimmed = name.trim();
  if (trimmed === '') errors.name = 'Escribe cómo se llama tu servicio, por ejemplo "Manicure".';

  const price = parseMoneyToCents(priceText);
  if (price === null) errors.price = 'Escribe cuánto cobras por este servicio.';

  const minutes = durationText.trim() === '' ? NaN : Number(durationText);
  if (!Number.isInteger(minutes) || minutes <= 0) errors.duration = 'Escribe cuántos minutos dura (un número entero, mayor que cero).';

  if (Object.keys(errors).length > 0 || price === null) return { errors, value: null };
  return { errors, value: { name: trimmed, price, duration_min: minutes } };
}

export interface SummaryItem {
  label: string;
  done: boolean;
}

export interface SetupSummaryInput {
  businessName: string;
  /** Días con horario guardado en el asistente (0 = se saltó). */
  hoursDays: number;
  /** Nombre del servicio guardado, o null si se saltó. */
  serviceName: string | null;
}

/** Resumen de la pantalla final: qué quedó listo y qué queda para después. */
export function buildSetupSummary({ businessName, hoursDays, serviceName }: SetupSummaryInput): SummaryItem[] {
  return [
    { label: `Negocio creado: ${businessName}`, done: true },
    hoursDays > 0
      ? { label: `Horarios: ${hoursDays} ${hoursDays === 1 ? 'día' : 'días'} a la semana`, done: true }
      : { label: 'Horarios: lo haces después en Mi negocio', done: false },
    serviceName
      ? { label: `Primer servicio: ${serviceName}`, done: true }
      : { label: 'Primer servicio: lo agregas después en Servicios', done: false },
  ];
}

export type SetupStepId = 'add_service' | 'set_hours' | 'open_booking';

export interface SetupStep {
  id: SetupStepId;
  label: string;
}

export interface SetupStatusInput {
  serviceCount: number;
  /** Días con horario guardado. */
  hoursDays: number;
  /** El portal de reservas en línea está abierto. */
  bookingOpen: boolean;
}

/** Qué le falta configurar al negocio, en el orden en que conviene hacerlo. */
export function pendingSetupSteps({ serviceCount, hoursDays, bookingOpen }: SetupStatusInput): SetupStep[] {
  const steps: SetupStep[] = [];
  if (serviceCount === 0) steps.push({ id: 'add_service', label: 'Agrega tu primer servicio' });
  if (hoursDays === 0) steps.push({ id: 'set_hours', label: 'Pon tus horarios' });
  if (!bookingOpen) steps.push({ id: 'open_booking', label: 'Abre tus reservas en línea' });
  return steps;
}
