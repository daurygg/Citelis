// Dirección pública del negocio: convierte el nombre que escribió la dueña en el
// trozo de URL que sus clientas van a ver (`/reservar/estetica-roelis`).
//
// POR QUÉ EXISTE (INVARIANTE 4)
//   Antes el enlace se armaba como `negocio-<id>`: un id de base de datos
//   disfrazado de dirección. Lo que la dueña reparte por WhatsApp tiene que
//   decir su nombre, no el número de fila que le tocó.
//
// QUÉ NO HACE
//   No garantiza unicidad. Dos "Salón Rosa" producen el mismo slug y solo la
//   base puede verlo (`booking_policy.public_slug` es UNIQUE): el desempate con
//   sufijo vive en `create_business`. Aquí se decide lo BONITO; allá, lo ÚNICO.
//
// Función pura: sin React, sin I/O, mismo nombre → mismo resultado.

/** Tope de largo del slug. Un enlace que no entra en un mensaje no se comparte. */
export const SLUG_MAX_LENGTH = 40;

/**
 * Respaldo cuando el nombre no deja ni una letra ni un número utilizable (solo
 * emojis, solo signos). Un enlace feo se arregla después; un alta de negocio
 * rota, no. `create_business` lo vuelve único añadiéndole el id.
 */
export const SLUG_FALLBACK = 'negocio';

// Marcas diacríticas combinantes que deja la descomposición NFD (U+0300–U+036F):
// la tilde de la ñ, el acento de la é, la diéresis de la ü. Se quitan para que
// "Peluquería Ñoño" quede en "peluqueria-nono" y no pierda letras por el camino.
const COMBINING_MARKS = /[̀-ͯ]/g;

// Todo lo que no sea letra ASCII o dígito se vuelve separador. Se aplica DESPUÉS
// de quitar las marcas, si no la "n" de la ñ se iría junto con su tilde.
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

/** Contrato que la base acepta: minúsculas, dígitos y guiones solo INTERIORES. */
const VALID_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * ¿Es este texto un slug válido? Mismo contrato que valida la migración en SQL
 * antes de guardarlo. Si los dos se separan, el alta empieza a caer al respaldo
 * sin que nadie entienda por qué.
 */
export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= SLUG_MAX_LENGTH && VALID_SLUG.test(slug);
}

/**
 * Recorta al tope de largo cortando por el último guión que quepa, para no
 * partir una palabra por la mitad ("…estetica-av"). Si la primera palabra ya
 * excede el tope no hay guión al que volver, y entonces sí se corta en seco.
 */
function truncateAtWord(slug: string): string {
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  const cut = slug.slice(0, SLUG_MAX_LENGTH);
  const lastDash = cut.lastIndexOf('-');
  return lastDash > 0 ? cut.slice(0, lastDash) : cut;
}

/**
 * Deriva la dirección pública a partir del nombre del negocio.
 * "Estética Roelis" → "estetica-roelis".
 */
export function slugifyBusinessName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, '-')
    .replace(/^-+|-+$/g, '');

  if (slug === '') return SLUG_FALLBACK;
  return truncateAtWord(slug);
}
