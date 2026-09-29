import { describe, it, expect } from 'vitest';
import { generateSlots } from './availability';
import type { Appointment, BookingPolicy, BusinessHours, Service, TimeBlock } from './types';

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

function businessHours(partial: Partial<BusinessHours> = {}): BusinessHours {
  return {
    id: 1,
    business_id: 1,
    weekday: 1, // lunes
    opens_at: '09:00',
    closes_at: '12:00',
    ...partial,
  };
}

function timeBlock(partial: Partial<TimeBlock> = {}): TimeBlock {
  return {
    id: 1,
    business_id: 1,
    starts_at: '2026-09-21T11:00',
    ends_at: '2026-09-21T12:00',
    reason: 'Bloqueo',
    ...partial,
  };
}

function policy(partial: Partial<BookingPolicy> = {}): BookingPolicy {
  return {
    business_id: 1,
    slot_step_min: 60,
    buffer_min: 0,
    min_notice_hours: 0,
    max_horizon_days: 365,
    ...partial,
  };
}

function appointment(partial: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    business_id: 1,
    service_id: 1,
    client: 'Ana',
    datetime: '2026-09-21T09:00',
    status: 'PENDING',
    quoted_price: null,
    deposit: null,
    charged_price: null,
    actual_cost: null,
    profit: null,
    ...partial,
  };
}

// 2026-09-21 es lunes (weekday 1); 2026-09-20 es domingo (weekday 0).
// 2026-09-17 (hoy en las pruebas de anticipación/horizonte) es jueves.

describe('generateSlots', () => {
  it('un día sin BusinessHours para ese weekday no ofrece ningún slot', () => {
    const slots = generateSlots({
      date: '2026-09-20', // domingo, sin horario cargado
      candidateServices: [service()],
      hours: [businessHours({ weekday: 1 })], // solo lunes
      blocks: [],
      appointments: [],
      services: [service()],
      policy: policy(),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([]);
  });

  it('ofrece slots dentro de [opens_at, closes_at) con el paso de slot_step_min', () => {
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [service({ duration_min: 60 })],
      hours: [businessHours({ opens_at: '09:00', closes_at: '12:00' })],
      blocks: [],
      appointments: [],
      services: [service()],
      policy: policy({ slot_step_min: 60 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([
      { start: '2026-09-21T09:00', end: '2026-09-21T10:00' },
      { start: '2026-09-21T10:00', end: '2026-09-21T11:00' },
      { start: '2026-09-21T11:00', end: '2026-09-21T12:00' },
    ]);
  });

  it('un servicio que terminaría después de closes_at no se ofrece', () => {
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [service({ duration_min: 90 })], // no cabe en la ventana de 1h
      hours: [businessHours({ opens_at: '09:00', closes_at: '10:00' })],
      blocks: [],
      appointments: [],
      services: [service({ duration_min: 90 })],
      policy: policy({ slot_step_min: 30 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([]);
  });

  it('una cita PENDING existente bloquea su horario, pero CANCELED y NO_SHOW no', () => {
    const svc = service({ id: 1, duration_min: 60 });
    const appointments = [
      appointment({ id: 1, status: 'PENDING', datetime: '2026-09-21T10:00' }), // 10:00–11:00
      appointment({ id: 2, status: 'CANCELED', datetime: '2026-09-21T09:00' }),
      appointment({ id: 3, status: 'NO_SHOW', datetime: '2026-09-21T11:00' }),
    ];
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '12:00' })],
      blocks: [],
      appointments,
      services: [svc],
      policy: policy({ slot_step_min: 60 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([
      { start: '2026-09-21T09:00', end: '2026-09-21T10:00' },
      { start: '2026-09-21T11:00', end: '2026-09-21T12:00' },
    ]);
  });

  it('un TimeBlock que solapa un slot lo elimina', () => {
    const svc = service({ duration_min: 60 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '12:00' })],
      blocks: [timeBlock({ starts_at: '2026-09-21T11:00', ends_at: '2026-09-21T12:00' })],
      appointments: [],
      services: [svc],
      policy: policy({ slot_step_min: 60 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([
      { start: '2026-09-21T09:00', end: '2026-09-21T10:00' },
      { start: '2026-09-21T10:00', end: '2026-09-21T11:00' },
    ]);
  });

  it('buffer_min separa el fin de una cita existente del inicio del siguiente slot', () => {
    const svc = service({ duration_min: 60 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '12:00' })],
      blocks: [],
      appointments: [appointment({ datetime: '2026-09-21T09:00' })], // 09:00–10:00
      services: [svc],
      policy: policy({ slot_step_min: 60, buffer_min: 30 }),
      now: new Date('2026-09-17T00:00'),
    });
    // 09:00 ocupado por la cita; 10:00 cae dentro del buffer (hasta 10:30); solo queda 11:00.
    expect(slots).toEqual([{ start: '2026-09-21T11:00', end: '2026-09-21T12:00' }]);
  });

  it('una cita cuyo servicio no está en `services` bloquea el resto del día', () => {
    const svc = service({ id: 1, duration_min: 60 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '13:00' })],
      blocks: [],
      // service_id 99 no aparece en `services`: no se puede saber cuánto dura.
      appointments: [appointment({ service_id: 99, datetime: '2026-09-21T11:00' })],
      services: [svc],
      policy: policy({ slot_step_min: 60, buffer_min: 0 }),
      now: new Date('2026-09-17T00:00'),
    });
    // Falla en seguro: se bloquea desde su inicio en adelante, nunca se ofrece
    // un horario que podría estar ocupado.
    expect(slots).toEqual([
      { start: '2026-09-21T09:00', end: '2026-09-21T10:00' },
      { start: '2026-09-21T10:00', end: '2026-09-21T11:00' },
    ]);
  });

  it('buffer_min también protege el descanso ANTES de una cita existente', () => {
    const svc = service({ duration_min: 60 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '13:00' })],
      blocks: [],
      appointments: [appointment({ datetime: '2026-09-21T11:00' })], // 11:00-12:00
      services: [svc],
      policy: policy({ slot_step_min: 60, buffer_min: 30 }),
      now: new Date('2026-09-17T00:00'),
    });
    // El descanso es a ambos lados: ocupa [10:30, 12:30). Un slot 10:00-11:00
    // terminaría pegado a la cita sin descanso, así que no se ofrece.
    expect(slots).toEqual([{ start: '2026-09-21T09:00', end: '2026-09-21T10:00' }]);
  });

  it('min_notice_hours descarta slots demasiado próximos a "now" (mismo día)', () => {
    const svc = service({ duration_min: 60 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '12:00' })],
      blocks: [],
      appointments: [],
      services: [svc],
      policy: policy({ slot_step_min: 60, min_notice_hours: 2 }),
      now: new Date('2026-09-21T08:30'), // mismo día, 08:30
    });
    // corte en 10:30: 09:00 y 10:00 quedan demasiado cerca, solo 11:00 sobrevive.
    expect(slots).toEqual([{ start: '2026-09-21T11:00', end: '2026-09-21T12:00' }]);
  });

  it('max_horizon_days descarta fechas demasiado lejanas en el futuro', () => {
    const svc = service({ duration_min: 60 });
    const slots = generateSlots({
      date: '2026-09-21', // 4 días después de "now"
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '12:00' })],
      blocks: [],
      appointments: [],
      services: [svc],
      policy: policy({ slot_step_min: 60, max_horizon_days: 3 }),
      now: new Date('2026-09-17T00:00'), // jueves
    });
    expect(slots).toEqual([]);
  });

  it('slot_step_min controla la granularidad de los horarios ofrecidos', () => {
    const svc = service({ duration_min: 30 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '10:00' })],
      blocks: [],
      appointments: [],
      services: [svc],
      policy: policy({ slot_step_min: 15 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([
      { start: '2026-09-21T09:00', end: '2026-09-21T09:30' },
      { start: '2026-09-21T09:15', end: '2026-09-21T09:45' },
      { start: '2026-09-21T09:30', end: '2026-09-21T10:00' },
    ]);
  });

  it('es pura: no muta sus entradas y con el mismo "now" devuelve el mismo resultado', () => {
    const svc = service({ duration_min: 60 });
    const hoursInput = [businessHours({ opens_at: '09:00', closes_at: '12:00' })];
    const blocksInput = [timeBlock({ starts_at: '2026-09-21T11:00', ends_at: '2026-09-21T12:00' })];
    const appointmentsInput = [appointment({ datetime: '2026-09-21T09:00' })];
    const policyInput = policy({ slot_step_min: 60 });

    const hoursSnapshot = JSON.parse(JSON.stringify(hoursInput));
    const blocksSnapshot = JSON.parse(JSON.stringify(blocksInput));
    const appointmentsSnapshot = JSON.parse(JSON.stringify(appointmentsInput));
    const policySnapshot = JSON.parse(JSON.stringify(policyInput));

    const input = {
      date: '2026-09-21',
      candidateServices: [svc],
      hours: hoursInput,
      blocks: blocksInput,
      appointments: appointmentsInput,
      services: [svc],
      policy: policyInput,
      now: new Date('2026-09-17T00:00'),
    };

    const first = generateSlots(input);
    const second = generateSlots(input);

    expect(first).toEqual(second);
    expect(hoursInput).toEqual(hoursSnapshot);
    expect(blocksInput).toEqual(blocksSnapshot);
    expect(appointmentsInput).toEqual(appointmentsSnapshot);
    expect(policyInput).toEqual(policySnapshot);
  });

  it('varias filas de BusinessHours el mismo weekday (mañana y tarde) se respetan ambas', () => {
    const svc = service({ duration_min: 60 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [
        businessHours({ id: 1, opens_at: '09:00', closes_at: '12:00' }),
        businessHours({ id: 2, opens_at: '14:00', closes_at: '17:00' }),
      ],
      blocks: [],
      appointments: [],
      services: [svc],
      policy: policy({ slot_step_min: 60 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([
      { start: '2026-09-21T09:00', end: '2026-09-21T10:00' },
      { start: '2026-09-21T10:00', end: '2026-09-21T11:00' },
      { start: '2026-09-21T11:00', end: '2026-09-21T12:00' },
      { start: '2026-09-21T14:00', end: '2026-09-21T15:00' },
      { start: '2026-09-21T15:00', end: '2026-09-21T16:00' },
      { start: '2026-09-21T16:00', end: '2026-09-21T17:00' },
    ]);
  });

  it('un duration_min <= 0 no ofrece ningún slot', () => {
    const svc = service({ duration_min: 0 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '12:00' })],
      blocks: [],
      appointments: [],
      services: [svc],
      policy: policy(),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([]);
  });

  it('un BusinessHours con HH:MM malformado se ignora en vez de romper', () => {
    const svc = service({ duration_min: 60 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ id: 1, opens_at: 'nueve', closes_at: '12:00' })],
      blocks: [],
      appointments: [],
      services: [svc],
      policy: policy({ slot_step_min: 60 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([]);
  });

  it('un date malformado no ofrece ningún slot', () => {
    const svc = service({ duration_min: 60 });
    const slots = generateSlots({
      date: '2026-13-40',
      candidateServices: [svc],
      hours: [businessHours()],
      blocks: [],
      appointments: [],
      services: [svc],
      policy: policy(),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([]);
  });

  // Slice B: la solicitud pública (REQUESTED) debe bloquear su propio slot;
  // si no, dos clientas podrían pedir la misma hora antes de que la dueña responda.
  it('una cita REQUESTED bloquea su horario, igual que PENDING', () => {
    const svc = service({ id: 1, duration_min: 60 });
    const appointments = [appointment({ id: 1, status: 'REQUESTED', datetime: '2026-09-21T10:00' })]; // 10:00–11:00
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '12:00' })],
      blocks: [],
      appointments,
      services: [svc],
      policy: policy({ slot_step_min: 60 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([
      { start: '2026-09-21T09:00', end: '2026-09-21T10:00' },
      { start: '2026-09-21T11:00', end: '2026-09-21T12:00' },
    ]);
  });

  it('una cita REJECTED libera su horario', () => {
    const svc = service({ id: 1, duration_min: 60 });
    const appointments = [appointment({ id: 1, status: 'REJECTED', datetime: '2026-09-21T10:00' })];
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [svc],
      hours: [businessHours({ opens_at: '09:00', closes_at: '12:00' })],
      blocks: [],
      appointments,
      services: [svc],
      policy: policy({ slot_step_min: 60 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([
      { start: '2026-09-21T09:00', end: '2026-09-21T10:00' },
      { start: '2026-09-21T10:00', end: '2026-09-21T11:00' },
      { start: '2026-09-21T11:00', end: '2026-09-21T12:00' },
    ]);
  });

  it('rechaza una fecha que existe en formato pero no en el calendario', () => {
    const svc = service({ duration_min: 60 });
    const slots = generateSlots({
      date: '2026-02-30', // febrero no tiene 30: Date lo desbordaría a marzo
      candidateServices: [svc],
      hours: [businessHours({ weekday: 1 }), businessHours({ weekday: 5 })],
      blocks: [],
      appointments: [],
      services: [svc],
      policy: policy(),
      now: new Date('2026-01-01T00:00'),
    });
    expect(slots).toEqual([]);
  });
});

// T1: la candidata puede traer varios servicios (odd/tasks/multi-service-appointments.md).
describe('generateSlots — varios servicios', () => {
  it('la duración de la candidata con 2 servicios es la suma (30+45=75min, no cabe en 1h)', () => {
    const a = service({ id: 1, duration_min: 30 });
    const b = service({ id: 2, duration_min: 45 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [a, b], // 75min
      hours: [businessHours({ opens_at: '09:00', closes_at: '10:00' })], // ventana de 1h
      blocks: [],
      appointments: [],
      services: [a, b],
      policy: policy({ slot_step_min: 30 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([]);
  });

  it('la duración de la candidata con 3 servicios es la suma (30+30+30=90min, cabe exactamente una vez)', () => {
    const a = service({ id: 1, duration_min: 30 });
    const b = service({ id: 2, duration_min: 30 });
    const c = service({ id: 3, duration_min: 30 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [a, b, c], // 90min
      // Ventana de exactamente 90min: solo un inicio (09:00) hace que
      // start + 90min quepa en [opens_at, closes_at).
      hours: [businessHours({ opens_at: '09:00', closes_at: '10:30' })],
      blocks: [],
      appointments: [],
      services: [a, b, c],
      policy: policy({ slot_step_min: 30 }),
      now: new Date('2026-09-17T00:00'),
    });
    expect(slots).toEqual([{ start: '2026-09-21T09:00', end: '2026-09-21T10:30' }]);
  });

  it('una cita existente con varios servicios ocupa la suma: un slot que cabría contra uno solo se rechaza contra la suma', () => {
    const a = service({ id: 1, duration_min: 30 });
    const b = service({ id: 2, duration_min: 30 });
    // Cita existente con servicios [a, b] a las 09:00 ocupa 09:00–10:00 (suma 60min),
    // no solo 09:00–09:30 (lo que ocuparía si solo contara el primer servicio).
    const existing = appointment({ id: 1, service_ids: [1, 2], datetime: '2026-09-21T09:00' });
    const candidate = service({ id: 3, duration_min: 30 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [candidate],
      hours: [businessHours({ opens_at: '09:00', closes_at: '11:00' })],
      blocks: [],
      appointments: [existing],
      services: [a, b, candidate],
      policy: policy({ slot_step_min: 30 }),
      now: new Date('2026-09-17T00:00'),
    });
    // 09:00 y 09:30 caen dentro de la suma ocupada [09:00, 10:00); solo sobrevive 10:00 y 10:30.
    expect(slots).toEqual([
      { start: '2026-09-21T10:00', end: '2026-09-21T10:30' },
      { start: '2026-09-21T10:30', end: '2026-09-21T11:00' },
    ]);
  });

  // El fallo seguro (decisión A6, availability.ts) exige bloquear a Infinity si
  // no se puede confiar en la duración. Con varios servicios NO basta con que
  // falten TODOS: si de dos servicios solo UNO desaparece del catálogo, la
  // duración calculada con el que queda sería corta e igual dejaría pasar una
  // doble reserva. Por eso el criterio es "si falta CUALQUIERA".
  it('fallo seguro: cita con 2 servicios donde solo 1 está en el catálogo bloquea a Infinity', () => {
    const found = service({ id: 1, duration_min: 30 });
    // El servicio 2 NO está en `services`: falta uno de los dos.
    const existing = appointment({ id: 1, service_ids: [1, 2], datetime: '2026-09-21T11:00' });
    const candidate = service({ id: 3, duration_min: 60 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [candidate],
      hours: [businessHours({ opens_at: '09:00', closes_at: '13:00' })],
      blocks: [],
      appointments: [existing],
      services: [found, candidate],
      policy: policy({ slot_step_min: 60 }),
      now: new Date('2026-09-17T00:00'),
    });
    // Se bloquea desde el inicio de la cita (11:00) hasta el cierre del día.
    expect(slots).toEqual([
      { start: '2026-09-21T09:00', end: '2026-09-21T10:00' },
      { start: '2026-09-21T10:00', end: '2026-09-21T11:00' },
    ]);
  });

  it('buffer_min sigue aplicando a AMBOS lados de la suma de duraciones', () => {
    const a = service({ id: 1, duration_min: 30 });
    const b = service({ id: 2, duration_min: 30 });
    // Cita existente [a, b] a las 11:00 ocupa 11:00–12:00 (suma 60min).
    const existing = appointment({ id: 1, service_ids: [1, 2], datetime: '2026-09-21T11:00' });
    const candidate = service({ id: 3, duration_min: 60 });
    const slots = generateSlots({
      date: '2026-09-21',
      candidateServices: [candidate],
      hours: [businessHours({ opens_at: '09:00', closes_at: '13:00' })],
      blocks: [],
      appointments: [existing],
      services: [a, b, candidate],
      policy: policy({ slot_step_min: 60, buffer_min: 30 }),
      now: new Date('2026-09-17T00:00'),
    });
    // El descanso extiende la suma ocupada a [10:30, 12:30); un slot 10:00-11:00
    // terminaría pegado a la cita sin descanso, así que no se ofrece.
    expect(slots).toEqual([{ start: '2026-09-21T09:00', end: '2026-09-21T10:00' }]);
  });
});
