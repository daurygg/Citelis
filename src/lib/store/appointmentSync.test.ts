import { describe, expect, it } from 'vitest';
import type { Appointment } from '../domain/types';
import { applyAppointmentChange, applyServiceIds, keepKnownServiceIds } from './appointmentSync';

const BUSINESS = 7;

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    business_id: BUSINESS,
    service_id: 10,
    client: 'Ana',
    datetime: '2026-10-03T15:30',
    status: 'PENDING',
    quoted_price: null,
    deposit: null,
    charged_price: null,
    actual_cost: null,
    profit: null,
    ...overrides,
  };
}

describe('applyAppointmentChange', () => {
  it('una reserva nueva del portal aparece en la lista', () => {
    const list = [appointment({ id: 1 })];
    const incoming = appointment({ id: 2, status: 'REQUESTED', source: 'SELF' });
    expect(applyAppointmentChange(list, { eventType: 'INSERT', new: incoming }, BUSINESS))
      .toEqual([list[0], incoming]);
  });

  it('el eco de una cita que la dueña acaba de crear no se duplica', () => {
    const mine = appointment({ id: 3 });
    const result = applyAppointmentChange([mine], { eventType: 'INSERT', new: mine }, BUSINESS);
    expect(result).toHaveLength(1);
  });

  it('un cambio de estado reemplaza la cita por la versión del servidor', () => {
    const list = [appointment({ id: 1 }), appointment({ id: 2, status: 'REQUESTED' })];
    const accepted = appointment({ id: 2, status: 'PENDING' });
    const result = applyAppointmentChange(list, { eventType: 'UPDATE', new: accepted }, BUSINESS);
    expect(result.map((a) => [a.id, a.status])).toEqual([[1, 'PENDING'], [2, 'PENDING']]);
  });

  it('una cita completada llega con su dinero congelado tal cual (INVARIANTE 2)', () => {
    const list = [appointment({ id: 5, status: 'IN_PROGRESS' })];
    const done = appointment({ id: 5, status: 'COMPLETED', charged_price: 350000, actual_cost: 42000, profit: 308000 });
    const [result] = applyAppointmentChange(list, { eventType: 'UPDATE', new: done }, BUSINESS);
    expect(result).toEqual(done);
  });

  it('un cambio de una cita que no estaba en la lista la añade', () => {
    // P. ej. entró mientras la app estaba suspendida y el primer evento que se
    // ve es ya su aceptación en otro dispositivo.
    const unseen = appointment({ id: 9, status: 'PENDING' });
    expect(applyAppointmentChange([], { eventType: 'UPDATE', new: unseen }, BUSINESS)).toEqual([unseen]);
  });

  it('nunca mete una cita de otro negocio (INVARIANTE 1)', () => {
    const list = [appointment({ id: 1 })];
    const foreign = appointment({ id: 2, business_id: 99 });
    expect(applyAppointmentChange(list, { eventType: 'INSERT', new: foreign }, BUSINESS)).toBe(list);
    expect(applyAppointmentChange(list, { eventType: 'UPDATE', new: { ...foreign, id: 1 } }, BUSINESS)).toBe(list);
  });

  it('si el evento no cambia nada, devuelve la MISMA lista (React no repinta)', () => {
    const same = appointment({ id: 1 });
    const list = [same];
    expect(applyAppointmentChange(list, { eventType: 'UPDATE', new: { ...same } }, BUSINESS)).toBe(list);
  });

  it('no modifica la lista que recibe', () => {
    const list = Object.freeze([appointment({ id: 1 })]);
    expect(() =>
      applyAppointmentChange(list, { eventType: 'INSERT', new: appointment({ id: 2 }) }, BUSINESS),
    ).not.toThrow();
    expect(list).toHaveLength(1);
  });
});

describe('applyAppointmentChange: service_ids sobrevive al eco del servidor', () => {
  it('la fila del servidor no trae service_ids: se conservan los que ya había', () => {
    const list = [appointment({ id: 1, service_ids: [10, 11] })];
    const echo = appointment({ id: 1, status: 'IN_PROGRESS' });
    const [result] = applyAppointmentChange(list, { eventType: 'UPDATE', new: echo }, BUSINESS);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.service_ids).toEqual([10, 11]);
  });

  it('si la fila del servidor sí trae service_ids, esos ganan', () => {
    const list = [appointment({ id: 1, service_ids: [10] })];
    const incoming = appointment({ id: 1, service_ids: [10, 12] });
    const [result] = applyAppointmentChange(list, { eventType: 'UPDATE', new: incoming }, BUSINESS);
    expect(result.service_ids).toEqual([10, 12]);
  });

  it('un eco idéntico (salvo la referencia del arreglo) devuelve la MISMA lista', () => {
    const list = [appointment({ id: 1, service_ids: [10, 11] })];
    const echo = appointment({ id: 1 });
    expect(applyAppointmentChange(list, { eventType: 'UPDATE', new: echo }, BUSINESS)).toBe(list);
  });
});

describe('applyServiceIds', () => {
  it('pone los servicios en la cita indicada sin tocar lo demás', () => {
    const list = [appointment({ id: 1 }), appointment({ id: 2, status: 'REQUESTED' })];
    const result = applyServiceIds(list, 2, [10, 11], BUSINESS);
    expect(result[1]).toEqual({ ...list[1], service_ids: [10, 11] });
    expect(result[0]).toBe(list[0]);
  });

  it('si ya tiene esos mismos servicios devuelve la MISMA lista', () => {
    const list = [appointment({ id: 1, service_ids: [10, 11] })];
    expect(applyServiceIds(list, 1, [10, 11], BUSINESS)).toBe(list);
  });

  it('una cita que no está en la lista no se inventa', () => {
    const list = [appointment({ id: 1 })];
    expect(applyServiceIds(list, 99, [10], BUSINESS)).toBe(list);
  });

  it('no toca citas de otro negocio (INVARIANTE 1)', () => {
    const list = [appointment({ id: 1, business_id: 99 })];
    expect(applyServiceIds(list, 1, [10, 11], BUSINESS)).toBe(list);
  });
});

describe('keepKnownServiceIds', () => {
  it('una cita de la foto sin service_ids conserva los que ya se conocían', () => {
    const previous = [appointment({ id: 1, service_ids: [10, 11] })];
    const fresh = [appointment({ id: 1, status: 'IN_PROGRESS' })];
    expect(keepKnownServiceIds(previous, fresh)).toEqual([
      appointment({ id: 1, status: 'IN_PROGRESS', service_ids: [10, 11] }),
    ]);
  });

  it('si la foto trae service_ids, ganan los de la foto', () => {
    const previous = [appointment({ id: 1, service_ids: [10, 11] })];
    const fresh = [appointment({ id: 1, service_ids: [10, 12] })];
    expect(keepKnownServiceIds(previous, fresh)).toEqual(fresh);
  });

  it('una cita nueva sin service_ids se queda sin ellos (cae a su service_id)', () => {
    const fresh = [appointment({ id: 2 })];
    expect(keepKnownServiceIds([], fresh)).toEqual(fresh);
  });

  it('no mezcla citas de otro negocio aunque coincida el id', () => {
    const previous = [appointment({ id: 1, business_id: 99, service_ids: [10, 11] })];
    const fresh = [appointment({ id: 1 })];
    expect(keepKnownServiceIds(previous, fresh)).toEqual(fresh);
  });
});
