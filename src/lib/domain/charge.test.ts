import { describe, it, expect } from 'vitest';
import {
  appointmentServices,
  buildChargeForm,
  completeRpcArgs,
  initialChargeTexts,
  planCompletion,
} from './charge';
import type { Appointment, Employee, Service } from './types';

function service(partial: Partial<Service> = {}): Service {
  return {
    id: 1,
    business_id: 1,
    name: 'Cejas',
    price: 5000,
    supply_cost: 1000,
    cost_override: null,
    duration_min: 60,
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
    datetime: '2026-06-29T10:00:00.000Z',
    status: 'PENDING',
    quoted_price: null,
    deposit: null,
    charged_price: null,
    actual_cost: null,
    profit: null,
    ...partial,
  };
}

const cejas = service({ id: 1, name: 'Cejas', price: 5000, supply_cost: 1000 });
const ondas = service({ id: 2, name: 'Ondas', price: 4000, supply_cost: 500 });
const trenzas = service({ id: 3, name: 'Trenzas', price: 0, supply_cost: 300, variable_price: true });
const peinado = service({ id: 4, name: 'Peinado', price: 0, supply_cost: 200, variable_price: true });
const catalog = [cejas, ondas, trenzas, peinado];

describe('appointmentServices', () => {
  it('devuelve los servicios de la cita en el orden de la cita', () => {
    const apt = appointment({ service_id: 2, service_ids: [2, 1] });
    expect(appointmentServices(apt, catalog)?.map((s) => s.id)).toEqual([2, 1]);
  });

  it('una cita sin service_ids cae a su servicio único', () => {
    expect(appointmentServices(appointment({ service_id: 2 }), catalog)?.map((s) => s.id)).toEqual([2]);
  });

  it('devuelve null si falta alguno en el catálogo (no se cobra a medias)', () => {
    expect(appointmentServices(appointment({ service_ids: [1, 99] }), catalog)).toBeNull();
  });
});

describe('buildChargeForm', () => {
  it('servicios fijos: listo sin escribir nada, sin precios que pedir', () => {
    const form = buildChargeForm([cejas, ondas], { prices: {}, total: '' });
    expect(form.ready).toBe(true);
    expect(form.variableServices).toEqual([]);
    expect(form.overridePrice).toBeUndefined();
    expect(form.priceOverrides.size).toBe(0);
    expect(form.showTotalField).toBe(true);
  });

  it('pide UN precio por cada servicio variable y no está listo hasta tenerlos todos', () => {
    const form = buildChargeForm([trenzas, peinado], { prices: { 3: '800' }, total: '' });
    expect(form.variableServices.map((s) => s.id)).toEqual([3, 4]);
    expect(form.ready).toBe(false);
    const ok = buildChargeForm([trenzas, peinado], { prices: { 3: '800', 4: '300' }, total: '' });
    expect(ok.ready).toBe(true);
    expect(ok.priceOverrides.get(3)).toBe(80000);
    expect(ok.priceOverrides.get(4)).toBe(30000);
  });

  it('un precio en cero o ilegible no cuenta como precio', () => {
    expect(buildChargeForm([trenzas], { prices: { 3: '0' }, total: '' }).ready).toBe(false);
    expect(buildChargeForm([trenzas], { prices: { 3: 'abc' }, total: '' }).ready).toBe(false);
  });

  it('mezcla: el fijo no pide precio, el variable sí; el total opcional es aparte', () => {
    const form = buildChargeForm([cejas, trenzas], { prices: { 3: '800' }, total: '10000' });
    expect(form.variableServices.map((s) => s.id)).toEqual([3]);
    expect(form.ready).toBe(true);
    expect(form.overridePrice).toBe(1000000);
    expect(form.priceOverrides.has(1)).toBe(false);
  });

  it('un solo servicio variable: su precio ES el precio cobrado y no hay campo de total', () => {
    const form = buildChargeForm([trenzas], { prices: { 3: '900' }, total: '' });
    expect(form.showTotalField).toBe(false);
    // Gana lo que la dueña escribió sobre el precio acordado al agendar.
    expect(form.overridePrice).toBe(90000);
    expect(form.ready).toBe(true);
  });

  it('un solo servicio fijo: el total opcional es el "otro precio"', () => {
    const form = buildChargeForm([cejas], { prices: {}, total: '4500' });
    expect(form.showTotalField).toBe(true);
    expect(form.overridePrice).toBe(450000);
  });

  it('un total ilegible se ignora (como antes)', () => {
    expect(buildChargeForm([cejas, ondas], { prices: {}, total: 'xx' }).overridePrice).toBeUndefined();
  });
});

describe('initialChargeTexts', () => {
  it('un solo servicio variable con precio acordado: se precarga en SU campo', () => {
    const apt = appointment({ service_id: 3, quoted_price: 50000 });
    expect(initialChargeTexts(apt, [trenzas])).toEqual({ prices: { 3: '500' }, total: '' });
  });

  it('varios servicios con precio acordado: se precarga en el total', () => {
    const apt = appointment({ service_ids: [1, 2], quoted_price: 800000 });
    expect(initialChargeTexts(apt, [cejas, ondas])).toEqual({ prices: {}, total: '8000' });
  });

  it('sin precio acordado todo queda vacío', () => {
    expect(initialChargeTexts(appointment({ service_ids: [1, 2] }), [cejas, ondas])).toEqual({ prices: {}, total: '' });
  });
});

describe('planCompletion', () => {
  it('congela la cita y devuelve las líneas que suman exacto', () => {
    const apt = appointment({ service_ids: [1, 2] });
    const plan = planCompletion(apt, catalog, {});
    expect(plan.completed).toMatchObject({ status: 'COMPLETED', charged_price: 9000, actual_cost: 1500, profit: 7500 });
    expect(plan.lines).toEqual([
      { service_id: 1, charged_price: 5000, actual_cost: 1000, profit: 4000 },
      { service_id: 2, charged_price: 4000, actual_cost: 500, profit: 3500 },
    ]);
  });

  it('con total pactado reparte a prorrata del precio de lista (combo)', () => {
    const apt = appointment({ service_ids: [1, 2] });
    const plan = planCompletion(apt, catalog, { overridePrice: 8000 });
    expect(plan.lines.map((l) => l.charged_price)).toEqual([4444, 3556]);
    expect(plan.lines.reduce((s, l) => s + l.profit, 0)).toBe(plan.completed.profit);
  });

  it('usa el precio puesto a cada servicio variable', () => {
    const apt = appointment({ service_ids: [1, 3] });
    const plan = planCompletion(apt, catalog, { priceOverrides: new Map([[3, 2000]]) });
    expect(plan.completed.charged_price).toBe(7000);
    expect(plan.lines.find((l) => l.service_id === 3)?.charged_price).toBe(2000);
  });

  it('lanza si falta un servicio del catálogo', () => {
    expect(() => planCompletion(appointment({ service_ids: [1, 99] }), catalog, {})).toThrow();
  });

  it('lanza si la cita no se puede completar (ya COMPLETED)', () => {
    expect(() => planCompletion(appointment({ status: 'COMPLETED' }), catalog, {})).toThrow();
  });

  it('lanza si hay varios servicios y uno variable sin precio propio', () => {
    const apt = appointment({ service_ids: [1, 3] });
    expect(() => planCompletion(apt, catalog, { overridePrice: 9000 })).toThrow();
  });
});

describe('completeRpcArgs', () => {
  it('arma exactamente lo que la RPC espera, con el negocio explícito', () => {
    const apt = appointment({ service_ids: [1, 2] });
    const plan = planCompletion(apt, catalog, {});
    expect(completeRpcArgs(1, plan)).toEqual({
      p_business_id: 1,
      p_appointment_id: 10,
      p_charged_price: 9000,
      p_actual_cost: 1500,
      p_profit: 7500,
      p_lines: plan.lines,
    });
  });
});

describe('empleada por servicio (opcional)', () => {
  const marta: Employee = { id: 7, business_id: 1, name: 'Marta', active: true };
  const baja: Employee = { id: 8, business_id: 1, name: 'Baja', active: false };

  it('sin elegir a nadie no se inventa ninguna', () => {
    const form = buildChargeForm([cejas, ondas], { prices: {}, total: '' }, [marta]);
    expect(form.employeeIds.size).toBe(0);
    expect(form.ready).toBe(true);
  });

  it('guarda la empleada elegida por servicio', () => {
    const form = buildChargeForm([cejas, ondas], { prices: {}, total: '', employees: { 1: 7, 2: null } }, [marta]);
    expect([...form.employeeIds]).toEqual([[1, 7]]);
  });

  it('descarta una empleada dada de baja, desconocida o de un servicio que no es de la cita', () => {
    const form = buildChargeForm([cejas], { prices: {}, total: '', employees: { 1: 8, 2: 7 } }, [marta, baja]);
    expect(form.employeeIds.size).toBe(0);
    expect(buildChargeForm([cejas], { prices: {}, total: '', employees: { 1: 99 } }, [marta]).employeeIds.size).toBe(0);
  });

  it('planCompletion y la RPC llevan employee_id solo donde se eligió', () => {
    const plan = planCompletion(appointment({ service_ids: [1, 2] }), catalog, { employeeIds: new Map([[2, 7]]) });
    expect(plan.lines.find((l) => l.service_id === 1)).not.toHaveProperty('employee_id');
    expect(plan.lines.find((l) => l.service_id === 2)?.employee_id).toBe(7);
    const args = completeRpcArgs(1, plan);
    expect(args.p_lines.map((l) => l.employee_id ?? null)).toEqual([null, 7]);
  });
});
