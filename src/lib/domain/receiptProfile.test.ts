import { describe, it, expect } from 'vitest';
import {
  LOGO_MAX_BYTES,
  buildLogoPath,
  validateAddress,
  validateDisplayName,
  validateLogoFile,
  validatePhone,
} from './receiptProfile';

describe('validateAddress', () => {
  it('recorta los bordes y acepta una dirección normal', () => {
    expect(validateAddress('  Calle 1 #23 ')).toEqual({ ok: true, value: 'Calle 1 #23' });
  });
  it('vacía es válida y significa "sin dirección"', () => {
    expect(validateAddress('   ')).toEqual({ ok: true, value: null });
  });
  it('rechaza más de 200 letras', () => {
    expect(validateAddress('x'.repeat(201))).toEqual({ ok: false, message: 'La dirección es muy larga (máximo 200 letras).' });
  });
});

describe('validatePhone', () => {
  it('recorta y acepta', () => {
    expect(validatePhone(' 809-555-0101 ')).toEqual({ ok: true, value: '809-555-0101' });
  });
  it('vacío es válido', () => {
    expect(validatePhone('')).toEqual({ ok: true, value: null });
  });
  it('rechaza más de 40 caracteres', () => {
    expect(validatePhone('9'.repeat(41))).toEqual({ ok: false, message: 'El teléfono es muy largo (máximo 40 caracteres).' });
  });
});

describe('validateDisplayName', () => {
  it('recorta y acepta', () => {
    expect(validateDisplayName('  Ana ')).toEqual({ ok: true, value: 'Ana' });
  });
  it('vacío es válido (quita el nombre)', () => {
    expect(validateDisplayName(' ')).toEqual({ ok: true, value: null });
  });
  it('rechaza más de 60 letras', () => {
    expect(validateDisplayName('n'.repeat(61))).toEqual({ ok: false, message: 'El nombre es muy largo (máximo 60 letras).' });
  });
});

describe('validateLogoFile', () => {
  it('acepta png, jpeg y webp de hasta 500 KB', () => {
    expect(validateLogoFile({ type: 'image/png', size: 1000 })).toEqual({ ok: true, ext: 'png' });
    expect(validateLogoFile({ type: 'image/jpeg', size: LOGO_MAX_BYTES })).toEqual({ ok: true, ext: 'jpg' });
    expect(validateLogoFile({ type: 'image/webp', size: 10 })).toEqual({ ok: true, ext: 'webp' });
  });
  it('rechaza otros tipos (svg puede llevar scripts)', () => {
    expect(validateLogoFile({ type: 'image/svg+xml', size: 10 }).ok).toBe(false);
    expect(validateLogoFile({ type: '', size: 10 }).ok).toBe(false);
  });
  it('rechaza archivos de más de 500 KB y vacíos', () => {
    expect(validateLogoFile({ type: 'image/png', size: LOGO_MAX_BYTES + 1 })).toEqual({
      ok: false,
      message: 'La imagen pesa demasiado (máximo 500 KB). Prueba con una más liviana.',
    });
    expect(validateLogoFile({ type: 'image/png', size: 0 }).ok).toBe(false);
  });
});

describe('buildLogoPath', () => {
  it('arma <negocio>/logo-<marca>.<ext>', () => {
    expect(buildLogoPath(7, 1760000000000, 'png')).toBe('7/logo-1760000000000.png');
  });
});
