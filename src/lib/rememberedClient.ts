// Recuerda el nombre y el teléfono de la clienta EN SU PROPIO DISPOSITIVO, para
// que no tenga que teclearlos en cada reserva.
//
// DÓNDE VIVE ESTE DATO
//   En el almacenamiento local de su navegador y en ningún sitio más. No viaja a
//   la base, no se comparte entre dispositivos y el negocio no lo ve: el negocio
//   solo conoce el teléfono que ella envía al reservar, como siempre.
//
// LÍMITE HONESTO
//   Es por dispositivo y navegador. Si entra desde otro teléfono, o borra los
//   datos de navegación, vuelve a teclearlo una vez.
//
// La lectura y la escritura van envueltas en try/catch: en modo privado, con las
// cookies bloqueadas o con el disco lleno, `localStorage` LANZA en vez de
// devolver null. Que no se pueda recordar un teléfono jamás puede impedir
// reservar una cita.

const STORAGE_KEY = 'citelis.clienta';

/** Tope por campo. Lo que el portal escribe es muchísimo más corto; algo más largo no lo escribió él. */
const MAX_FIELD_LENGTH = 200;

export interface RememberedClient {
  name: string;
  phone: string;
}

/**
 * Interpreta lo que había guardado. Pura y total: devuelve null ante cualquier
 * cosa que no sea exactamente lo que el portal escribió, y nunca lanza.
 *
 * Es estricta a propósito. El contenido sale del dispositivo de la clienta, así
 * que puede estar a medias o manipulado, y rellenar un formulario con basura es
 * peor que no rellenarlo.
 */
export function parseRememberedClient(raw: string | null | undefined): RememberedClient | null {
  if (typeof raw !== 'string' || raw === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const { name, phone } = parsed as Record<string, unknown>;
  if (typeof name !== 'string' || typeof phone !== 'string') return null;
  if (name.length > MAX_FIELD_LENGTH || phone.length > MAX_FIELD_LENGTH) return null;

  const cleanName = name.trim();
  const cleanPhone = phone.trim();
  if (cleanName === '' || cleanPhone === '') return null;

  return { name: cleanName, phone: cleanPhone };
}

/** Texto a guardar. Pura, y pareja de `parseRememberedClient`. */
export function serializeRememberedClient(client: RememberedClient): string {
  return JSON.stringify({ name: client.name.trim(), phone: client.phone.trim() });
}

/** Lo recordado en ESTE dispositivo, o null si no hay nada o no se puede leer. */
export function readRememberedClient(): RememberedClient | null {
  try {
    return parseRememberedClient(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Recuerda para la próxima vez. Si no se puede guardar, no pasa nada: se teclea otra vez. */
export function rememberClient(client: RememberedClient): void {
  const parsed = parseRememberedClient(serializeRememberedClient(client));
  if (parsed === null) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeRememberedClient(parsed));
  } catch {
    // Modo privado, almacenamiento bloqueado o lleno. Silencio a propósito.
  }
}
