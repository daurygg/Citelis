import { describe, it, expect } from 'vitest';
import { overlaps, findScheduleConflict } from './scheduling';
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
  const services = [service({ id: 1, duration_min: 60 }), service({ id: 2, duration_min: 30 })];

  it('detecta choque cuando la nueva cita cae dentro de otra', () => {
    const existing = [appointment({ id: 1, service_id: 1, datetime: '2026-07-02T10:00' })]; // 10:00–11:00
    const conflict = findScheduleConflict({ datetime: '2026-07-02T10:30', service_id: 2 }, existing, services);
    expect(conflict?.id).toBe(1);
  });

  it('no hay choque si la nueva empieza justo cuando termina la anterior', () => {
    const existing = [appointment({ id: 1, service_id: 1, datetime: '2026-07-02T10:00' })]; // 10:00–11:00
    const conflict = findScheduleConflict({ datetime: '2026-07-02T11:00', service_id: 2 }, existing, services);
    expect(conflict).toBeNull();
  });

  it('ignora citas canceladas y no-show', () => {
    const existing = [
      appointment({ id: 1, status: 'CANCELED', datetime: '2026-07-02T10:00' }),
      appointment({ id: 2, status: 'NO_SHOW', datetime: '2026-07-02T10:00' }),
    ];
    expect(findScheduleConflict({ datetime: '2026-07-02T10:30', service_id: 1 }, existing, services)).toBeNull();
  });

  it('ignora la propia cita al reprogramar (por id)', () => {
    const existing = [appointment({ id: 5, service_id: 1, datetime: '2026-07-02T10:00' })];
    expect(findScheduleConflict({ id: 5, datetime: '2026-07-02T10:00', service_id: 1 }, existing, services)).toBeNull();
  });

  it('no choca con citas de otro horario', () => {
    const existing = [appointment({ id: 1, service_id: 1, datetime: '2026-07-02T08:00' })]; // 08:00–09:00
    expect(findScheduleConflict({ datetime: '2026-07-02T10:00', service_id: 1 }, existing, services)).toBeNull();
  });
});
