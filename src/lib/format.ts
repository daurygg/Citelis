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

/** ISO 8601 → hora de 12h con AM/PM. Ej: "2026-07-02T14:30" → "2:30 PM". */
export function formatTime(iso: string): string {
  const [hourStr, minute] = iso.slice(11, 16).split(':');
  const hour = Number(hourStr);
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
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

/** Ahora mismo en formato de <input type="datetime-local">: "YYYY-MM-DDTHH:MM". */
export function nowLocalDatetime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${toISODate(now)}T${hours}:${minutes}`;
}

/** Desplaza una fecha "YYYY-MM-DD" un número de días (positivo o negativo). */
export function shiftISODate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return toISODate(new Date(year, month - 1, day + days));
}

/** Desplaza N meses, anclando al día 1 (evita desbordes como 31 → mes corto). */
export function shiftMonthISODate(isoDate: string, months: number): string {
  const [year, month] = isoDate.slice(0, 10).split('-').map(Number);
  return toISODate(new Date(year, month - 1 + months, 1));
}

/** Rango del MES que contiene la fecha dada: [día 1, día 1 del mes siguiente). */
export function monthRange(isoDate: string): { from: string; to: string } {
  const [year, month] = isoDate.slice(0, 10).split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const nextFirst = new Date(year, month, 1);
  return { from: `${toISODate(first)}T00:00:00`, to: `${toISODate(nextFirst)}T00:00:00` };
}

/** Cantidad de días (enteros) en un rango [from, to). */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 86_400_000);
}

/** "2026-07-02" → "julio 2026". */
export function monthLabel(isoDate: string): string {
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const [year, month] = isoDate.slice(0, 10).split('-').map(Number);
  return `${months[month - 1]} ${year}`;
}

/** Rango de UN día como ISO local: [inicio, inicio del día siguiente). */
export function dayRange(isoDate: string): { from: string; to: string } {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const next = new Date(year, month - 1, day + 1);
  return { from: `${toISODate(start)}T00:00:00`, to: `${toISODate(next)}T00:00:00` };
}

/**
 * Rango (lunes a lunes) de la semana que CONTIENE la fecha dada, como ISO local.
 * `from` inclusive, `to` exclusivo — encaja con weekSummary (rango [from, to)).
 */
export function weekRange(isoDate: string): { from: string; to: string } {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  const base = new Date(year, month - 1, day);
  const daysSinceMonday = (base.getDay() + 6) % 7; // getDay: 0=domingo
  const monday = new Date(year, month - 1, day - daysSinceMonday);
  const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  return { from: `${toISODate(monday)}T00:00:00`, to: `${toISODate(nextMonday)}T00:00:00` };
}

/** Rango de la semana en curso (atajo de weekRange sobre hoy). */
export function currentWeekRange(): { from: string; to: string } {
  return weekRange(todayISODate());
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
