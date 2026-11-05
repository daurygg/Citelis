import { describe, it, expect } from 'vitest';
import { BUSINESS_TYPES, OWNER_NAME_MAX_LENGTH, isBusinessType, validateOwnerProfile } from './ownerProfile';
import { PHONE_INVALID_MESSAGE } from './clients';

const valid = { owner_name: '  Rosa   Pérez ', owner_whatsapp: ' 829-457-6475 ', business_type: 'salon' as const };

describe('validateOwnerProfile', () => {
  it('acepta un perfil completo y devuelve los textos limpios', () => {
    expect(validateOwnerProfile(valid)).toEqual({
      ok: true,
      value: { owner_name: 'Rosa Pérez', owner_whatsapp: '829-457-6475', business_type: 'salon' },
    });
  });

  it('acepta un WhatsApp de otro país con +', () => {
    expect(validateOwnerProfile({ ...valid, owner_whatsapp: '+34 612 345 678' }).ok).toBe(true);
  });

  it('pide los tres datos cuando faltan', () => {
    expect(validateOwnerProfile({ owner_name: ' ', owner_whatsapp: '', business_type: null })).toEqual({
      ok: false,
      errors: {
        owner_name: 'Escribe tu nombre.',
        owner_whatsapp: 'Escribe tu WhatsApp.',
        business_type: 'Elige el tipo de negocio.',
      },
    });
  });

  it('rechaza un nombre de una sola letra o demasiado largo', () => {
    expect(validateOwnerProfile({ ...valid, owner_name: 'R' })).toEqual({
      ok: false,
      errors: { owner_name: 'Escribe tu nombre.' },
    });
    expect(validateOwnerProfile({ ...valid, owner_name: 'a'.repeat(OWNER_NAME_MAX_LENGTH + 1) })).toEqual({
      ok: false,
      errors: { owner_name: `El nombre es muy largo (máximo ${OWNER_NAME_MAX_LENGTH} caracteres).` },
    });
  });

  it('rechaza un WhatsApp que no es un teléfono, con el mismo mensaje que el teléfono de clientes', () => {
    expect(validateOwnerProfile({ ...valid, owner_whatsapp: '12345' })).toEqual({
      ok: false,
      errors: { owner_whatsapp: PHONE_INVALID_MESSAGE },
    });
  });
});

describe('BUSINESS_TYPES', () => {
  it('ofrece los tipos en el orden en que se muestran, terminando en Otro', () => {
    expect(BUSINESS_TYPES.map((t) => t.value)).toEqual(['salon', 'barbershop', 'nails', 'lashes', 'spa', 'other']);
    expect(BUSINESS_TYPES.at(-1)?.label).toBe('Otro');
  });

  it('reconoce solo los tipos conocidos', () => {
    expect(isBusinessType('barbershop')).toBe(true);
    expect(isBusinessType('restaurante')).toBe(false);
    expect(isBusinessType(null)).toBe(false);
  });
});
