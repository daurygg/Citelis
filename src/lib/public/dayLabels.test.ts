import { describe, expect, it } from 'vitest';
import { dayNumber, longDayLabel, weekdayShort } from './dayLabels';

describe('dayLabels', () => {
  it('weekdayShort da el día de la semana abreviado', () => {
    expect(weekdayShort('2026-07-02')).toBe('jue');
    expect(weekdayShort('2026-07-05')).toBe('dom');
  });

  it('dayNumber da el día del mes sin ceros a la izquierda', () => {
    expect(dayNumber('2026-07-02')).toBe('2');
    expect(dayNumber('2026-07-21')).toBe('21');
  });

  it('longDayLabel junta día de la semana, número y mes', () => {
    expect(longDayLabel('2026-07-02')).toBe('jue 2 de julio');
  });
});
