// Recibo térmico (P5), sin React (INVARIANTE 5). Arma un `ReceiptData` NEUTRO a partir
// de una cita de SERVICIOS ya cobrada; la capa visual solo lo dibuja. El tipo no sabe de
// citas ni de servicios (renglones con nombre, nota, cantidad y precio), así otro módulo
// podría reusar la misma presentación sin mezclar lógicas (INVARIANTE 3). Todo en
// centavos enteros: el formato de moneda lo pone la presentación.

import { employeeName } from './employees';
import { appointmentBalance, paymentMethodLabel, PAYMENT_METHODS } from './payments';
import type { Appointment, AppointmentPayment, Business, Employee, MemberName, PaymentMethod, Service } from './types';
import { formatDateShort, formatTime } from '../format';

export interface ReceiptHeader {
  logo_url: string | null;
  name: string;
  address: string | null;
  phone: string | null;
}

export interface ReceiptMetaRow {
  label: string;
  value: string;
}

export interface ReceiptLine {
  name: string;
  /** Texto bajo el nombre (p. ej. "Atendió: Marta"). null = sin nota. */
  note: string | null;
  quantity: number;
  unit_price: number;
  /** quantity × unit_price, antes del descuento. */
  line_total: number;
  /** Descuento en centavos; 0 = no se imprime. */
  discount: number;
}

export interface ReceiptTotals {
  subtotal: number;
  discounts: number;
  total: number;
}

export interface ReceiptPaymentRow {
  label: string;
  amount: number;
}

export interface ReceiptData {
  header: ReceiptHeader;
  meta: ReceiptMetaRow[];
  lines: ReceiptLine[];
  totals: ReceiptTotals;
  payments: ReceiptPaymentRow[];
  /** Saldo pendiente. Siempre se imprime (0 si está pagado). */
  credit: number;
  footer: string;
}

/** Línea congelada de la cita (`appointment_service`). */
export interface ReceiptLineInput {
  service_id: number;
  /** Nulo solo en líneas que escribió la UI vieja: se lee como `charged_price`. */
  list_price: number | null;
  discount: number;
  charged_price: number;
  employee_id: number | null;
}

export interface ReceiptInput {
  business: Business;
  logoUrl: string | null;
  appointment: Appointment;
  lines: readonly ReceiptLineInput[];
  services: readonly Service[];
  employees: readonly Employee[];
  payments: readonly AppointmentPayment[];
  memberNames: readonly MemberName[];
  receipt: { number: number; issued_at: string };
}

export type ReceiptResult = { ok: true; data: ReceiptData } | { ok: false; message: string };

/** 14 → "V-000014". */
export function formatReceiptNumber(n: number): string {
  return `V-${String(n).padStart(6, '0')}`;
}

/** Instante ISO (con zona) → "08/10/2026 01:24 PM" en hora local, 12h con AM/PM. */
export function formatReceiptDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const period = d.getHours() < 12 ? 'AM' : 'PM';
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `${date} ${pad(hour12)}:${pad(d.getMinutes())} ${period}`;
}

function clean(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  return t === '' ? null : t;
}

/**
 * Hechos NEUTROS de un recibo ya emitido: lo único que hace falta para dibujarlo, venga
 * de la dueña (`buildReceiptData`) o de la página pública (`parsePublicReceipt`). Un solo
 * armador (`assembleReceipt`) para ambos garantiza que el papel impreso y el digital
 * digan exactamente lo mismo.
 */
export interface ReceiptFacts {
  business_name: string;
  address: string | null | undefined;
  phone: string | null | undefined;
  logo_url: string | null;
  number: number;
  issued_at: string;
  /** Fecha de la cita, local 'YYYY-MM-DDTHH:MM'. */
  appointment_datetime: string;
  client: string;
  /** Sin nombre (nulo o vacío): se muestra el del NEGOCIO (decisión de la dueña). */
  cashier: string | null | undefined;
  lines: readonly {
    service_name: string;
    employee_name: string | null;
    list_price: number | null;
    discount: number;
    charged_price: number;
  }[];
  /** Lo cobrado, congelado en la cita (INVARIANTE 2). Las líneas deben sumarlo. */
  charged_price: number;
  payments: readonly { method: PaymentMethod | null; amount: number }[];
}

export function assembleReceipt(f: ReceiptFacts): ReceiptResult {
  const receiptLines: ReceiptLine[] = f.lines.map((l) => {
    const unit = l.list_price ?? l.charged_price;
    return {
      name: l.service_name.toUpperCase(),
      note: l.employee_name ? `Atendió: ${l.employee_name}` : null,
      quantity: 1,
      unit_price: unit,
      line_total: unit,
      discount: l.discount,
    };
  });

  const subtotal = receiptLines.reduce((sum, l) => sum + l.line_total, 0);
  const discounts = receiptLines.reduce((sum, l) => sum + l.discount, 0);
  const total = subtotal - discounts;
  // El recibo no puede mostrar un total distinto de lo congelado en la cita.
  if (total !== f.charged_price || total !== f.lines.reduce((sum, l) => sum + l.charged_price, 0)) {
    return { ok: false, message: 'Las líneas de la cita no cuadran con lo cobrado. No se puede armar el recibo.' };
  }

  const byMethod = new Map<PaymentMethod | null, number>();
  for (const p of f.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
  const order: (PaymentMethod | null)[] = [...PAYMENT_METHODS, null];
  const payments = order
    .filter((m) => (byMethod.get(m) ?? 0) > 0)
    .map((m) => ({ label: paymentMethodLabel(m), amount: byMethod.get(m) ?? 0 }));
  const paid = f.payments.reduce((sum, p) => sum + p.amount, 0);

  return {
    ok: true,
    data: {
      header: {
        logo_url: f.logo_url,
        name: f.business_name,
        address: clean(f.address),
        phone: clean(f.phone),
      },
      meta: [
        { label: 'Recibo', value: formatReceiptNumber(f.number) },
        { label: 'Fecha', value: `${formatDateShort(f.appointment_datetime)} ${formatTimePadded(f.appointment_datetime)}` },
        { label: 'Registrada', value: formatReceiptDateTime(f.issued_at) },
        { label: 'Cajero', value: clean(f.cashier) ?? f.business_name },
        { label: 'Cliente', value: f.client },
      ],
      lines: receiptLines,
      totals: { subtotal, discounts, total },
      payments,
      credit: appointmentBalance(total, paid),
      footer: '¡Gracias por su compra!',
    },
  };
}

export function buildReceiptData(input: ReceiptInput): ReceiptResult {
  const { business, appointment, lines } = input;
  // INVARIANTE 1 e INVARIANTE 2: solo una cita cobrada de ESTE negocio tiene recibo.
  if (appointment.business_id !== business.id) return { ok: false, message: 'Esa cita no es de tu negocio.' };
  if (appointment.status !== 'COMPLETED' || appointment.charged_price === null) {
    return { ok: false, message: 'Solo las citas completadas tienen recibo.' };
  }

  // Cajero: quien cobró (`charged_by`); si no hay (cobró antes de ponerse nombre, o la
  // cita es anterior a P4), `assembleReceipt` cae al nombre del negocio.
  const member = appointment.charged_by ? input.memberNames.find((m) => m.user_id === appointment.charged_by) : undefined;
  return assembleReceipt({
    business_name: business.name,
    address: business.address,
    phone: business.phone,
    logo_url: input.logoUrl,
    number: input.receipt.number,
    issued_at: input.receipt.issued_at,
    appointment_datetime: appointment.datetime,
    client: appointment.client,
    cashier: member?.display_name,
    lines: lines.map((l) => ({
      service_name: input.services.find((s) => s.id === l.service_id)?.name ?? 'Servicio',
      employee_name: employeeName(input.employees, l.employee_id),
      list_price: l.list_price,
      discount: l.discount,
      charged_price: l.charged_price,
    })),
    charged_price: appointment.charged_price,
    payments: input.payments.filter((p) => p.business_id === business.id && p.appointment_id === appointment.id),
  });
}

// La hora de la cita ya es local ('YYYY-MM-DDTHH:MM'): se pasa a 12h con dos dígitos
// ("01:24 PM"), como la fecha registrada.
function formatTimePadded(localIso: string): string {
  return formatTime(localIso).padStart(8, '0');
}
