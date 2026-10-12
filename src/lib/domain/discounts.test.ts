import { describe, it, expect } from 'vitest';
import { chargeTotals, discountCents, discountError, parseDiscountText } from './discounts';

describe('discountCents', () => {
  it('un monto se descuenta tal cual', () => {
    expect(discountCents(5000, { kind: 'amount', cents: 500 })).toBe(500);
  });

  it('un porcentaje se convierte a centavos', () => {
    expect(discountCents(5000, { kind: 'percent', percent: 10 })).toBe(500);
    expect(discountCents(5000, { kind: 'percent', percent: 100 })).toBe(5000);
    expect(discountCents(5000, { kind: 'percent', percent: 0 })).toBe(0);
  });

  it('el porcentaje redondea half-up al centavo', () => {
    // 5 % de 1010 = 50,5 → 51 (half-up, no half-even ni truncado).
    expect(discountCents(1010, { kind: 'percent', percent: 5 })).toBe(51);
    // 5 % de 1009 = 50,45 → 50.
    expect(discountCents(1009, { kind: 'percent', percent: 5 })).toBe(50);
    // 33 % de 100 = 33 exacto, y de 1 centavo = 0,33 → 0.
    expect(discountCents(100, { kind: 'percent', percent: 33 })).toBe(33);
    expect(discountCents(1, { kind: 'percent', percent: 50 })).toBe(1);
    expect(discountCents(1, { kind: 'percent', percent: 49 })).toBe(0);
  });

  it('nunca es negativo ni mayor que el precio de la línea', () => {
    expect(discountCents(5000, { kind: 'amount', cents: 9000 })).toBe(5000);
    expect(discountCents(5000, { kind: 'amount', cents: -100 })).toBe(0);
    expect(discountCents(5000, { kind: 'percent', percent: 150 })).toBe(5000);
    expect(discountCents(0, { kind: 'percent', percent: 20 })).toBe(0);
  });

  it('siempre devuelve centavos enteros', () => {
    for (const list of [1, 7, 333, 1999, 123457]) {
      for (const percent of [1, 7, 12, 33, 99]) {
        expect(Number.isInteger(discountCents(list, { kind: 'percent', percent }))).toBe(true);
      }
    }
  });
});

describe('discountError', () => {
  it('rechaza un monto mayor que el precio de la línea', () => {
    expect(discountError(5000, { kind: 'amount', cents: 5001 })).toBe('El descuento no puede ser mayor que el precio.');
  });

  it('acepta hasta el precio entero y el porcentaje de 0 a 100', () => {
    expect(discountError(5000, { kind: 'amount', cents: 5000 })).toBeNull();
    expect(discountError(5000, { kind: 'percent', percent: 100 })).toBeNull();
  });

  it('rechaza porcentajes fuera de rango o con decimales y montos negativos', () => {
    expect(discountError(5000, { kind: 'percent', percent: 101 })).not.toBeNull();
    expect(discountError(5000, { kind: 'percent', percent: -1 })).not.toBeNull();
    expect(discountError(5000, { kind: 'percent', percent: 12.5 })).not.toBeNull();
    expect(discountError(5000, { kind: 'amount', cents: -1 })).not.toBeNull();
  });
});

describe('parseDiscountText', () => {
  it('vacío o cero es sin descuento y no es un error', () => {
    expect(parseDiscountText(undefined)).toEqual({ discount: null, invalid: false });
    expect(parseDiscountText({ mode: 'amount', value: '  ' })).toEqual({ discount: null, invalid: false });
    expect(parseDiscountText({ mode: 'amount', value: '0' })).toEqual({ discount: null, invalid: false });
    expect(parseDiscountText({ mode: 'percent', value: '0' })).toEqual({ discount: null, invalid: false });
  });

  it('un monto en pesos pasa a centavos', () => {
    expect(parseDiscountText({ mode: 'amount', value: '5' })).toEqual({ discount: { kind: 'amount', cents: 500 }, invalid: false });
    expect(parseDiscountText({ mode: 'amount', value: '12.50' })).toEqual({ discount: { kind: 'amount', cents: 1250 }, invalid: false });
  });

  it('un porcentaje es entero de 1 a 100', () => {
    expect(parseDiscountText({ mode: 'percent', value: '15' })).toEqual({ discount: { kind: 'percent', percent: 15 }, invalid: false });
    expect(parseDiscountText({ mode: 'percent', value: '101' }).invalid).toBe(true);
    expect(parseDiscountText({ mode: 'percent', value: '12.5' }).invalid).toBe(true);
  });

  it('lo que no se entiende (letras, negativo) es inválido, no cero', () => {
    expect(parseDiscountText({ mode: 'amount', value: 'abc' }).invalid).toBe(true);
    expect(parseDiscountText({ mode: 'amount', value: '-5' }).invalid).toBe(true);
    expect(parseDiscountText({ mode: 'percent', value: 'diez' }).invalid).toBe(true);
  });
});

describe('chargeTotals', () => {
  it('subtotal, descuentos y total salen de las líneas', () => {
    const totals = chargeTotals([
      { list_price: 5000, discount: 500, charged_price: 4500 },
      { list_price: 4000, discount: 0, charged_price: 4000 },
    ]);
    expect(totals).toEqual({ gross: 9000, discounts: 500, net: 8500 });
  });

  it('sin líneas todo es cero', () => {
    expect(chargeTotals([])).toEqual({ gross: 0, discounts: 0, net: 0 });
  });
});
