// Descuentos por línea (P2 de odd/tasks/payments-and-receipt.md). Funciones puras,
// CERO dependencias de React (INVARIANTE 5). Todo en centavos enteros.
//
// Un descuento se aplica a UN servicio de la cita y puede ser un monto fijo o un
// porcentaje entero (0–100). Aquí solo se convierte a centavos y se valida; de dónde
// sale el precio de lista de cada línea lo decide `appointments.ts`.

import { parseMoneyToCents } from '../format';

/** Lo que la dueña pidió descontarle a un servicio. */
export type LineDiscount =
  | { kind: 'amount'; cents: number }
  | { kind: 'percent'; percent: number };

/** Cómo teclea la dueña el descuento: monto (RD$) o porcentaje (%). */
export type DiscountMode = 'amount' | 'percent';

/** Lo que la dueña tecleó para el descuento de UNA línea (texto crudo). */
export interface DiscountText {
  mode: DiscountMode;
  value: string;
}

/**
 * Descuento en centavos sobre un precio de lista. Porcentaje: redondeo half-up al
 * centavo (con enteros, sin coma flotante). Nunca negativo y nunca más que el
 * precio de la línea: una línea no puede quedar en negativo.
 */
export function discountCents(listPrice: number, discount: LineDiscount): number {
  const list = Math.max(0, listPrice);
  const raw =
    discount.kind === 'amount'
      ? discount.cents
      : Math.floor((list * Math.min(100, Math.max(0, discount.percent)) * 2 + 100) / 200);
  return Math.min(list, Math.max(0, raw));
}

/**
 * Por qué un descuento no es válido para ese precio de lista, o null si lo es.
 * `discountCents` recorta; esto avisa, para que la dueña corrija en vez de que el
 * sistema cobre otra cosa que la que ella escribió.
 */
export function discountError(listPrice: number, discount: LineDiscount): string | null {
  if (discount.kind === 'percent') {
    if (!Number.isInteger(discount.percent) || discount.percent < 0 || discount.percent > 100) {
      return 'El porcentaje tiene que estar entre 0 y 100.';
    }
    return null;
  }
  if (!Number.isInteger(discount.cents) || discount.cents < 0) return 'El descuento no es válido.';
  if (discount.cents > listPrice) return 'El descuento no puede ser mayor que el precio.';
  return null;
}

/**
 * Lee lo tecleado. Vacío o cero = sin descuento (`discount: null`). Algo que no se
 * entiende (letras, porcentaje con decimales o mayor que 100) = `invalid`, y el
 * cobro no se habilita hasta corregirlo. Porcentaje entero: lo que la dueña piensa
 * en "10 %" o "15 %"; con decimales se mezclaría con el monto.
 */
export function parseDiscountText(text: DiscountText | undefined): { discount: LineDiscount | null; invalid: boolean } {
  const raw = (text?.value ?? '').trim();
  if (raw === '') return { discount: null, invalid: false };
  if (text!.mode === 'percent') {
    if (!/^\d+$/.test(raw)) return { discount: null, invalid: true };
    const percent = Number(raw);
    if (percent > 100) return { discount: null, invalid: true };
    return percent === 0 ? { discount: null, invalid: false } : { discount: { kind: 'percent', percent }, invalid: false };
  }
  const cents = parseMoneyToCents(raw);
  if (cents === null || !/^[\d.,\s$]+$/.test(raw)) return { discount: null, invalid: true };
  return cents === 0 ? { discount: null, invalid: false } : { discount: { kind: 'amount', cents }, invalid: false };
}

/** Una línea del cobro con su desglose: lista, descuento y neto. */
export interface PricedLine {
  list_price: number;
  discount: number;
  charged_price: number;
}

/** Subtotal (lista), descuentos y total (neto) de un cobro. Lo que lleva el recibo. */
export interface ChargeTotals {
  gross: number;
  discounts: number;
  net: number;
}

export function chargeTotals(lines: readonly PricedLine[]): ChargeTotals {
  const gross = lines.reduce((sum, l) => sum + l.list_price, 0);
  const discounts = lines.reduce((sum, l) => sum + l.discount, 0);
  return { gross, discounts, net: gross - discounts };
}
