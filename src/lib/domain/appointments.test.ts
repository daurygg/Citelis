import { describe, it, expect } from 'vitest';
import { isValidTransition, transition, completeAppointment } from './appointments';
import type { Appointment, Service } from './types';

function service(partial: Partial<Service> = {}): Service {
  return {
    id: 1,
    business_id: 1,
    name: 'Pestañas',
    price: 5000, // $50
    supply_cost: 1000, // $10
    cost_override: null,
    duration_min: 60,
    ...partial,
  };
}

function appointment(partial: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    business_id: 1,
    service_id: 1,
    client: 'Ana',
    datetime: '2026-06-29T10:00:00.000Z',
    status: 'PENDING',
    charged_price: null,
    actual_cost: null,
    profit: null,
    ...partial,
  };
}

describe('isValidTransition', () => {
  it('acepta las transiciones válidas de la máquina de estados', () => {
    expect(isValidTransition('PENDING', 'IN_PROGRESS')).toBe(true);
    expect(isValidTransition('PENDING', 'CANCELED')).toBe(true);
    expect(isValidTransition('PENDING', 'COMPLETED')).toBe(true); // atajo
    expect(isValidTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('rechaza transiciones inválidas', () => {
    expect(isValidTransition('COMPLETED', 'PENDING')).toBe(false);
    expect(isValidTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(isValidTransition('CANCELED', 'PENDING')).toBe(false);
    expect(isValidTransition('IN_PROGRESS', 'CANCELED')).toBe(false);
    expect(isValidTransition('PENDING', 'PENDING')).toBe(false);
  });
});

describe('transition', () => {
  // DoD Slice 0: transición inválida (COMPLETED → PENDING) lanza error
  it('lanza error en una transición inválida (COMPLETED → PENDING)', () => {
    const completed = appointment({ status: 'COMPLETED' });
    expect(() => transition(completed, 'PENDING')).toThrow();
  });

  it('devuelve una nueva cita sin mutar la original', () => {
    const original = appointment({ status: 'PENDING' });
    const next = transition(original, 'IN_PROGRESS');
    expect(next.status).toBe('IN_PROGRESS');
    expect(original.status).toBe('PENDING'); // no mutada
    expect(next).not.toBe(original);
  });
});

describe('completeAppointment', () => {
  // DoD Slice 0: completeAppointment congela los 3 valores y no muta la original
  it('congela charged_price, actual_cost y profit, y no muta la cita original', () => {
    const original = appointment({ status: 'PENDING' });
    const svc = service({ price: 5000, supply_cost: 1000 });

    const done = completeAppointment(original, svc);

    expect(done.status).toBe('COMPLETED');
    expect(done.charged_price).toBe(5000);
    expect(done.actual_cost).toBe(1000);
    expect(done.profit).toBe(4000);

    // La cita original sigue intacta (append-only, INVARIANTE 2).
    expect(original.status).toBe('PENDING');
    expect(original.charged_price).toBeNull();
    expect(original.profit).toBeNull();
    expect(done).not.toBe(original);
  });

  it('permite el atajo PENDING → COMPLETED', () => {
    const done = completeAppointment(appointment({ status: 'PENDING' }), service());
    expect(done.status).toBe('COMPLETED');
  });

  it('completa desde IN_PROGRESS', () => {
    const done = completeAppointment(appointment({ status: 'IN_PROGRESS' }), service());
    expect(done.status).toBe('COMPLETED');
  });

  it('respeta el override de precio (descuento)', () => {
    const svc = service({ price: 5000, supply_cost: 1000 });
    const done = completeAppointment(appointment(), svc, 4000); // descuento
    expect(done.charged_price).toBe(4000);
    expect(done.profit).toBe(3000);
  });

  it('usa el cost_override del servicio como costo real si existe', () => {
    const svc = service({ price: 5000, supply_cost: 1000, cost_override: 700 });
    const done = completeAppointment(appointment(), svc);
    expect(done.actual_cost).toBe(700);
    expect(done.profit).toBe(4300);
  });

  // DoD Slice 0: cambiar service.price DESPUÉS de completar NO altera la ganancia congelada
  it('cambiar el precio del servicio después de completar NO altera la cita', () => {
    const svc = service({ price: 5000, supply_cost: 1000 });
    const done = completeAppointment(appointment(), svc);
    const gananciaCongelada = done.profit;

    // La dueña sube el precio del servicio más tarde.
    svc.price = 9999;
    svc.supply_cost = 3333;

    expect(done.charged_price).toBe(5000);
    expect(done.actual_cost).toBe(1000);
    expect(done.profit).toBe(gananciaCongelada);
    expect(done.profit).toBe(4000);
  });

  it('no se puede completar una cita ya COMPLETED (lanza error)', () => {
    const done = completeAppointment(appointment(), service());
    expect(() => completeAppointment(done, service())).toThrow();
  });

  it('no se puede completar una cita CANCELED (lanza error)', () => {
    const canceled = appointment({ status: 'CANCELED' });
    expect(() => completeAppointment(canceled, service())).toThrow();
  });

  // INVARIANTE 1: aislamiento por tenant
  it('lanza error si el servicio es de otro negocio (business_id distinto)', () => {
    const apt = appointment({ business_id: 1, service_id: 1 });
    const svcOtroTenant = service({ id: 1, business_id: 2 });
    expect(() => completeAppointment(apt, svcOtroTenant)).toThrow();
  });

  it('lanza error si el servicio no corresponde al service_id de la cita', () => {
    const apt = appointment({ service_id: 1 });
    const otroServicio = service({ id: 2 });
    expect(() => completeAppointment(apt, otroServicio)).toThrow();
  });
});
