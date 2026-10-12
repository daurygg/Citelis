// Datos del recibo (P4), sin React (INVARIANTE 5): validación de dirección, teléfono,
// nombre de quien cobra y logo, y la ruta del logo en el bucket. Los textos son para
// la dueña (INVARIANTE 4).

export const ADDRESS_MAX = 200;
export const PHONE_MAX = 40;
export const DISPLAY_NAME_MAX = 60;
export const LOGO_MAX_BYTES = 500 * 1024;
export const LOGO_BUCKET = 'business-logos';

export type TextCheck = { ok: true; value: string | null } | { ok: false; message: string };

function optionalText(raw: string, max: number, tooLong: string): TextCheck {
  const value = raw.trim();
  if (value === '') return { ok: true, value: null };
  if (value.length > max) return { ok: false, message: tooLong };
  return { ok: true, value };
}

/** Vacío es válido y significa "sin dato": el recibo simplemente no lo imprime. */
export function validateAddress(raw: string): TextCheck {
  return optionalText(raw, ADDRESS_MAX, `La dirección es muy larga (máximo ${ADDRESS_MAX} letras).`);
}

export function validatePhone(raw: string): TextCheck {
  return optionalText(raw, PHONE_MAX, `El teléfono es muy largo (máximo ${PHONE_MAX} caracteres).`);
}

export function validateDisplayName(raw: string): TextCheck {
  return optionalText(raw, DISPLAY_NAME_MAX, `El nombre es muy largo (máximo ${DISPLAY_NAME_MAX} letras).`);
}

const LOGO_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export type LogoCheck = { ok: true; ext: string } | { ok: false; message: string };

/** Solo png, jpeg o webp, de hasta 500 KB (svg se rechaza: puede traer scripts). */
export function validateLogoFile(file: { type: string; size: number }): LogoCheck {
  const ext = LOGO_EXT[file.type];
  if (!ext) return { ok: false, message: 'Usa una imagen PNG, JPG o WebP.' };
  if (file.size <= 0) return { ok: false, message: 'La imagen está vacía.' };
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, message: 'La imagen pesa demasiado (máximo 500 KB). Prueba con una más liviana.' };
  }
  return { ok: true, ext };
}

/** `<business_id>/logo-<marca>.<ext>`: la carpeta es la que exigen las policies del bucket. */
export function buildLogoPath(businessId: number, stamp: number, ext: string): string {
  return `${businessId}/logo-${stamp}.${ext}`;
}
