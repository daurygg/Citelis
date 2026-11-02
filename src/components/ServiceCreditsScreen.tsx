// Créditos de SERVICIOS: clientas con saldo pendiente de citas ya cobradas. Va aparte
// del crédito de ropa (INVARIANTE 3: servicios y productos no se mezclan). El saldo
// y el agrupado salen del dominio (payments.ts); aquí solo se pinta y se registra el pago.
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatDateShort, formatMoney } from '../lib/format';
import { serviceNames } from '../lib/domain/appointments';
import type { ClientCredit } from '../lib/domain/payments';
import { RegisterPaymentPanel } from './PaymentPanel';
import { btnGhostSm, rowDivider, screenTitle, surface } from './ui';

export function ServiceCreditsScreen() {
  const store = useStore();
  const credits = store.serviceCredits();
  const total = credits.reduce((sum, c) => sum + c.balance, 0);

  return (
    <section className="flex flex-col gap-4">
      <h2 className={screenTitle}>Créditos por cobrar</h2>

      {/* La cifra que importa va sola y grande; cuántas clientas la componen, debajo. */}
      <div className={surface + ' p-4'}>
        <p className="text-sm text-muted">Total por cobrar</p>
        <p className="text-2xl font-bold tabular-nums">{formatMoney(total)}</p>
        <p className="text-sm text-muted">
          {credits.length === 1 ? '1 clienta con saldo' : `${credits.length} clientas con saldo`}
        </p>
      </div>

      {credits.length === 0 ? (
        <div className={surface + ' p-5'}>
          <p className="font-semibold">Nadie te debe nada</p>
          <p className="mt-1 text-muted">Cuando una clienta deje algo a crédito, aparece aquí.</p>
        </div>
      ) : (
        <ul className={surface + ' overflow-hidden ' + rowDivider}>
          {credits.map((credit) => (
            <ClientCreditRow key={credit.key} credit={credit} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ClientCreditRow({ credit }: { credit: ClientCredit }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{credit.client}</span>
          {credit.phone && <span className="block truncate text-sm text-muted">{credit.phone}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-right tabular-nums">
            <span className="block font-semibold text-orange-700">Debe {formatMoney(credit.balance)}</span>
            <span className="block text-sm text-muted">
              {credit.appointments.length === 1 ? '1 cita' : `${credit.appointments.length} citas`}
            </span>
          </span>
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={'size-4 text-muted transition-transform motion-reduce:transition-none ' + (open ? 'rotate-180' : '')}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m3.5 6 4.5 4.5L12.5 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <ul className={'border-t border-line ' + rowDivider}>
          {credit.appointments.map(({ appointment, paid, balance }) => (
            <li key={appointment.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium break-words">{serviceNames(appointment, store.services) || 'Servicio'}</div>
                  <div className="text-sm text-muted tabular-nums">{formatDateShort(appointment.datetime)}</div>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className="font-semibold">Debe {formatMoney(balance)}</div>
                  <div className="text-sm text-muted">Cobró {formatMoney(appointment.charged_price ?? 0)}</div>
                  {paid > 0 && <div className="text-sm text-muted">Pagó {formatMoney(paid)}</div>}
                </div>
              </div>
              <button
                type="button"
                className={btnGhostSm + ' self-start'}
                onClick={() => setPayingId((id) => (id === appointment.id ? null : appointment.id))}
              >
                {payingId === appointment.id ? 'Cerrar' : 'Registrar pago'}
              </button>
              {payingId === appointment.id && (
                <RegisterPaymentPanel appointment={appointment} onDone={() => setPayingId(null)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
