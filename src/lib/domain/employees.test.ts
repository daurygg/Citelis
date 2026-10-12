import { describe, it, expect } from 'vitest';
import { activeEmployees, employeeName, validateEmployeeName } from './employees';
import type { Employee } from './types';

const marta: Employee = { id: 1, business_id: 1, name: 'Marta', active: true };
const lucia: Employee = { id: 2, business_id: 1, name: 'Lucía', active: false };

describe('validateEmployeeName', () => {
  it('acepta un nombre y le quita los espacios de los bordes', () => {
    expect(validateEmployeeName('  Marta ')).toEqual({ ok: true, name: 'Marta' });
  });

  it('rechaza un nombre vacío o de solo espacios, en el idioma de la dueña', () => {
    expect(validateEmployeeName('   ')).toEqual({ ok: false, message: 'Escribe el nombre de la empleada.' });
  });
});

describe('activeEmployees', () => {
  it('solo las activas, en el mismo orden', () => {
    expect(activeEmployees([marta, lucia])).toEqual([marta]);
  });
});

describe('employeeName', () => {
  it('devuelve el nombre, también el de una dada de baja (historial)', () => {
    expect(employeeName([marta, lucia], 2)).toBe('Lucía');
  });

  it('null o desconocida: sin nombre', () => {
    expect(employeeName([marta], null)).toBeNull();
    expect(employeeName([marta], 99)).toBeNull();
  });
});
