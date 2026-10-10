import { describe, expect, it } from 'vitest';
import { formatClock, formatTime } from './format';

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
