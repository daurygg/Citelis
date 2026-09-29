import { describe, it, expect } from 'vitest';
import {
  overlaps,
  findScheduleConflict,
  appointmentServiceIds,
  servicesDurationMs,
} from './scheduling';
import type { Appointment, Service } from './types';

function service(partial: Partial<Service> = {}): Service {
  return {
    id: 1,
    business_id: 1,
    name: 'Servicio',
    price: 0,
    supply_cost: 0,
    cost_override: null,
    duration_min: 60,
    variable_price: false,
    ...partial,
  };
}

function appointment(partial: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    business_id: 1,
    service_id: 1,
    client: 'Ana',
    datetime: '2026-07-02T10:00',
    status: 'PENDING',
    quoted_price: null,
    deposit: null,
    charged_price: null,
    actual_cost: null,
    profit: null,
    ...partial,
  };
}

describe('overlaps', () => {
  it('detecta solape', () => {
    expect(overlaps(0, 10, 5, 15)).toBe(true);
  });
  it('intervalos adyacentes NO se solapan (fin == inicio)', () => {
    expect(overlaps(0, 10, 10, 20)).toBe(false);
  });
});

describe('findScheduleConflict', () => {
  const services = [
    service({ id: 1, duration_min: 60 }),
    service({ id: 2, duration_min: 30 }),
    service({ id: 3, duration_min: 15 }),
  ];

  it('detecta choque cuando la nueva cita cae dentro de otra', () => {
    const existing = [appointment({ id: 1, service_id: 1, datetime: '2026-07-02T10:00' })]; // 10:00–11:00
    const conflict = findScheduleConflict(
      { datetime: '2026-07-02T10:30', service_ids: [2] },
      existing,
      services,
    );
    expect(conflict?.id).toBe(1);
  });

  it('no hay choque si la nueva empieza justo cuando termina la anterior', () => {
    const existing = [appointment({ id: 1, service_id: 1, datetime: '2026-07-02T10:00' })]; // 10:00–11:00
    const conflict = findScheduleConflict(
      { datetime: '2026-07-02T11:00', service_ids: [2] },
      existing,
      services,
    );
    expect(conflict).toBeNull();
  });

  it('ignora citas canceladas y no-show', () => {
    const existing = [
      appointment({ id: 1, status: 'CANCELED', datetime: '2026-07-02T10:00' }),
      appointment({ id: 2, status: 'NO_SHOW', datetime: '2026-07-02T10:00' }),
    ];
    expect(
      findScheduleConflict({ datetime: '2026-07-02T10:30', service_ids: [1] }, existing, services),
    ).toBeNull();
  });

  it('ignora la propia cita al reprogramar (por id)', () => {
    const existing = [appointment({ id: 5, service_id: 1, datetime: '2026-07-02T10:00' })];
    expect(
      findScheduleConflict(
        { id: 5, datetime: '2026-07-02T10:00', service_ids: [1] },
        existing,
        services,
      ),
    ).toBeNull();
  });

  it('no choca con citas de otro horario', () => {
    const existing = [appointment({ id: 1, service_id: 1, datetime: '2026-07-02T08:00' })]; // 08:00–09:00
    expect(
      findScheduleConflict({ datetime: '2026-07-02T10:00', service_ids: [1] }, existing, services),
    ).toBeNull();
  });

  // Slice B: una solicitud pública sin responder debe bloquear su horario;
  // si no, dos clientas podrían pedir la misma hora y la dueña heredaría un
  // choque que nunca creó (usa holdsSchedule, ver appointments.ts).
  it('una cita REQUESTED bloquea el horario igual que PENDING', () => {
    const existing = [appointment({ id: 1, status: 'REQUESTED', datetime: '2026-07-02T10:00' })]; // 10:00–11:00
    const conflict = findScheduleConflict(
      { datetime: '2026-07-02T10:30', service_ids: [2] },
      existing,
      services,
    );
    expect(conflict?.id).toBe(1);
  });

  it('una cita REJECTED libera el horario', () => {
    const existing = [appointment({ id: 1, status: 'REJECTED', datetime: '2026-07-02T10:00' })];
    expect(
      findScheduleConflict({ datetime: '2026-07-02T10:30', service_ids: [2] }, existing, services),
    ).toBeNull();
  });

  // T1: la candidata puede traer varios servicios; su duración es la SUMA.
  it('la duración de la candidata con varios servicios es la suma: choca donde uno solo no chocaría', () => {
    const existing = [appointment({ id: 1, service_id: 3, datetime: '2026-07-02T10:45' })]; // 10:45–11:00 (servicio 3, 15min)
    // Candidata: servicios 1 (60min) + 2 (30min) = 90min, empieza 09:30 → ocupa 09:30–11:00.
    // Un solo servicio (ej. solo el de 60min, 09:30–10:30) NO chocaría con 10:45–11:00.
    const conflict = findScheduleConflict(
      { datetime: '2026-07-02T09:30', service_ids: [1, 2] },
      existing,
      services,
    );
    expect(conflict?.id).toBe(1);
  });

  it('appointmentServiceIds: sin `service_ids`, devuelve [service_id]', () => {
    const a = appointment({ service_id: 7 });
    expect(appointmentServiceIds(a)).toEqual([7]);
  });

  it('appointmentServiceIds: con `service_ids`, lo devuelve tal cual', () => {
    const a = appointment({ service_id: 7, service_ids: [1, 2, 3] });
    expect(appointmentServiceIds(a)).toEqual([1, 2, 3]);
  });

  it('servicesDurationMs: suma la duración de 2 y 3 servicios', () => {
    const two = [service({ duration_min: 60 }), service({ duration_min: 30 })];
    const three = [service({ duration_min: 60 }), service({ duration_min: 30 }), service({ duration_min: 15 })];
    expect(servicesDurationMs(two)).toBe(90 * 60_000);
    expect(servicesDurationMs(three)).toBe(105 * 60_000);
  });
});
