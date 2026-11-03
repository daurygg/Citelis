// Registro de clientas: búsqueda, iniciales y detección de duplicados.
//
// POR QUÉ EXISTE
//   Al agendar, la dueña elige a una clienta que ya conoce en vez de reescribir su
//   nombre y teléfono cada vez. Esto es la lógica de ese selector, sin React ni I/O
//   (INVARIANTE 5): la pantalla solo pinta lo que aquí se decide.

import { normalizeClientKey } from './payments';
import type { Client } from './types';

/** Cuántas clientas muestra el selector como máximo: en un teléfono más no caben. */
export const DEFAULT_CLIENT_LIMIT = 8;

/**
 * Los dígitos del teléfono sin el código de país 1 (NANP: República Dominicana, EE. UU.),
 * o null si no hay dígitos. "+1 809 555 1234", "1-809-555-1234" y "809-555-1234" son la
 * misma persona, así que un valor de 11 dígitos que empieza en 1 se guarda como sus
 * últimos 10. Es la MISMA regla que la función SQL `client_phone_digits` (columna
 * `client.phone_digits` y todas las búsquedas del servidor): si una cambia, cambia la otra.
 * (No usa `normalizeWhatsAppPhone`: ese SÍ necesita el país para armar el enlace wa.me.)
 */
export function phoneDigits(phone: string | null | undefined): string | null {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits === '') return null;
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

/**
 * Filtra y ordena las clientas para el selector. El texto busca por nombre (sin
 * tildes ni mayúsculas) y, si trae dígitos, también por teléfono. Primero van las
 * que EMPIEZAN con lo escrito, luego las que lo contienen y al final las que
 * coinciden solo por teléfono; dentro de cada grupo, por nombre. Sin texto devuelve
 * todas por nombre. No muta la lista.
 */
export function searchClients(
  clients: readonly Client[],
  query: string,
  limit: number = DEFAULT_CLIENT_LIMIT,
): Client[] {
  const needle = normalizeClientKey(query);
  const digits = phoneDigits(query);

  const ranked: { client: Client; rank: number; key: string }[] = [];
  for (const client of clients) {
    const key = normalizeClientKey(client.name);
    let rank: number;
    if (needle === '') rank = 0;
    else if (key.startsWith(needle)) rank = 0;
    else if (key.includes(needle)) rank = 1;
    else if (digits !== null && (phoneDigits(client.phone) ?? '').includes(digits)) rank = 2;
    else continue;
    ranked.push({ client, rank, key });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key) || a.client.id - b.client.id);
  return ranked.slice(0, Math.max(0, limit)).map((r) => r.client);
}

/** Letras del avatar: la inicial de las dos primeras palabras del nombre, o "?" sin nombre. */
export function clientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((w) => w[0].toLocaleUpperCase('es'))
    .join('');
}

/**
 * La clienta que ya tiene ESE teléfono (comparado por dígitos completos), o null.
 * Sirve para ofrecerle usarla en vez de crear un duplicado: la base rechaza dos
 * clientas con el mismo teléfono en un negocio. Comparación exacta a propósito:
 * "829000" no es la misma persona que "8290000001".
 */
export function findClientByPhone(clients: readonly Client[], phone: string | null | undefined): Client | null {
  const digits = phoneDigits(phone);
  if (digits === null) return null;
  return clients.find((c) => phoneDigits(c.phone) === digits) ?? null;
}
