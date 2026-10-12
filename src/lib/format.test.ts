import { describe, expect, it } from 'vitest';
import { formatClock, formatMoney, formatTime } from './format';

describe('formatClock', () => {
  it('pasa una hora de la mañana a 12h', () => {
    expect(formatClock('10:00')).toBe('10:00 AM');
  });

  it('pasa una hora de la tarde a 12h', () => {
    expect(formatClock('18:00')).toBe('6:00 PM');
  });

  it('mediodía y medianoche son 12', () => {
    expect(formatClock('12:30')).toBe('12:30 PM');
    expect(formatClock('00:15')).toBe('12:15 AM');
  });

  it('ignora los segundos si la base los trae', () => {
    expect(formatClock('11:06:00')).toBe('11:06 AM');
  });
});

describe('formatTime', () => {
  it('toma la hora de un ISO completo', () => {
    expect(formatTime('2026-07-02T14:30')).toBe('2:30 PM');
  });
});

describe('formatMoney', () => {
  it('muestra pesos dominicanos con separador de miles', () => {
    expect(formatMoney(350000)).toBe('RD$3,500.00');
    expect(formatMoney(40000)).toBe('RD$400.00');
  });

  it('cero y negativos', () => {
    expect(formatMoney(0)).toBe('RD$0.00');
    expect(formatMoney(-40000)).toBe('-RD$400.00');
  });
});
