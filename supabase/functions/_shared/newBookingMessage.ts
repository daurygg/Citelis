// Texto de la notificación que recibe la dueña cuando entra una solicitud.
// Pura y sin dependencias de Deno ni de Node: la usa la Edge Function y la
// prueba vitest. `datetime` es hora local sin zona ("YYYY-MM-DDTHH:MM"), igual
// que `appointment.datetime`, así que NO se pasa por la zona del servidor.

export interface NewBookingInput {
  appointment_id: number;
  client: string;
  service_name: string | null;
  datetime: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Ruta que abre el service worker al tocar la notificación. */
  url: string;
  /** Misma etiqueta = el sistema reemplaza en vez de apilar duplicados. */
  tag: string;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "2026-10-03T15:30" → "sábado 3/10 a las 3:30 PM". */
function whenLabel(datetime: string): string {
  const [year, month, day] = datetime.slice(0, 10).split('-').map(Number);
  // Date.UTC + getUTCDay: el día de la semana no depende de dónde corre el código.
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const [hourStr, minute] = datetime.slice(11, 16).split(':');
  const hour = Number(hourStr);
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${weekday} ${day}/${month} a las ${hour12}:${minute} ${period}`;
}

export function newBookingMessage(input: NewBookingInput): PushMessage {
  const client = input.client.trim() || 'Una clienta';
  const what = input.service_name?.trim() || 'una cita';
  return {
    title: 'Nueva solicitud de cita',
    body: `${client} pidió ${what} para el ${whenLabel(input.datetime)}`,
    url: '/?vista=reservas',
    tag: `appointment-${input.appointment_id}`,
  };
}
