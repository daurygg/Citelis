import { servicePriceLabel } from '../../lib/public/publicSelection';
import type { PublicBusinessService } from '../../lib/public/publicBooking';
import { focusRing, surface } from './portalStyles';

interface Props {
  services: readonly PublicBusinessService[];
  selectedIds: readonly number[];
  onToggle: (serviceId: number) => void;
}

/** Servicios como filas con línea fina sobre una sola superficie; el precio va a la derecha. */
export function ServiceList({ services, selectedIds, onToggle }: Props) {
  return (
    <ul className={surface + ' divide-y divide-line'}>
      {services.map((s) => {
        const selected = selectedIds.includes(s.service_id);
        return (
          <li key={s.service_id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(s.service_id)}
              className={
                'flex min-h-[4.25rem] w-full items-center gap-3 px-4 py-3 text-left transition focus-visible:-outline-offset-2 ' +
                focusRing +
                (selected ? ' bg-brand-50' : ' hover:bg-paper')
              }
            >
              <span
                aria-hidden="true"
                className={
                  'grid size-6 shrink-0 place-items-center rounded-full ring-1 ring-inset ' +
                  (selected ? 'bg-brand-700 text-white ring-brand-700' : 'ring-muted/50')
                }
              >
                {selected && (
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium break-words">{s.service_name}</span>
                <span className="block text-sm text-muted">{s.duration_min} min</span>
              </span>
              <span className="shrink-0 text-right font-semibold tabular-nums">{servicePriceLabel(s)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
