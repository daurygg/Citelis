import { describe, it, expect } from 'vitest';
import { slugifyBusinessName, SLUG_FALLBACK, SLUG_MAX_LENGTH, isValidSlug } from './slug';

describe('slugifyBusinessName', () => {
  it('convierte el nombre de la dueña en una dirección legible', () => {
    expect(slugifyBusinessName('Estética Roelis')).toBe('estetica-roelis');
    expect(slugifyBusinessName('Salón Rosa')).toBe('salon-rosa');
  });

  it('quita los acentos en vez de descartar la letra', () => {
    // "Peluquería Ñoño" no puede quedar en "peluquer-o-o": la dueña tiene que
    // reconocer su nombre en el enlace.
    expect(slugifyBusinessName('Peluquería Ñoño')).toBe('peluqueria-nono');
    expect(slugifyBusinessName('Müller Über')).toBe('muller-uber');
  });

  it('baja todo a minúsculas', () => {
    expect(slugifyBusinessName('MAYÚSCULAS S.R.L.')).toBe('mayusculas-s-r-l');
  });

  it('conserva los números, que son parte del nombre', () => {
    expect(slugifyBusinessName('Salón 24 Horas')).toBe('salon-24-horas');
  });

  it('colapsa espacios, símbolos y guiones repetidos en un solo guión', () => {
    expect(slugifyBusinessName('  Uñas   &   Más!!  ')).toBe('unas-mas');
    expect(slugifyBusinessName('a---b')).toBe('a-b');
    expect(slugifyBusinessName('Nails / Spa / Center')).toBe('nails-spa-center');
  });

  it('nunca deja guiones colgando en los extremos', () => {
    expect(slugifyBusinessName('-Rosa-')).toBe('rosa');
    expect(slugifyBusinessName('¡¡¡Rosa!!!')).toBe('rosa');
  });

  it('cae al respaldo cuando no queda nada utilizable', () => {
    // Un nombre de puros emojis o signos no puede tumbar el alta del negocio:
    // el enlace feo se arregla luego, un alta rota no.
    expect(slugifyBusinessName('')).toBe(SLUG_FALLBACK);
    expect(slugifyBusinessName('   ')).toBe(SLUG_FALLBACK);
    expect(slugifyBusinessName('!!!???')).toBe(SLUG_FALLBACK);
    expect(slugifyBusinessName('🎀💅')).toBe(SLUG_FALLBACK);
  });

  it('recorta los nombres largos sin dejar un guión al final del corte', () => {
    const largo = 'Centro de Belleza Integral y Estética Avanzada de la Ciudad';
    const slug = slugifyBusinessName(largo);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.startsWith('centro-de-belleza')).toBe(true);
  });

  it('es pura: mismo nombre, mismo resultado, y no toca la entrada', () => {
    const nombre = 'Estética Roelis';
    expect(slugifyBusinessName(nombre)).toBe(slugifyBusinessName(nombre));
    expect(nombre).toBe('Estética Roelis');
  });

  it('produce siempre algo que la base acepta como slug', () => {
    const nombres = ['Estética Roelis', '', '🎀💅', 'a---b', 'MAYÚSCULAS S.R.L.', 'Salón 24 Horas'];
    for (const nombre of nombres) {
      expect(isValidSlug(slugifyBusinessName(nombre))).toBe(true);
    }
  });
});

describe('isValidSlug', () => {
  // Es el mismo contrato que valida la migración en SQL antes de guardar. Si
  // estos dos se separan, el alta empieza a caer al respaldo sin motivo.
  it('acepta minúsculas, números y guiones interiores', () => {
    expect(isValidSlug('salon-rosa')).toBe(true);
    expect(isValidSlug('salon24')).toBe(true);
    expect(isValidSlug('a')).toBe(true);
  });

  it('rechaza lo que rompería la dirección', () => {
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('Salon-Rosa')).toBe(false);
    expect(isValidSlug('salon rosa')).toBe(false);
    expect(isValidSlug('salón')).toBe(false);
    expect(isValidSlug('-rosa')).toBe(false);
    expect(isValidSlug('rosa-')).toBe(false);
    expect(isValidSlug('a--b')).toBe(false);
    expect(isValidSlug('x'.repeat(SLUG_MAX_LENGTH + 1))).toBe(false);
  });
});
