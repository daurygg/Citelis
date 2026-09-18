// Exportación de calendario para iPhone (Apple Calendar) y Android (Google Calendar).
// Slice E del self-booking (decisión D3 del documento ODD). Función pura: sin React,
// sin I/O — solo formatea UNA cita ya existente que el llamador entrega. NUNCA calcula,
// congela ni lee `charged_price`/`actual_cost`/`profit` (INVARIANTE 2): esos campos son
// del dominio de `appointments.ts`, no de este módulo de presentación.
import type { Appointment, Business, Service } from './types';

const NAIVE_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * `appointment.datetime` es un ISO local SIN zona (decisión D4, igual que en
 * `availability.ts`). Para sumarle la duración del servicio sin arrastrar reglas de
 * huso horario del host (DST, etc.) lo tratamos como si fuera UTC: es un truco de
 * cómputo interno, no una afirmación de que la hora ES UTC. El resultado se formatea
 * de nuevo como ISO local, plano, sin `Z`.
 */
function addMinutesToNaiveDateTime(naive: string, minutes: number): string {
  const match = NAIVE_DATETIME_RE.exec(naive);
  if (!match) throw new Error(`fecha/hora local inválida: ${naive}`);
  const [, year, month, day, hour, minute] = match;
  const baseMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const resultMs = baseMs + minutes * 60_000;
  const d = new Date(resultMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

/**
 * Convierte 'YYYY-MM-DDTHH:MM' (ISO local sin zona) al formato de hora flotante de
 * RFC 5545: 'YYYYMMDDTHHMMSS', SIN sufijo `Z`. Es la representación honesta de una
 * hora local sin huso: NO llamar aquí a `toISOString()`, que convertiría a UTC y
 * correría las horas (justo el bug que este módulo debe evitar).
 */
function toFloatingICSDateTime(naive: string): string {
  const match = NAIVE_DATETIME_RE.exec(naive);
  if (!match) throw new Error(`fecha/hora local inválida: ${naive}`);
  const [, year, month, day, hour, minute] = match;
  return `${year}${month}${day}T${hour}${minute}00`;
}

/**
 * Formatea un instante real (`now`) como UTC de RFC 5545: 'YYYYMMDDTHHMMSSZ'. A
 * diferencia de DTSTART/DTEND, DTSTAMP SÍ es un instante absoluto (el momento en que
 * se generó el archivo), así que el sufijo `Z` aquí es correcto e intencional: no
 * "corregir" esto para que coincida con la hora flotante de arriba.
 */
function toUtcICSDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Escapa texto para un valor de propiedad ICS (RFC 5545 §3.3.11): backslash, punto y
 * coma y coma se escapan con backslash; un salto de línea se convierte en la
 * secuencia literal `\n`. El orden importa: el backslash se escapa primero para no
 * duplicar el escape de los demás caracteres.
 */
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Dobla ("fold") una línea de propiedad si supera 75 octetos, insertando CRLF + un
 * espacio simple (RFC 5545 §3.1). El corte nunca cae en medio de un carácter UTF-8
 * multibyte: si el byte candidato es un byte de continuación (10xxxxxx), retrocede
 * hasta el inicio del carácter.
 */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder();
  const parts: string[] = [];
  let pos = 0;
  let budget = 75; // la primera línea física puede usar los 75 octetos completos.

  while (pos < bytes.length) {
    let end = Math.min(pos + budget, bytes.length);
    // Bytes de continuación UTF-8: 10xxxxxx (0x80–0xBF). Retroceder hasta el líder.
    while (end > pos && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(decoder.decode(bytes.slice(pos, end)));
    pos = end;
    budget = 74; // las líneas de continuación llevan un espacio que ya ocupa 1 octeto.
  }

  return parts.join('\r\n ');
}

export interface CalendarEventInput {
  appointment: Appointment;
  service: Service;
  business: Business;
  /** Identificador estable de la cita (mismo valor en cada regeneración). */
  uid: string;
  /** Aumenta con cada cambio de la cita: así iOS/Google Calendar ACTUALIZAN en vez de duplicar. */
  sequence: number;
  now: Date;
}

/**
 * Construye un VCALENDAR de RFC 5545 con un único VEVENT, listo para que la clienta
 * lo agregue a Apple Calendar (iPhone) o Google Calendar (Android) desde un archivo
 * `.ics`. Solo lee la cita que le entregan; nunca calcula ni congela dinero.
 */
export function buildICS(input: CalendarEventInput): string {
  const { appointment, service, business, uid, sequence, now } = input;

  const dtStart = toFloatingICSDateTime(appointment.datetime);
  const dtEnd = toFloatingICSDateTime(
    addMinutesToNaiveDateTime(appointment.datetime, service.duration_min),
  );
  const dtStamp = toUtcICSDateTime(now);
  const summary = escapeICSText(`${service.name} — ${business.name}`);
  const description = escapeICSText(`Cita de ${appointment.client}`);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Citelis//Self-Booking//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export interface GoogleCalendarUrlInput {
  appointment: Appointment;
  service: Service;
  business: Business;
}

/**
 * Link de plantilla de Google Calendar (`action=TEMPLATE`): un solo tap para
 * clientas con Android o Gmail, sin OAuth ni sincronización (decisión D3).
 */
export function googleCalendarUrl(input: GoogleCalendarUrlInput): string {
  const { appointment, service, business } = input;

  const start = toFloatingICSDateTime(appointment.datetime);
  const end = toFloatingICSDateTime(
    addMinutesToNaiveDateTime(appointment.datetime, service.duration_min),
  );

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${service.name} — ${business.name}`,
    dates: `${start}/${end}`,
    details: `Cita de ${appointment.client}`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
