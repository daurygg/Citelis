// Créditos de SERVICIOS: clientas con saldo pendiente de citas ya cobradas. Va aparte
// del crédito de ropa (INVARIANTE 3: servicios y productos no se mezclan). El saldo
// y el agrupado salen del dominio (payments.ts); aquí solo se pinta y se registra el pago.
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatDateShort, formatMoney } from '../lib/format';
import { serviceNames } from '../lib/domain/appointments';
import type { ClientCredit } from '../lib/domain/payments';
import { RegisterPaymentPanel } from './PaymentPanel';
import { btnGhostSm, card } from './ui';

export function ServiceCreditsScreen() {
  const store = useStore();
  const credits = store.serviceCredits();
  const total = credits.reduce((sum, c) => sum + c.balance, 0);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Créditos (por cobrar)</h2>

      <div className={card}>
        <div className="text-sm text-neutral-500">Total por cobrar</div>
        <div className="text-2xl font-bold text-brand-700">{formatMoney(total)}</div>
      </div>

      {credits.length === 0 ? (
        <p className={card + ' text-neutral-500'}>Nadie te debe nada. 🎉</p>
      ) : (
        <ul className="flex flex-col gap-3">
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
    <li className={card + ' flex flex-col gap-3'}>
      <button
        type="button"
        aria-expanded={open}
        className="flex min-h-11 items-center justify-between gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{credit.client}</span>
          {credit.phone && <span className="block truncate text-sm text-neutral-500">{credit.phone}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold text-orange-700">Debe {formatMoney(credit.balance)}</span>
          <span className="block text-xs text-neutral-500">
            {credit.appointments.length === 1 ? '1 cita' : `${credit.appointments.length} citas`}
          </span>
        </span>
      </button>

      {open && (
        <ul className="flex flex-col gap-2">
          {credit.appointments.map(({ appointment, paid, balance }) => (
            <li key={appointment.id} className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
              <div className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{serviceNames(appointment, store.services) || 'Servicio'}</div>
                  <div className="text-xs text-neutral-500">{formatDateShort(appointment.datetime)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium">Debe {formatMoney(balance)}</div>
                  <div className="text-xs text-neutral-500">
                    Cobró {formatMoney(appointment.charged_price ?? 0)}
                    {paid > 0 && ` · pagó ${formatMoney(paid)}`}
                  </div>
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
