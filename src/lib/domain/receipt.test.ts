import { describe, it, expect } from 'vitest';
import { buildReceiptData, formatReceiptNumber, formatReceiptDateTime, type ReceiptInput } from './receipt';
import type { Appointment, AppointmentPayment, Business, Employee, MemberName, Service } from './types';

const business: Business = { id: 1, name: 'Studio Ana', plan: 'free', address: 'Calle 1 #23', phone: '809-555-0101' };
const services: Service[] = [
  { id: 10, business_id: 1, name: 'Cejas', price: 40000, supply_cost: 0, cost_override: null, duration_min: 30, variable_price: false },
  { id: 11, business_id: 1, name: 'Uñas', price: 20000, supply_cost: 0, cost_override: null, duration_min: 30, variable_price: false },
];
const employees: Employee[] = [{ id: 5, business_id: 1, name: 'Marta', active: false }];
const members: MemberName[] = [{ user_id: 'u1', display_name: 'Ana' }];

const appointment: Appointment = {
  id: 100, business_id: 1, service_id: 10, client: 'Clienta Uno',
  datetime: '2026-10-07T13:24', status: 'COMPLETED',
  quoted_price: null, deposit: null, charged_price: 50000, actual_cost: 0, profit: 0,
  charged_by: 'u1',
};
const pay = (id: number, amount: number, method: AppointmentPayment['method']): AppointmentPayment => ({
  id, business_id: 1, appointment_id: 100, amount, method, kind: 'charge', paid_at: '2026-10-07T18:00:00Z',
});

function input(over: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    business, logoUrl: 'https://x/logo.png', appointment,
    lines: [
      { service_id: 10, list_price: 40000, discount: 10000, charged_price: 30000, employee_id: 5 },
      { service_id: 11, list_price: 20000, discount: 0, charged_price: 20000, employee_id: null },
    ],
    services, employees, payments: [pay(1, 30000, 'cash'), pay(2, 10000, 'cash'), pay(3, 5000, 'transfer')],
    memberNames: members,
    receipt: { number: 14, issued_at: new Date(2026, 9, 8, 13, 24).toISOString() },
    ...over,
  };
}

function build(over: Partial<ReceiptInput> = {}) {
  const r = buildReceiptData(input(over));
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

describe('formatReceiptNumber', () => {
  it('V- y 6 dígitos con ceros', () => {
    expect(formatReceiptNumber(14)).toBe('V-000014');
    expect(formatReceiptNumber(1)).toBe('V-000001');
    expect(formatReceiptNumber(1234567)).toBe('V-1234567');
  });
});

describe('formatReceiptDateTime', () => {
  it('dd/mm/aaaa y hora de 12h con AM/PM', () => {
    expect(formatReceiptDateTime(new Date(2026, 9, 8, 13, 24).toISOString())).toBe('08/10/2026 01:24 PM');
    expect(formatReceiptDateTime(new Date(2026, 9, 8, 0, 5).toISOString())).toBe('08/10/2026 12:05 AM');
  });
});

describe('buildReceiptData', () => {
  it('encabezado con logo, nombre, dirección y teléfono; omite lo que falta', () => {
    expect(build().header).toEqual({ logo_url: 'https://x/logo.png', name: 'Studio Ana', address: 'Calle 1 #23', phone: '809-555-0101' });
    const bare = build({ logoUrl: null, business: { ...business, address: null, phone: '  ' } }).header;
    expect(bare).toEqual({ logo_url: null, name: 'Studio Ana', address: null, phone: null });
  });

  it('filas de datos: recibo, fecha de la cita, registrada, cajero y cliente', () => {
    expect(build().meta).toEqual([
      { label: 'Recibo', value: 'V-000014' },
      { label: 'Fecha', value: '07/10/2026 01:24 PM' },
      { label: 'Registrada', value: '08/10/2026 01:24 PM' },
      { label: 'Cajero', value: 'Ana' },
      { label: 'Cliente', value: 'Clienta Uno' },
    ]);
  });

  it('cajero: sin nombre visible o sin charged_by, el nombre del negocio', () => {
    const cashier = (a: Partial<Appointment>, m: MemberName[] = members) =>
      build({ appointment: { ...appointment, ...a }, memberNames: m }).meta.find((r) => r.label === 'Cajero')?.value;
    expect(cashier({ charged_by: null })).toBe('Studio Ana');
    expect(cashier({ charged_by: undefined })).toBe('Studio Ana');
    expect(cashier({}, [{ user_id: 'u1', display_name: null }])).toBe('Studio Ana');
    expect(cashier({}, [{ user_id: 'u1', display_name: '  ' }])).toBe('Studio Ana');
    expect(cashier({ charged_by: 'otra' })).toBe('Studio Ana');
  });

  it('líneas: nombre en mayúsculas, nota con la empleada, 1 x lista y descuento solo si hay', () => {
    const [a, b] = build().lines;
    expect(a).toEqual({ name: 'CEJAS', note: 'Atendió: Marta', quantity: 1, unit_price: 40000, line_total: 40000, discount: 10000 });
    expect(b).toEqual({ name: 'UÑAS', note: null, quantity: 1, unit_price: 20000, line_total: 20000, discount: 0 });
  });

  it('línea vieja sin list_price: usa charged_price como lista', () => {
    const data = build({
      appointment: { ...appointment, charged_price: 20000 },
      lines: [{ service_id: 11, list_price: null, discount: 0, charged_price: 20000, employee_id: null }],
      payments: [pay(1, 20000, 'card')],
    });
    expect(data.lines[0].unit_price).toBe(20000);
    expect(data.totals).toEqual({ subtotal: 20000, discounts: 0, total: 20000 });
  });

  it('totales: subtotal = Σ lista, descuentos = Σ descuento, total = Σ neto', () => {
    expect(build().totals).toEqual({ subtotal: 60000, discounts: 10000, total: 50000 });
  });

  it('pagos sumados por vía, en orden fijo, y "Sin vía registrada" para los históricos', () => {
    const data = build({ payments: [pay(1, 3000, 'transfer'), pay(2, 1000, null), pay(3, 20000, 'cash'), pay(4, 5000, 'cash')] });
    expect(data.payments).toEqual([
      { label: 'Efectivo', amount: 25000 },
      { label: 'Transferencia', amount: 3000 },
      { label: 'Sin vía registrada', amount: 1000 },
    ]);
  });

  it('crédito = saldo pendiente; 0 cuando está pagado', () => {
    expect(build().credit).toBe(5000); // 50000 - 45000
    expect(build({ payments: [pay(1, 50000, 'cash')] }).credit).toBe(0);
  });

  it('ignora pagos de otra cita u otro negocio (INVARIANTE 1)', () => {
    const foreign = { ...pay(9, 99999, 'cash'), business_id: 2 };
    const other = { ...pay(8, 99999, 'cash'), appointment_id: 101 };
    expect(build({ payments: [pay(1, 50000, 'cash'), foreign, other] }).payments).toEqual([{ label: 'Efectivo', amount: 50000 }]);
  });

  it('guarda: si Σ neto no es lo cobrado de la cita, no arma el recibo', () => {
    const r = buildReceiptData(input({ appointment: { ...appointment, charged_price: 49999 } }));
    expect(r.ok).toBe(false);
  });

  it('no es de este negocio o no está cobrada: no arma el recibo', () => {
    expect(buildReceiptData(input({ appointment: { ...appointment, business_id: 2 } })).ok).toBe(false);
    expect(buildReceiptData(input({ appointment: { ...appointment, status: 'PENDING', charged_price: null } })).ok).toBe(false);
  });

  it('pie con el agradecimiento', () => {
    expect(build().footer).toBe('¡Gracias por su compra!');
  });
});
