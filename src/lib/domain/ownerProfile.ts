// Perfil de quien administra el negocio (odd/tasks/owner-profile.md): nombre,
// WhatsApp y tipo de negocio. Se pide al registrarse y, a los negocios que ya
// existían, una sola vez al entrar. Lógica pura (INVARIANTE 5).
//
// El WhatsApp usa la MISMA regla que el teléfono de clientes (`isValidPhone`), que
// a su vez es la de la función SQL `client_phone_is_valid`: el servidor la vuelve
// a aplicar en `create_business` y `save_owner_profile`.

import type { BusinessType } from './types';
import { PHONE_INVALID_MESSAGE, isValidPhone } from './clients';

export const OWNER_NAME_MIN_LENGTH = 2;
export const OWNER_NAME_MAX_LENGTH = 80;

/** Los tipos que se ofrecen, en orden. "Otro" siempre al final. */
export const BUSINESS_TYPES: readonly { value: BusinessType; label: string }[] = [
  { value: 'salon', label: 'Salón de belleza' },
  { value: 'barbershop', label: 'Barbería' },
  { value: 'nails', label: 'Uñas' },
  { value: 'lashes', label: 'Cejas y pestañas' },
  { value: 'spa', label: 'Spa' },
  { value: 'other', label: 'Otro' },
];

export function isBusinessType(value: unknown): value is BusinessType {
  return BUSINESS_TYPES.some((t) => t.value === value);
}

export interface OwnerProfileInput {
  owner_name: string;
  owner_whatsapp: string;
  business_type: BusinessType | null;
}

export interface OwnerProfile {
  owner_name: string;
  owner_whatsapp: string;
  business_type: BusinessType;
}

export type OwnerProfileErrors = Partial<Record<keyof OwnerProfileInput, string>>;

export type OwnerProfileCheck = { ok: true; value: OwnerProfile } | { ok: false; errors: OwnerProfileErrors };

/** Valida los tres datos y los devuelve limpios (espacios recortados y colapsados en el nombre). */
export function validateOwnerProfile(input: OwnerProfileInput): OwnerProfileCheck {
  const errors: OwnerProfileErrors = {};
  const name = input.owner_name.trim().replace(/\s+/g, ' ');
  const whatsapp = input.owner_whatsapp.trim();

  if (name.length < OWNER_NAME_MIN_LENGTH) errors.owner_name = 'Escribe tu nombre.';
  else if (name.length > OWNER_NAME_MAX_LENGTH) {
    errors.owner_name = `El nombre es muy largo (máximo ${OWNER_NAME_MAX_LENGTH} caracteres).`;
  }

  if (whatsapp === '') errors.owner_whatsapp = 'Escribe tu WhatsApp.';
  else if (!isValidPhone(whatsapp)) errors.owner_whatsapp = PHONE_INVALID_MESSAGE;

  if (!isBusinessType(input.business_type)) errors.business_type = 'Elige el tipo de negocio.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { owner_name: name, owner_whatsapp: whatsapp, business_type: input.business_type as BusinessType },
  };
}

/** Nombre visible de un tipo, o null si no se conoce. */
export function businessTypeLabel(value: string | null | undefined): string | null {
  return BUSINESS_TYPES.find((t) => t.value === value)?.label ?? null;
}
