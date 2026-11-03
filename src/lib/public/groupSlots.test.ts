import { describe, expect, it } from 'vitest';
import { groupSlotsByPeriod } from './groupSlots';
import type { Slot } from '../domain/types';

const slot = (time: string): Slot => ({ start: `2026-07-02T${time}`, end: `2026-07-02T${time}` });

describe('groupSlotsByPeriod', () => {
  it('sin horarios devuelve una lista vacía', () => {
    expect(groupSlotsByPeriod([])).toEqual([]);
  });

  it('reparte en mañana, tarde y noche respetando los límites 12:00 y 19:00', () => {
    const slots = [slot('09:00'), slot('11:59'), slot('12:00'), slot('18:59'), slot('19:00'), slot('21:30')];
    expect(groupSlotsByPeriod(slots)).toEqual([
      { period: 'morning', slots: [slot('09:00'), slot('11:59')] },
      { period: 'afternoon', slots: [slot('12:00'), slot('18:59')] },
      { period: 'evening', slots: [slot('19:00'), slot('21:30')] },
    ]);
  });

  it('omite los periodos vacíos', () => {
    const groups = groupSlotsByPeriod([slot('14:00'), slot('15:00')]);
    expect(groups.map((g) => g.period)).toEqual(['afternoon']);
  });

  it('conserva el orden de entrada dentro de cada grupo', () => {
    const slots = [slot('10:30'), slot('09:00')];
    expect(groupSlotsByPeriod(slots)[0].slots).toEqual(slots);
  });

  it('no muta la entrada', () => {
    const slots = [slot('09:00')];
    const copy = [...slots];
    groupSlotsByPeriod(slots);
    expect(slots).toEqual(copy);
  });
});
