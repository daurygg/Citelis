import { describe, expect, it } from 'vitest';
import { isAlreadySaved, isPaymentAlreadySaved } from './writeResult';

describe('isAlreadySaved', () => {
  it('una clave duplicada (23505) significa que el intento anterior SÍ se guardó', () => {
    expect(isAlreadySaved({ code: '23505', message: 'duplicate key value violates unique constraint "appointment_pkey"' })).toBe(true);
  });

  it('un 23505 de OTRA restricción única no prueba que la cita se guardó', () => {
    expect(
      isAlreadySaved({ code: '23505', message: 'duplicate key value violates unique constraint "appointment_service_pkey"' }),
    ).toBe(false);
  });

  it('cualquier otro error no cuenta como guardado', () => {
    expect(isAlreadySaved({ code: 'P0001', message: 'Ese negocio no es tuyo.' })).toBe(false);
    expect(isAlreadySaved({ message: 'No se pudo conectar con el servidor.' })).toBe(false);
  });

  it('sin error no hay nada que decidir', () => {
    expect(isAlreadySaved(null)).toBe(false);
  });
});

describe('isPaymentAlreadySaved', () => {
  it('la llave primaria del pago prueba que el intento anterior SÍ lo registró', () => {
    expect(
      isPaymentAlreadySaved({ code: '23505', message: 'duplicate key value violates unique constraint "appointment_payment_pkey"' }),
    ).toBe(true);
  });

  it('otro 23505 o cualquier otro error no cuenta como guardado', () => {
    expect(isPaymentAlreadySaved({ code: '23505', message: 'duplicate key value violates unique constraint "appointment_pkey"' })).toBe(false);
    expect(isPaymentAlreadySaved({ code: 'P0001', message: 'El pago es mayor que lo que se debe.' })).toBe(false);
    expect(isPaymentAlreadySaved(null)).toBe(false);
  });
});
