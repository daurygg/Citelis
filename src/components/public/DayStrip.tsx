import { dayNumber, weekdayShort } from '../../lib/public/dayLabels';
import { focusRing } from './portalStyles';

interface Props {
  dates: readonly string[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
}

/** Fichas tipo calendario: día de la semana pequeño y número grande. La tira se desliza por dentro. */
export function DayStrip({ dates, today, selected, onSelect }: Props) {
  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2">
      {dates.map((date) => {
        const isSelected = date === selected;
        return (
          <button
            key={date}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(date)}
            className={
              'flex min-h-[4.5rem] w-14 shrink-0 snap-start flex-col items-center justify-center rounded-2xl transition ' +
              focusRing +
              (isSelected
                ? ' bg-brand-600 text-brand-fg'
                : ' bg-white ring-1 ring-portal-line hover:bg-portal-paper')
            }
          >
            <span className={'text-sm ' + (isSelected ? '' : 'text-portal-muted')}>
              {date === today ? 'hoy' : weekdayShort(date)}
            </span>
            <span className="text-xl leading-tight font-semibold tabular-nums">{dayNumber(date)}</span>
          </button>
        );
      })}
    </div>
  );
}
