import { describe, expect, it } from 'vitest';
import { completedWithoutLines, mergeServiceLines } from './serviceLines';
import type { Appointment } from '../domain/types';

const line = (appointment_id: number, service_id: number, profit: number | null, business_id = 1) => ({
  appointment_id,
  service_id,
  business_id,
  profit,
});

function appt(id: number, status: Appointment['status']): Appointment {
  return {
    id,
    business_id: 1,
    service_id: 1,
    client: 'Ana',
    datetime: '2026-10-01T10:00',
    status,
    quoted_price: null,
    deposit: null,
    charged_price: null,
    actual_cost: null,
    profit: null,
  };
}

describe('mergeServiceLines', () => {
  it('reemplaza las líneas de las citas que llegan y conserva las demás', () => {
    const prev = [line(1, 1, 100), line(2, 1, 200)];
    const next = mergeServiceLines(prev, [line(1, 1, 50), line(1, 2, 70)], 1);
    expect(next).toEqual([line(2, 1, 200), line(1, 1, 50), line(1, 2, 70)]);
  });

  it('ignora líneas de otro negocio (INVARIANTE 1)', () => {
    const next = mergeServiceLines([], [line(1, 1, 50, 99)], 1);
    expect(next).toEqual([]);
  });

  it('devuelve la misma lista si no llega nada', () => {
    const prev = [line(1, 1, 100)];
    expect(mergeServiceLines(prev, [], 1)).toBe(prev);
  });
});

describe('completedWithoutLines', () => {
  it('lista las citas COMPLETED que aún no tienen líneas con ganancia', () => {
    const appointments = [appt(1, 'COMPLETED'), appt(2, 'COMPLETED'), appt(3, 'PENDING')];
    const lines = [line(1, 1, 100)];
    expect(completedWithoutLines(appointments, lines)).toEqual([2]);
  });

  it('una cita cuyas líneas tienen ganancia null sigue contando como sin líneas', () => {
    expect(completedWithoutLines([appt(1, 'COMPLETED')], [line(1, 1, null)])).toEqual([1]);
  });
});
