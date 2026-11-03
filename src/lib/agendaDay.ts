// Textos de la agenda de la dueña, sin React (INVARIANTE 5): el encabezado del
// día y la hora partida en número y AM/PM para la línea de tiempo.
import { formatTime, shiftISODate } from './format';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export interface DayHeading {
  /** "jueves". */
  weekday: string;
  /** "2 de julio". */
  date: string;
  /** Cercanía respecto a hoy, o null si es otro día. */
  relative: 'hoy' | 'mañana' | 'ayer' | null;
}

/** Encabezado de un día "YYYY-MM-DD" visto desde `today` (también "YYYY-MM-DD"). */
export function dayHeading(isoDate: string, today: string): DayHeading {
  const day = isoDate.slice(0, 10);
  const weekday = WEEKDAYS[new Date(`${day}T00:00`).getDay()];
  const date = `${Number(day.slice(8, 10))} de ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
  let relative: DayHeading['relative'] = null;
  if (day === today) relative = 'hoy';
  else if (day === shiftISODate(today, 1)) relative = 'mañana';
  else if (day === shiftISODate(today, -1)) relative = 'ayer';
  return { weekday, date, relative };
}

/** "2026-07-02T14:30" → { time: "2:30", period: "PM" } (la hora grande y el AM/PM pequeño). */
export function splitClock(iso: string): { time: string; period: string } {
  const [time, period] = formatTime(iso).split(' ');
  return { time, period };
}
