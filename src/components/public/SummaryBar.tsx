import { portalPrimary } from './portalStyles';

interface Props {
  /** Lo que se ha elegido hasta ahora (servicios; día y hora cuando ya hay). */
  title: string;
  detail: string;
  price: string;
  cta: string;
  ctaDisabled?: boolean;
  onCta: () => void;
}

/**
 * Barra fija abajo: la cita que se va armando y la acción principal del paso,
 * en la zona del pulgar. Es el único elemento que se mueve (sube la primera vez).
 */
export function SummaryBar({ title, detail, price, cta, ctaDisabled, onCta }: Props) {
  return (
    <div className="portal-bar-in fixed inset-x-0 bottom-0 z-10 border-t border-portal-line bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm leading-snug font-medium">{title}</p>
          <p className="truncate text-sm text-portal-muted">{detail}</p>
          <p className="font-semibold tabular-nums">{price}</p>
        </div>
        <button type="button" className={portalPrimary} disabled={ctaDisabled} onClick={onCta}>
          {cta}
        </button>
      </div>
    </div>
  );
}
