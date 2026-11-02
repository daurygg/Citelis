import { describe, expect, it } from 'vitest';
import { dayHeading, splitClock } from './agendaDay';

describe('dayHeading', () => {
  it('da día de la semana completo y fecha en palabras', () => {
    expect(dayHeading('2026-07-02', '2026-07-10')).toEqual({ weekday: 'jueves', date: '2 de julio', relative: null });
    expect(dayHeading('2026-12-27', '2026-07-10')).toEqual({ weekday: 'domingo', date: '27 de diciembre', relative: null });
  });

  it('marca hoy, mañana y ayer', () => {
    expect(dayHeading('2026-07-10', '2026-07-10').relative).toBe('hoy');
    expect(dayHeading('2026-07-11', '2026-07-10').relative).toBe('mañana');
    expect(dayHeading('2026-07-09', '2026-07-10').relative).toBe('ayer');
  });

  it('cruza el cambio de mes al comparar', () => {
    expect(dayHeading('2026-08-01', '2026-07-31').relative).toBe('mañana');
  });
});

describe('splitClock', () => {
  it('separa la hora del AM/PM', () => {
    expect(splitClock('2026-07-02T14:30')).toEqual({ time: '2:30', period: 'PM' });
    expect(splitClock('2026-07-02T09:05')).toEqual({ time: '9:05', period: 'AM' });
    expect(splitClock('2026-07-02T00:00')).toEqual({ time: '12:00', period: 'AM' });
  });
});
