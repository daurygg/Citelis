import { describe, it, expect } from 'vitest';
import { whatsappPaymentLink } from './subscriptionView';
import { CITELIS_WHATSAPP } from '../subscription/paymentInstructions';

describe('CITELIS_WHATSAPP', () => {
  it('es el 849-544-0323 en formato wa.me (código de país 1, sin signos)', () => {
    expect(CITELIS_WHATSAPP).toBe('18495440323');
  });
});

describe('whatsappPaymentLink', () => {
  it('incluye el nombre del negocio, codificado', () => {
    expect(whatsappPaymentLink(CITELIS_WHATSAPP, 'Salón Ana')).toBe(
      'https://wa.me/18495440323?text=Hola%2C%20quiero%20renovar%20el%20plan%20de%20Citelis%20de%20Sal%C3%B3n%20Ana.',
    );
  });

  it('sin nombre: mensaje sin nombre', () => {
    const expected = 'https://wa.me/18495440323?text=Hola%2C%20quiero%20renovar%20mi%20plan%20de%20Citelis.';
    expect(whatsappPaymentLink(CITELIS_WHATSAPP, undefined)).toBe(expected);
    expect(whatsappPaymentLink(CITELIS_WHATSAPP, null)).toBe(expected);
  });

  it('nombre en blanco: mensaje sin nombre', () => {
    expect(whatsappPaymentLink(CITELIS_WHATSAPP, '   ')).toBe(whatsappPaymentLink(CITELIS_WHATSAPP, undefined));
  });

  it('recorta los espacios del nombre', () => {
    expect(whatsappPaymentLink(CITELIS_WHATSAPP, '  Salón Ana ')).toBe(whatsappPaymentLink(CITELIS_WHATSAPP, 'Salón Ana'));
  });

  it('codifica caracteres especiales para que no rompan el enlace', () => {
    const url = whatsappPaymentLink(CITELIS_WHATSAPP, 'Uñas & Co #1 ¿100%?');
    const text = url.split('?text=')[1];
    expect(text).not.toMatch(/[&#?\s]/);
    expect(decodeURIComponent(text)).toBe('Hola, quiero renovar el plan de Citelis de Uñas & Co #1 ¿100%?.');
  });
});
