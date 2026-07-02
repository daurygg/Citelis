// Capa de presentación: convierte datos internos a texto para la UI.
// Pura y sin React (se puede testear sola). El dinero vive en centavos enteros
// (INVARIANTE: dinero entero) y SOLO aquí se vuelve texto de moneda.
import type { AppointmentStatus } from './domain/types';

/** Centavos enteros → texto de moneda. Ej: 350000 → "$3,500.00". */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  // Separador de miles sin depender de Intl (estable en cualquier entorno).
  const wholeWithSeparators = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${wholeWithSeparators}.${frac}`;
}

/** ISO 8601 → "HH:MM" usando el texto literal (sin saltos de zona horaria). */
export function formatTime(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * Texto de moneda → centavos enteros. Ej: "3,500.50" → 350050.
 * Devuelve null si el texto no es un número válido (≥ 0).
 */
export function parseMoneyToCents(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Una fecha local → "YYYY-MM-DD". */
function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Fecha de HOY como "YYYY-MM-DD" en hora local. */
export function todayISODate(): string {
  return toISODate(new Date());
}

/** Rango de UN día como ISO local: [inicio, inicio del día siguiente). */
export function dayRange(isoDate: string): { from: string; to: string } {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const next = new Date(year, month - 1, day + 1);
  return { from: `${toISODate(start)}T00:00:00`, to: `${toISODate(next)}T00:00:00` };
}

/**
 * Rango de la semana en curso (lunes a lunes) como ISO local.
 * `from` inclusive, `to` exclusivo — encaja con weekSummary (rango [from, to)).
 */
export function currentWeekRange(): { from: string; to: string } {
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7; // getDay: 0=domingo
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  return { from: `${toISODate(monday)}T00:00:00`, to: `${toISODate(nextMonday)}T00:00:00` };
}

/** "2026-06-30T..." → "30/06/2026" (sin depender de Intl). */
export function formatDateShort(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** Etiqueta visible en español para cada estado (lenguaje de la dueña, INVARIANTE 4). */
export function statusLabel(status: AppointmentStatus): string {
  const labels: Record<AppointmentStatus, string> = {
    PENDING: 'Pendiente',
    IN_PROGRESS: 'En curso',
    COMPLETED: 'Completada',
    CANCELED: 'Cancelada',
    NO_SHOW: 'No llegó',
  };
  return labels[status];
}
