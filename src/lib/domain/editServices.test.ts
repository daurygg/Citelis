import { describe, it, expect } from 'vitest';
import { canEditServices, checkServicesEdit, servicesChanged, updateServicesRpcArgs } from './editServices';
import type { Appointment, AppointmentStatus, BusinessHours, Service, TimeBlock } from './types';

// 2026-10-12 es lunes (weekday 1).
const DAY = '2026-10-12';

function service(partial: Partial<Service> = {}): Service {
  return {
    id: 1,
    business_id: 1,
    name: 'Cejas',
    price: 5000,
    supply_cost: 0,
    cost_override: null,
    duration_min: 30,
    variable_price: false,
    ...partial,
  };
}

function appointment(partial: Partial<Appointment> = {}): Appointment {
  return {
    id: 10,
    business_id: 1,
    service_id: 1,
    client: 'Ana',
    datetime: `${DAY}T10:00`,
    status: 'PENDING',
    quoted_price: null,
    deposit: null,
    charged_price: null,
    actual_cost: null,
    profit: null,
    ...partial,
  };
}

const catalog: Service[] = [
  service({ id: 1, name: 'Cejas', duration_min: 30 }),
  service({ id: 2, name: 'Ondas', duration_min: 45 }),
  service({ id: 3, name: 'Pestañas', duration_min: 60 }),
  service({ id: 4, name: 'Sin duración', duration_min: 0 }),
  service({ id: 9, business_id: 2, name: 'Ajeno', duration_min: 30 }),
];

const monday9to18: BusinessHours[] = [{ id: 1, business_id: 1, weekday: 1, opens_at: '09:00', closes_at: '18:00' }];

function check(
  over: {
    appointment?: Appointment;
    serviceIds?: number[];
    appointments?: Appointment[];
    hours?: BusinessHours[];
    blocks?: TimeBlock[];
  } = {},
) {
  const apt = over.appointment ?? appointment();
  return checkServicesEdit({
    appointment: apt,
    serviceIds: over.serviceIds ?? [1, 2],
    services: catalog,
    appointments: over.appointments ?? [apt],
    hours: over.hours ?? monday9to18,
    blocks: over.blocks ?? [],
  });
}

describe('canEditServices', () => {
  it.each<[AppointmentStatus, boolean]>([
    ['REQUESTED', true],
    ['PENDING', true],
    ['IN_PROGRESS', true],
    ['COMPLETED', false],
    ['CANCELED', false],
    ['NO_SHOW', false],
    ['REJECTED', false],
  ])('%s → %s', (status, expected) => {
    expect(canEditServices(status)).toBe(expected);
  });
});

describe('checkServicesEdit: reglas de la lista', () => {
  it('acepta agregar un servicio cuando cabe, y devuelve ids y duración total', () => {
    expect(check({ serviceIds: [1, 2] })).toEqual({ ok: true, service_ids: [1, 2], duration_min: 75 });
  });

  it('acepta quitar un servicio mientras quede al menos uno', () => {
    const apt = appointment({ service_ids: [1, 2] });
    expect(check({ appointment: apt, serviceIds: [2] })).toEqual({ ok: true, service_ids: [2], duration_min: 45 });
  });

  it('rechaza una cita ya cobrada (INVARIANTE 2)', () => {
    const r = check({ appointment: appointment({ status: 'COMPLETED' }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cobrada/);
  });

  it.each<AppointmentStatus>(['CANCELED', 'NO_SHOW', 'REJECTED'])('rechaza una cita %s', (status) => {
    expect(check({ appointment: appointment({ status }) }).ok).toBe(false);
  });

  it('rechaza dejar la cita sin servicios', () => {
    const r = check({ serviceIds: [] });
    expect(r).toEqual({ ok: false, reason: 'Elige al menos un servicio.' });
  });

  it('rechaza un servicio repetido', () => {
    const r = check({ serviceIds: [1, 1] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/repetido/);
  });

  it('rechaza un servicio que no existe en el catálogo', () => {
    const r = check({ serviceIds: [1, 77] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ya no existe/);
  });

  it('rechaza un servicio de OTRO negocio (INVARIANTE 1)', () => {
    const r = check({ serviceIds: [1, 9] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ya no existe/);
  });

  it('rechaza un servicio sin duración, nombrándolo', () => {
    const r = check({ serviceIds: [1, 4] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Sin duración.*no tiene duración/);
  });
});

describe('checkServicesEdit: ¿cabe en el horario?', () => {
  it('rechaza si el tiempo extra choca con la cita siguiente, diciendo con quién', () => {
    // 10:00 + (30+45) = 11:15; Rosa empieza 11:00.
    const rosa = appointment({ id: 11, client: 'Rosa', datetime: `${DAY}T11:00` });
    const apt = appointment();
    const r = check({ appointment: apt, appointments: [apt, rosa] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Rosa.*11:00/);
  });

  it('acepta si termina justo cuando empieza la siguiente (intervalos [inicio, fin))', () => {
    // 10:00 + 75 = 11:15; la siguiente empieza 11:15.
    const rosa = appointment({ id: 11, client: 'Rosa', datetime: `${DAY}T11:15` });
    const apt = appointment();
    expect(check({ appointment: apt, appointments: [apt, rosa] }).ok).toBe(true);
  });

  it('la propia cita no cuenta como choque', () => {
    const apt = appointment();
    expect(check({ appointment: apt, appointments: [apt] }).ok).toBe(true);
  });

  it('una cita cancelada no ocupa horario', () => {
    const apt = appointment();
    const cancelada = appointment({ id: 11, datetime: `${DAY}T10:30`, status: 'CANCELED' });
    expect(check({ appointment: apt, appointments: [apt, cancelada] }).ok).toBe(true);
  });

  it('una cita ocupante de duración desconocida bloquea (fallo seguro)', () => {
    const apt = appointment();
    const rara = appointment({ id: 11, service_id: 777, datetime: `${DAY}T11:00` });
    const r = check({ appointment: apt, appointments: [apt, rara] });
    expect(r.ok).toBe(false);
  });

  it('rechaza si pasa de la hora de cierre', () => {
    // Cierra a las 18:00; 17:30 + 75 = 18:45.
    const apt = appointment({ datetime: `${DAY}T17:30` });
    const r = check({ appointment: apt });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/horario/);
  });

  it('acepta terminar justo a la hora de cierre', () => {
    // 16:45 + 75 = 18:00.
    const apt = appointment({ datetime: `${DAY}T16:45` });
    expect(check({ appointment: apt }).ok).toBe(true);
  });

  it('rechaza si el tiempo extra cae sobre un bloqueo, y lo dice distinto al cierre', () => {
    const almuerzo: TimeBlock = {
      id: 1,
      business_id: 1,
      starts_at: `${DAY}T10:45`,
      ends_at: `${DAY}T12:00`,
      reason: 'Almuerzo',
    };
    const r = check({ blocks: [almuerzo] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/bloque/i);
  });

  it('un día sin horario ese día rechaza agregar (no hay atención)', () => {
    const soloMartes: BusinessHours[] = [{ id: 2, business_id: 1, weekday: 2, opens_at: '09:00', closes_at: '18:00' }];
    const r = check({ hours: soloMartes });
    expect(r.ok).toBe(false);
  });

  it('si el negocio nunca definió horarios, el horario no limita (solo choques y bloqueos)', () => {
    const apt = appointment({ datetime: `${DAY}T20:00` });
    expect(check({ appointment: apt, hours: [] }).ok).toBe(true);
  });

  it('quitar o dejar igual la duración nunca se rechaza por horario (libera tiempo)', () => {
    // La cita ya estaba fuera de horario (la dueña la agendó así): quitar un servicio no debe bloquearse.
    const apt = appointment({ datetime: `${DAY}T20:00`, service_ids: [1, 2] });
    expect(check({ appointment: apt, serviceIds: [1] }).ok).toBe(true);
    expect(check({ appointment: apt, serviceIds: [2, 1] }).ok).toBe(true);
  });

  it('pasar de un servicio de 45 a otro de 30 también libera tiempo', () => {
    const apt = appointment({ service_id: 2, datetime: `${DAY}T20:00` });
    expect(check({ appointment: apt, serviceIds: [1] }).ok).toBe(true);
  });

  it('una cita IN_PROGRESS que ya empezó (hora pasada) también se puede ampliar si cabe', () => {
    const apt = appointment({ status: 'IN_PROGRESS', datetime: '2020-01-06T10:00' }); // lunes
    expect(check({ appointment: apt }).ok).toBe(true);
  });

  it('no ignora citas de otro negocio por accidente: solo cuenta las del mismo negocio', () => {
    const apt = appointment();
    const ajena = appointment({ id: 50, business_id: 2, client: 'Otra', datetime: `${DAY}T11:00` });
    expect(check({ appointment: apt, appointments: [apt, ajena] }).ok).toBe(true);
  });
});

describe('updateServicesRpcArgs', () => {
  it('lleva el negocio explícito (INVARIANTE 1) y copia la lista', () => {
    const ids = [3, 1];
    const args = updateServicesRpcArgs(1, 10, ids);
    expect(args).toEqual({ p_business_id: 1, p_appointment_id: 10, p_service_ids: [3, 1] });
    expect(args.p_service_ids).not.toBe(ids);
  });
});

describe('servicesChanged', () => {
  it('igual lista y mismo orden → sin cambios', () => {
    expect(servicesChanged([1, 2], [1, 2])).toBe(false);
  });
  it('agregar o quitar → cambió', () => {
    expect(servicesChanged([1], [1, 2])).toBe(true);
    expect(servicesChanged([1, 2], [2])).toBe(true);
  });
  it('el orden cambia el servicio principal → cambió', () => {
    expect(servicesChanged([1, 2], [2, 1])).toBe(true);
  });
});
