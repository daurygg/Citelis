import { describe, expect, it } from 'vitest';
import { newBookingMessage } from './newBookingMessage';

describe('newBookingMessage', () => {
  const base = {
    appointment_id: 42,
    client: 'Ana Pérez',
    service_name: 'Uñas acrílicas',
    datetime: '2026-10-03T15:30',
  };

  it('dice quién pidió qué y cuándo, en lenguaje de la dueña', () => {
    const message = newBookingMessage(base);
    expect(message.title).toBe('Nueva solicitud de cita');
    expect(message.body).toBe('Ana Pérez pidió Uñas acrílicas para el sábado 3/10 a las 3:30 PM');
  });

  it('abre la bandeja de solicitudes al tocarla', () => {
    expect(newBookingMessage(base).url).toBe('/?vista=reservas');
  });

  it('usa una etiqueta por cita para no duplicar la misma notificación', () => {
    expect(newBookingMessage(base).tag).toBe('appointment-42');
  });

  it('calcula el día de la semana sin depender de la zona del servidor', () => {
    // 2026-10-04 es domingo; medianoche es el borde que rompe un Date en UTC-4.
    const message = newBookingMessage({ ...base, datetime: '2026-10-04T00:05' });
    expect(message.body).toContain('domingo 4/10 a las 12:05 AM');
  });

  it('recorta espacios del nombre y usa un genérico si viene vacío', () => {
    expect(newBookingMessage({ ...base, client: '  Ana  ' }).body).toMatch(/^Ana pidió/);
    expect(newBookingMessage({ ...base, client: '   ' }).body).toMatch(/^Una clienta pidió/);
  });

  it('sin servicio conocido no inventa uno', () => {
    const message = newBookingMessage({ ...base, service_name: null });
    expect(message.body).toBe('Ana Pérez pidió una cita para el sábado 3/10 a las 3:30 PM');
  });
});
