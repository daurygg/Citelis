// Recibo digital público (P6), sin React (INVARIANTE 5). Convierte lo que devuelve la
// RPC `public_receipt` en el MISMO `ReceiptData` que arma la dueña, pasando por el mismo
// armador (`assembleReceipt`): el papel y la página digital no pueden diferir.
// El JSON viene de la red, así que se valida su forma en vez de confiar en ella.

import { assembleReceipt, type ReceiptResult } from './receipt';
import type { PaymentMethod } from './types';

const UNREADABLE: ReceiptResult = { ok: false, message: 'No pudimos leer este recibo.' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Tiene forma de uuid? Se valida antes de llamar al servidor. */
export function isReceiptToken(value: string): boolean {
  return UUID.test(value);
}

/** Enlace público que va en el QR. */
export function receiptUrl(origin: string, token: string): string {
  return `${origin}/recibo/${token}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);
const METHODS: readonly unknown[] = ['cash', 'transfer', 'card'];

export function parsePublicReceipt(json: unknown, logoUrl: (path: string) => string): ReceiptResult {
  if (!isObj(json) || !isObj(json.business) || !isObj(json.receipt) || !isObj(json.appointment)) return UNREADABLE;
  const { business, receipt, appointment } = json;
  const name = str(business.name);
  const number = int(receipt.number);
  const issuedAt = str(receipt.issued_at);
  const datetime = str(appointment.datetime);
  const client = str(appointment.client);
  const total = int(json.total);
  if (name === null || number === null || issuedAt === null || datetime === null || client === null || total === null) {
    return UNREADABLE;
  }
  if (!Array.isArray(json.lines) || !Array.isArray(json.payments)) return UNREADABLE;

  const lines = [];
  for (const l of json.lines) {
    if (!isObj(l)) return UNREADABLE;
    const service_name = str(l.service_name);
    const discount = int(l.discount);
    const charged_price = int(l.charged_price);
    if (service_name === null || discount === null || charged_price === null) return UNREADABLE;
    lines.push({ service_name, employee_name: str(l.employee_name), list_price: int(l.list_price), discount, charged_price });
  }

  const payments = [];
  for (const p of json.payments) {
    if (!isObj(p)) return UNREADABLE;
    const amount = int(p.amount);
    if (amount === null || (p.method !== null && !METHODS.includes(p.method))) return UNREADABLE;
    payments.push({ method: p.method as PaymentMethod | null, amount });
  }

  const logoPath = str(business.logo_path);
  return assembleReceipt({
    business_name: name,
    address: str(business.address),
    phone: str(business.phone),
    logo_url: logoPath ? logoUrl(logoPath) : null,
    number,
    issued_at: issuedAt,
    appointment_datetime: datetime,
    client,
    cashier: str(json.cashier),
    lines,
    charged_price: total,
    payments,
  });
}
