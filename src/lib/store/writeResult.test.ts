import { describe, expect, it } from 'vitest';
import { isAlreadySaved } from './writeResult';

describe('isAlreadySaved', () => {
  it('una clave duplicada (23505) significa que el intento anterior SÍ se guardó', () => {
    expect(isAlreadySaved({ code: '23505', message: 'duplicate key value violates unique constraint "appointment_pkey"' })).toBe(true);
  });

  it('cualquier otro error no cuenta como guardado', () => {
    expect(isAlreadySaved({ code: 'P0001', message: 'Ese negocio no es tuyo.' })).toBe(false);
    expect(isAlreadySaved({ message: 'No se pudo conectar con el servidor.' })).toBe(false);
  });

  it('sin error no hay nada que decidir', () => {
    expect(isAlreadySaved(null)).toBe(false);
  });
});
