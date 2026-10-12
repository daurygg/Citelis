import { describe, it, expect } from 'vitest';
import { buildReceiptData, type ReceiptInput } from './receipt';
import { isReceiptToken, parsePublicReceipt, receiptUrl } from './publicReceipt';
import type { Appointment, AppointmentPayment, Business, Employee, MemberName, Service } from './types';

const issuedAt = new Date(2026, 9, 8, 13, 24).toISOString();

// Lo que devuelve la RPC `public_receipt` (mismos datos que el caso del recibo de la dueña).
const payload = {
  business: { name: 'Studio Ana', address: 'Calle 1 #23', phone: '809-555-0101', logo_path: '1/logo.png' },
  receipt: { number: 14, issued_at: issuedAt },
  appointment: { datetime: '2026-10-07T13:24', client: 'Clienta Uno' },
  cashier: 'Ana',
  lines: [
    { service_name: 'Cejas', employee_name: 'Marta', list_price: 40000, discount: 10000, charged_price: 30000 },
    { service_name: 'Uñas', employee_name: null, list_price: 20000, discount: 0, charged_price: 20000 },
  ],
  total: 50000,
  payments: [
    { method: 'cash', amount: 40000 },
    { method: 'transfer', amount: 5000 },
  ],
  credit: 5000,
};

const logoUrl = (path: string) => `https://cdn/${path}`;

describe('parsePublicReceipt', () => {
  it('arma el mismo ReceiptData que el recibo de la dueña', () => {
    const business: Business = { id: 1, name: 'Studio Ana', plan: 'free', address: 'Calle 1 #23', phone: '809-555-0101' };
    const services: Service[] = [
      { id: 10, business_id: 1, name: 'Cejas', price: 40000, supply_cost: 0, cost_override: null, duration_min: 30, variable_price: false },
      { id: 11, business_id: 1, name: 'Uñas', price: 20000, supply_cost: 0, cost_override: null, duration_min: 30, variable_price: false },
    ];
    const employees: Employee[] = [{ id: 5, business_id: 1, name: 'Marta', active: true }];
    const members: MemberName[] = [{ user_id: 'u1', display_name: 'Ana' }];
    const appointment: Appointment = {
      id: 100, business_id: 1, service_id: 10, client: 'Clienta Uno', datetime: '2026-10-07T13:24', status: 'COMPLETED',
      quoted_price: null, deposit: null, charged_price: 50000, actual_cost: 0, profit: 0, charged_by: 'u1',
    };
    const pay = (id: number, amount: number, method: AppointmentPayment['method']): AppointmentPayment => ({
      id, business_id: 1, appointment_id: 100, amount, method, kind: 'charge', paid_at: issuedAt,
    });
    const owner: ReceiptInput = {
      business, logoUrl: 'https://cdn/1/logo.png', appointment,
      lines: [
        { service_id: 10, list_price: 40000, discount: 10000, charged_price: 30000, employee_id: 5 },
        { service_id: 11, list_price: 20000, discount: 0, charged_price: 20000, employee_id: null },
      ],
      services, employees, payments: [pay(1, 30000, 'cash'), pay(2, 10000, 'cash'), pay(3, 5000, 'transfer')],
      memberNames: members, receipt: { number: 14, issued_at: issuedAt },
    };
    const expected = buildReceiptData(owner);
    expect(parsePublicReceipt(payload, logoUrl)).toEqual(expected);
  });

  it('sin cajero usa el nombre del negocio', () => {
    const r = parsePublicReceipt({ ...payload, cashier: null }, logoUrl);
    expect(r.ok && r.data.meta.find((m) => m.label === 'Cajero')?.value).toBe('Studio Ana');
  });

  it('sin logo ni dirección ni teléfono omite esos campos', () => {
    const r = parsePublicReceipt({ ...payload, business: { name: 'Studio Ana', address: null, phone: '  ', logo_path: null } }, logoUrl);
    expect(r.ok && r.data.header).toEqual({ logo_url: null, name: 'Studio Ana', address: null, phone: null });
  });

  it('abono sin vía (histórico) se agrupa como "Sin vía registrada" y el crédito es el saldo', () => {
    const r = parsePublicReceipt({ ...payload, payments: [{ method: null, amount: 20000 }] }, logoUrl);
    expect(r.ok && r.data.payments).toEqual([{ label: 'Sin vía registrada', amount: 20000 }]);
    expect(r.ok && r.data.credit).toBe(30000);
  });

  it('pagado completo: crédito 0', () => {
    const r = parsePublicReceipt({ ...payload, payments: [{ method: 'card', amount: 50000 }] }, logoUrl);
    expect(r.ok && r.data.credit).toBe(0);
  });

  it('línea sin precio de lista se lee como lo cobrado', () => {
    const r = parsePublicReceipt(
      { ...payload, lines: [{ service_name: 'Cejas', employee_name: null, list_price: null, discount: 0, charged_price: 50000 }] },
      logoUrl,
    );
    expect(r.ok && r.data.lines[0].unit_price).toBe(50000);
  });

  it('rechaza un total que no cuadra con las líneas', () => {
    expect(parsePublicReceipt({ ...payload, total: 1 }, logoUrl).ok).toBe(false);
  });

  it('rechaza JSON mal formado', () => {
    expect(parsePublicReceipt({ nope: true }, logoUrl).ok).toBe(false);
    expect(parsePublicReceipt(null, logoUrl).ok).toBe(false);
  });
});

describe('isReceiptToken / receiptUrl', () => {
  it('solo acepta la forma de un uuid', () => {
    expect(isReceiptToken('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isReceiptToken('123e4567')).toBe(false);
    expect(isReceiptToken('zzze4567-e89b-12d3-a456-426614174000')).toBe(false);
  });
  it('arma el enlace público', () => {
    expect(receiptUrl('https://citelis.app', 'abc')).toBe('https://citelis.app/recibo/abc');
  });
});
