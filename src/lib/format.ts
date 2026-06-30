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

/** Fecha de HOY como "YYYY-MM-DD" en hora local. */
export function todayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Etiqueta visible en español para cada estado (lenguaje de la dueña, INVARIANTE 4). */
export function statusLabel(status: AppointmentStatus): string {
  const labels: Record<AppointmentStatus, string> = {
    PENDING: 'Pendiente',
    IN_PROGRESS: 'En curso',
    COMPLETED: 'Completada',
    CANCELED: 'Cancelada',
  };
  return labels[status];
}
