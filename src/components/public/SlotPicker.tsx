import type { Slot } from '../../lib/domain/types';
import { formatTime } from '../../lib/format';
import { groupSlotsByPeriod, type SlotPeriod } from '../../lib/public/groupSlots';
import { focusRing } from './portalStyles';

const PERIOD_LABEL: Record<SlotPeriod, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  evening: 'Noche',
};

interface Props {
  slots: readonly Slot[];
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}

/** Horas del día agrupadas en Mañana, Tarde y Noche. */
export function SlotPicker({ slots, selected, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {groupSlotsByPeriod(slots).map((group) => (
        <section key={group.period} aria-label={PERIOD_LABEL[group.period]}>
          <h3 className="mb-2 font-semibold">{PERIOD_LABEL[group.period]}</h3>
          <div className="grid grid-cols-3 gap-2">
            {group.slots.map((slot) => {
              const isSelected = selected?.start === slot.start;
              return (
                <button
                  key={slot.start}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelect(slot)}
                  className={
                    'min-h-11 rounded-xl px-2 text-sm tabular-nums transition ' +
                    focusRing +
                    (isSelected
                      ? ' bg-brand-600 font-semibold text-brand-fg'
                      : ' bg-white ring-1 ring-line hover:bg-paper')
                  }
                >
                  {formatTime(slot.start)}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
