import { describe, it, expect } from 'vitest';
import { normalizeWhatsAppPhone, bookingNoticeMessage, whatsappUrl } from './whatsapp';

const CITA = {
  clientName: 'Rosa',
  businessName: 'Estética Roelis',
  serviceName: 'Uñas acrílicas',
  dateLabel: 'vie 25 sep',
  timeLabel: '2:00 PM',
};

describe('normalizeWhatsAppPhone', () => {
  it('le pone el país a un número dominicano de diez dígitos', () => {
    expect(normalizeWhatsAppPhone('8294576475')).toBe('18294576475');
  });

  it('aguanta como lo escriba la clienta en el formulario', () => {
    // El portal no normaliza nada: lo que ella teclee es lo que se guarda.
    expect(normalizeWhatsAppPhone('829-457-6475')).toBe('18294576475');
    expect(normalizeWhatsAppPhone('(829) 457 6475')).toBe('18294576475');
    expect(normalizeWhatsAppPhone('+1 829 457 6475')).toBe('18294576475');
    expect(normalizeWhatsAppPhone(' 1 829 457 6475 ')).toBe('18294576475');
  });

  it('no duplica el país si ya viene puesto', () => {
    expect(normalizeWhatsAppPhone('18294576475')).toBe('18294576475');
  });

  it('devuelve null cuando no hay un número usable', () => {
    // Sin número no hay aviso: es mejor no ofrecer el botón que abrir WhatsApp
    // en una conversación con nadie.
    expect(normalizeWhatsAppPhone(null)).toBeNull();
    expect(normalizeWhatsAppPhone(undefined)).toBeNull();
    expect(normalizeWhatsAppPhone('')).toBeNull();
    expect(normalizeWhatsAppPhone('   ')).toBeNull();
    expect(normalizeWhatsAppPhone('123')).toBeNull();
    expect(normalizeWhatsAppPhone('no tengo')).toBeNull();
  });

  it('respeta un número de otro país que ya trae su prefijo', () => {
    expect(normalizeWhatsAppPhone('+34 612 345 678')).toBe('34612345678');
  });
});

describe('bookingNoticeMessage', () => {
  it('confirma diciendo qué, cuándo y de parte de quién', () => {
    const texto = bookingNoticeMessage({ ...CITA, outcome: 'accepted' });
    expect(texto).toContain('Rosa');
    expect(texto).toContain('Estética Roelis');
    expect(texto).toContain('Uñas acrílicas');
    expect(texto).toContain('vie 25 sep');
    expect(texto).toContain('2:00 PM');
  });

  it('al rechazar, deja la puerta abierta en vez de solo decir que no', () => {
    // Una clienta que solo recibe un "no" se va con la competencia. El mensaje
    // tiene que invitarla a buscar otro horario.
    const texto = bookingNoticeMessage({ ...CITA, outcome: 'rejected' });
    expect(texto).toContain('Rosa');
    expect(texto).toContain('vie 25 sep');
    expect(texto.toLowerCase()).toContain('otro horario');
  });

  it('los dos mensajes son distintos y ninguno queda vacío', () => {
    const ok = bookingNoticeMessage({ ...CITA, outcome: 'accepted' });
    const no = bookingNoticeMessage({ ...CITA, outcome: 'rejected' });
    expect(ok).not.toBe(no);
    expect(ok.trim().length).toBeGreaterThan(0);
    expect(no.trim().length).toBeGreaterThan(0);
  });
});

describe('whatsappUrl', () => {
  it('arma el enlace con el número y el mensaje codificado', () => {
    const url = whatsappUrl('8294576475', 'Hola Rosa, ¿cómo estás?');
    expect(url).not.toBeNull();
    expect(url!.startsWith('https://wa.me/18294576475?text=')).toBe(true);
    // Los espacios y acentos tienen que ir codificados o WhatsApp corta el texto.
    expect(url).not.toContain(' ');
    expect(url).toContain('%C3%B3'); // la ó de "cómo"
  });

  it('sobrevive al viaje de ida y vuelta del mensaje', () => {
    const mensaje = bookingNoticeMessage({ ...CITA, outcome: 'accepted' });
    const url = whatsappUrl('8294576475', mensaje)!;
    const recuperado = decodeURIComponent(url.split('?text=')[1]);
    expect(recuperado).toBe(mensaje);
  });

  it('sin teléfono usable no hay enlace', () => {
    expect(whatsappUrl(null, 'hola')).toBeNull();
    expect(whatsappUrl('123', 'hola')).toBeNull();
  });
});
