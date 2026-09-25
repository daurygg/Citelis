// Aviso a la clienta por WhatsApp cuando la dueña responde su solicitud.
//
// POR QUÉ EXISTE
//   La clienta pide su cita desde el portal y hasta ahora no se enteraba de
//   nada: no hay correo, no hay página donde consultar el estado, y ninguna RPC
//   pública devuelve si su solicitud fue aceptada o rechazada. Esperaba una
//   respuesta que nunca llegaba, y podía aparecerse en el salón.
//
// POR QUÉ UN ENLACE Y NO UN ENVÍO AUTOMÁTICO
//   `wa.me` abre WhatsApp con el mensaje ya escrito y la dueña solo pulsa
//   enviar: un toque, sin proveedor, sin costo y sin trámites. El API oficial
//   exige verificación de Meta, número dedicado y plantillas aprobadas — ver
//   docs/whatsapp-api.md. Este módulo es el puente hasta entonces, y sigue
//   siendo el respaldo cuando el envío automático falle.
//
// Funciones puras: sin React, sin I/O. No tocan el estado de la cita ni el
// dinero; solo redactan texto sobre una cita que el dominio ya decidió.

/** República Dominicana. El número nacional son 10 dígitos y el país es el 1. */
const DEFAULT_COUNTRY_CODE = '1';

// E.164 admite hasta 15 dígitos. El mínimo no es de la norma: es el largo de un
// número dominicano ya con su país, y sirve para descartar lo que la clienta
// tecleó a medias ("123", "no tengo") antes de abrir un chat con nadie.
const MIN_INTERNATIONAL_DIGITS = 10;
const MAX_INTERNATIONAL_DIGITS = 15;

/**
 * Lleva el teléfono que tecleó la clienta a dígitos internacionales, sin `+`,
 * que es lo que `wa.me` espera en la ruta. Devuelve null si no hay un número
 * usable: sin él, la UI no debe ofrecer el botón.
 *
 * El formulario público no normaliza nada, así que aquí llega tal cual ella lo
 * escribió: con guiones, con paréntesis, con `+`, o con el país ya puesto.
 */
export function normalizeWhatsAppPhone(
  phone: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  if (typeof phone !== 'string') return null;

  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits === '') return null;

  // Un `+` delante es una afirmación explícita de que el número YA es
  // internacional: se respeta y no se le añade país encima.
  const international =
    trimmed.startsWith('+') || digits.length !== 10 ? digits : countryCode + digits;

  if (international.length < MIN_INTERNATIONAL_DIGITS) return null;
  if (international.length > MAX_INTERNATIONAL_DIGITS) return null;
  return international;
}

/** Qué decidió la dueña sobre la solicitud. */
export type BookingOutcome = 'accepted' | 'rejected';

export interface BookingNoticeInput {
  outcome: BookingOutcome;
  clientName: string;
  businessName: string;
  serviceName: string;
  /** Fecha ya formateada por la UI (ej: 'vie 25 sep'): el dominio no formatea fechas. */
  dateLabel: string;
  /** Hora ya formateada por la UI (ej: '2:00 PM'). */
  timeLabel: string;
}

/**
 * Redacta el mensaje que la clienta va a leer. Lo escribe el negocio, así que
 * habla en primera persona y dice quién es: a ella le llega desde un número que
 * quizá no tiene guardado.
 */
export function bookingNoticeMessage(input: BookingNoticeInput): string {
  const { outcome, clientName, businessName, serviceName, dateLabel, timeLabel } = input;
  const saludo = `Hola ${clientName}, soy ${businessName}.`;

  if (outcome === 'accepted') {
    return (
      `${saludo} Tu cita para ${serviceName} quedó confirmada para el ` +
      `${dateLabel} a las ${timeLabel}. ¡Te espero!`
    );
  }

  // Un "no" a secas manda a la clienta con la competencia. El rechazo tiene que
  // reabrir la conversación, que es lo único que la dueña gana de este mensaje.
  return (
    `${saludo} No voy a poder atenderte el ${dateLabel} a las ${timeLabel} ` +
    `para ${serviceName}. Escríbeme y buscamos otro horario.`
  );
}

/**
 * Enlace que abre WhatsApp con la conversación de la clienta y el mensaje ya
 * escrito. Null si el teléfono no sirve.
 */
export function whatsappUrl(
  phone: string | null | undefined,
  message: string,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  const number = normalizeWhatsAppPhone(phone, countryCode);
  if (number === null) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
