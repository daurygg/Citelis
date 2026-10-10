import { describe, it, expect } from 'vitest';
import { summarizeSelection, toggleServiceId } from './selection';
import type { Service } from './types';

function service(partial: Partial<Service> = {}): Service {
  return {
    id: 1,
    business_id: 1,
    name: 'Cejas',
    price: 5000,
    supply_cost: 1000,
    cost_override: null,
    duration_min: 30,
    variable_price: false,
    ...partial,
  };
}

const cejas = service({ id: 1, name: 'Cejas', price: 5000, duration_min: 30 });
const ondas = service({ id: 2, name: 'Ondas', price: 4000, duration_min: 45 });
const maquillaje = service({ id: 3, name: 'Maquillaje', price: 0, duration_min: 60, variable_price: true });
const catalog = [cejas, ondas, maquillaje];

describe('toggleServiceId', () => {
  it('agrega al final y conserva el orden de elección', () => {
    expect(toggleServiceId([2], 1)).toEqual([2, 1]);
  });

  it('quita el servicio si ya estaba', () => {
    expect(toggleServiceId([2, 1], 2)).toEqual([1]);
  });

  it('no muta la lista original', () => {
    const before = [1];
    toggleServiceId(before, 2);
    expect(before).toEqual([1]);
  });
});

describe('summarizeSelection', () => {
  it('sin selección no hay principal ni duración ni precio', () => {
    const s = summarizeSelection(catalog, []);
    expect(s.service_ids).toEqual([]);
    expect(s.primary).toBeNull();
    expect(s.duration_min).toBe(0);
    expect(s.estimate.total).toBe(0);
    expect(s.ready).toBe(false);
  });

  it('el primero elegido es el principal y la duración suma', () => {
    const s = summarizeSelection(catalog, [2, 1]);
    expect(s.service_ids).toEqual([2, 1]);
    expect(s.primary).toBe(2);
    expect(s.duration_min).toBe(75);
    expect(s.estimate.total).toBe(9000);
    expect(s.estimate.hasVariable).toBe(false);
    expect(s.ready).toBe(true);
  });

  it('un servicio variable no suma dinero inventado: se marca "a convenir"', () => {
    const s = summarizeSelection(catalog, [1, 3]);
    expect(s.estimate.total).toBe(5000);
    expect(s.estimate.hasVariable).toBe(true);
    expect(s.duration_min).toBe(90);
  });

  it('ignora ids que ya no están en el catálogo y quita repetidos', () => {
    const s = summarizeSelection(catalog, [1, 99, 1]);
    expect(s.service_ids).toEqual([1]);
    expect(s.primary).toBe(1);
  });

  it('un servicio sin duración positiva impide agendar', () => {
    const s = summarizeSelection([service({ id: 7, duration_min: 0 })], [7]);
    expect(s.ready).toBe(false);
  });
});
