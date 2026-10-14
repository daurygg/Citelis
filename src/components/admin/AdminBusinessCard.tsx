// Tarjeta de un negocio en el panel de administración (S6). Presentacional.
import { formatDateShort, formatMoney } from '../../lib/format';
import { subscriptionStatusLabel, type PaymentArgs } from '../../lib/domain/subscriptionAdmin';
import type { AdminBusiness } from '../../lib/domain/types';
import { btnGhostSm, btnPrimarySm, card } from '../ui';
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
  return (
    <li className={card}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold">{b.name}</h3>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">{subscriptionStatusLabel(b.status)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-neutral-600">
        <dt>Pagado hasta</dt>
        <dd>{b.paid_until ? formatDateShort(b.paid_until) : 'Nunca ha pagado'}</dd>
        <dt>Último pago</dt>
        <dd>
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
