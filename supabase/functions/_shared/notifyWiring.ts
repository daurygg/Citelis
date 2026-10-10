// Piezas del cableado de `notify-new-booking` que sí toman decisiones y por eso
// se prueban aparte: qué fallo de push significa "olvida este dispositivo",
// cómo se reintenta preparar el envío, y cómo se aplana la fila de la cita.

import type { BookingForNotice } from './notifyNewBooking.ts';

/**
 * 404/410: el servicio de push dice que la suscripción ya no existe (app
 * borrada, permiso retirado). Cualquier otro código es un fallo pasajero o
 * nuestro, y borrar ahí dejaría a la dueña sin avisos sin que nadie lo note.
 */
export function isGoneStatus(status: number): boolean {
  return status === 404 || status === 410;
}

/**
 * Memoriza una construcción asíncrona, pero si falla la olvida: así, corregir
 * un secreto mal puesto no obliga a esperar a que se recicle la instancia.
 */
export function retryingOnce<T>(factory: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= factory().catch((err) => {
      pending = null;
      throw err;
    });
    return pending;
  };
}

type ServiceJoin = { name: string } | { name: string }[] | null;

export interface AppointmentRow {
  id: number;
  business_id: number;
  client: string;
  datetime: string;
  status: string;
  /** Servicio principal; si llega, sus líneas se ordenan con él primero. */
  service_id?: number;
  service: ServiceJoin;
}

/** Una línea de `appointment_service` con el nombre de su servicio. */
export interface ServiceLineRow {
  service_id?: number;
  service: ServiceJoin;
}

function joinedName(join: ServiceJoin): string | null {
  const service = Array.isArray(join) ? join[0] : join;
  return service?.name ?? null;
}

/**
 * El join de Supabase llega como objeto, arreglo o null según la relación. Los
 * servicios salen de las líneas de `appointment_service` (todas las de la cita);
 * si no hay ninguna legible —solicitudes anteriores a las líneas, o una lectura
 * que no trajo nombres— se cae al servicio principal de la cita.
 */
export function toBookingForNotice(row: AppointmentRow, lines: ServiceLineRow[] = []): BookingForNotice {
  // `appointment_service` no guarda orden: el principal se pone primero, como en
  // el resto de la app (serviceIdsFromRows); los demás conservan su orden.
  const ordered =
    row.service_id === undefined
      ? lines
      : [...lines.filter((l) => l.service_id === row.service_id), ...lines.filter((l) => l.service_id !== row.service_id)];
  const fromLines = ordered.map((l) => joinedName(l.service)).filter((n): n is string => n !== null);
  const primary = joinedName(row.service);
  return {
    id: row.id,
    business_id: row.business_id,
    client: row.client,
    datetime: row.datetime,
    status: row.status,
    service_names: fromLines.length > 0 ? fromLines : primary ? [primary] : [],
  };
}
