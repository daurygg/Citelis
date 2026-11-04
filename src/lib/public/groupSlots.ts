// Agrupa los horarios del día por momento del día, sin React (INVARIANTE 5).
// Le da a la clienta una lista corta por tramo en vez de una rejilla plana.

import type { Slot } from '../domain/types';

export type SlotPeriod = 'morning' | 'afternoon' | 'evening';

export interface SlotGroup {
  period: SlotPeriod;
  slots: Slot[];
}

// Orden de presentación; también el orden de los grupos devueltos.
const PERIOD_ORDER: readonly SlotPeriod[] = ['morning', 'afternoon', 'evening'];

/** Mañana antes de las 12:00, tarde antes de las 19:00, noche el resto (hora local de inicio). */
function periodOf(slot: Slot): SlotPeriod {
  const hour = Number(slot.start.slice(11, 13));
  if (hour < 12) return 'morning';
  if (hour < 19) return 'afternoon';
  return 'evening';
}

/** Agrupa por periodo, conserva el orden de entrada y omite los grupos vacíos. */
export function groupSlotsByPeriod(slots: readonly Slot[]): SlotGroup[] {
  return PERIOD_ORDER.map((period) => ({
    period,
    slots: slots.filter((slot) => periodOf(slot) === period),
  })).filter((group) => group.slots.length > 0);
}
