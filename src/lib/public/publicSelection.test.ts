import { describe, expect, it } from 'vitest';
import { estimateLabel, servicePriceLabel, summarizePublicSelection } from './publicSelection';
import type { PublicBusinessService } from './publicBooking';

const eyebrows: PublicBusinessService = {
  service_id: 1, service_name: 'Cejas', price: 150000, variable_price: false, duration_min: 30,
};
const nails: PublicBusinessService = {
  service_id: 2, service_name: 'Uñas', price: 80000, variable_price: false, duration_min: 45,
};
const braids: PublicBusinessService = {
  service_id: 3, service_name: 'Trenzas', price: null, variable_price: true, duration_min: 120,
};
const catalog = [eyebrows, nails, braids];

describe('summarizePublicSelection', () => {
  it('sin selección no está lista', () => {
    const s = summarizePublicSelection(catalog, []);
    expect(s).toMatchObject({ service_ids: [], duration_min: 0, fixed_total: 0, has_variable: false, ready: false });
  });

  it('suma duración y precios fijos, en el orden elegido', () => {
    const s = summarizePublicSelection(catalog, [2, 1]);
    expect(s.service_ids).toEqual([2, 1]);
    expect(s.duration_min).toBe(75);
    expect(s.fixed_total).toBe(230000);
    expect(s.has_variable).toBe(false);
    expect(s.ready).toBe(true);
  });

  it('un servicio variable no cuenta como cero: marca has_variable', () => {
    const s = summarizePublicSelection(catalog, [1, 3]);
    expect(s.fixed_total).toBe(150000);
    expect(s.has_variable).toBe(true);
    expect(s.duration_min).toBe(150);
  });

  it('descarta ids que ya no están en el catálogo y repetidos', () => {
    const s = summarizePublicSelection(catalog, [1, 99, 1]);
    expect(s.service_ids).toEqual([1]);
  });
});

describe('servicePriceLabel', () => {
  it('fijo: dinero; variable: "A convenir"', () => {
    expect(servicePriceLabel(eyebrows)).toBe('$1,500.00');
    expect(servicePriceLabel(braids)).toBe('A convenir');
  });
});

describe('estimateLabel', () => {
  it('vacío si no hay selección', () => {
    expect(estimateLabel(summarizePublicSelection(catalog, []))).toBe('');
  });
  it('solo fijos: el total', () => {
    expect(estimateLabel(summarizePublicSelection(catalog, [1, 2]))).toBe('$2,300.00');
  });
  it('solo variables: "A convenir"', () => {
    expect(estimateLabel(summarizePublicSelection(catalog, [3]))).toBe('A convenir');
  });
  it('mezcla: "Desde" el total de los fijos', () => {
    expect(estimateLabel(summarizePublicSelection(catalog, [1, 3]))).toBe('Desde $1,500.00');
  });
});
