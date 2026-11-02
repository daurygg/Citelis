// Etiquetas de fecha del portal público, sin React (INVARIANTE 5). Recibe
// "YYYY-MM-DD" y devuelve texto corto en español para fichas y comprobantes.

const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "2026-07-02" → "jue". */
export function weekdayShort(isoDate: string): string {
  return WEEKDAY_SHORT[new Date(`${isoDate.slice(0, 10)}T00:00`).getDay()];
}

/** "2026-07-02" → "2". */
export function dayNumber(isoDate: string): string {
  return String(Number(isoDate.slice(8, 10)));
}

/** "2026-07-02" → "jue 2 de julio". */
export function longDayLabel(isoDate: string): string {
  const month = MONTH_NAMES[Number(isoDate.slice(5, 7)) - 1];
  return `${weekdayShort(isoDate)} ${dayNumber(isoDate)} de ${month}`;
}
