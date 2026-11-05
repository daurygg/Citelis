// Tarjeta de un negocio en el panel de administración (S6). Presentacional.
import { formatDateShort, formatMoney } from '../../lib/format';
import { subscriptionStatusLabel, type PaymentArgs } from '../../lib/domain/subscriptionAdmin';
import { businessTypeLabel } from '../../lib/domain/ownerProfile';
import { whatsappUrl } from '../../lib/domain/whatsapp';
import type { AdminBusiness } from '../../lib/domain/types';
import { btnGhostSm, btnPrimarySm } from '../ui';
import { PaymentForm } from './PaymentForm';

interface Props {
  business: AdminBusiness;
  paying: boolean;
  busy: boolean;
  onStartPayment: () => void;
  onCancelPayment: () => void;
  onSubmitPayment: (args: PaymentArgs) => Promise<{ ok: true } | { ok: false; message: string }>;
  onToggleExempt: () => void;
}

export function AdminBusinessCard({ business, paying, busy, onStartPayment, onCancelPayment, onSubmitPayment, onToggleExempt }: Props) {
  const b = business;
  // Enlace directo al WhatsApp de quien administra (odd/tasks/owner-profile.md, S4).
  const chat = b.owner_name ? whatsappUrl(b.owner_whatsapp, `Hola ${b.owner_name}, te escribo de Citelis.`) : null;
  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold">{b.name}</h3>
        <span className="shrink-0 rounded-full bg-line/60 px-2.5 py-1 text-xs font-medium whitespace-nowrap">{subscriptionStatusLabel(b.status)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-muted">
        <dt>Administra</dt>
        <dd className="min-w-0 break-words text-ink">
          {b.owner_name ? (
            <>
              {b.owner_name}
              {chat && (
                <>
                  {' · '}
                  <a href={chat} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 underline">
                    {b.owner_whatsapp}
                  </a>
                </>
              )}
            </>
          ) : (
            'Sin completar'
          )}
        </dd>
        <dt>Tipo</dt>
        <dd className="text-ink">{businessTypeLabel(b.business_type) ?? 'Sin completar'}</dd>
        <dt>Pagado hasta</dt>
        <dd className="text-ink tabular-nums">{b.paid_until ? formatDateShort(b.paid_until) : 'Nunca ha pagado'}</dd>
        <dt>Último pago</dt>
        <dd className="text-ink tabular-nums">
          {b.last_payment_at && b.last_payment_cents !== null
            ? `${formatMoney(b.last_payment_cents)} el ${formatDateShort(b.last_payment_at)}`
            : 'Ninguno'}
        </dd>
      </dl>
      {paying ? (
        <PaymentForm currentPaidUntil={b.paid_until} onSubmit={onSubmitPayment} onCancel={onCancelPayment} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnPrimarySm} onClick={onStartPayment} disabled={busy}>
            Registrar pago
          </button>
          <button type="button" className={btnGhostSm} onClick={onToggleExempt} disabled={busy}>
            {b.exempt ? 'Quitar exención' : 'Dejar exento'}
          </button>
        </div>
      )}
    </li>
  );
}
