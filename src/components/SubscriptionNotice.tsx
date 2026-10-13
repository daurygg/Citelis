// Aviso visible pero que no estorba: prueba por terminar o plan vencido con plazo (S5).
// Presentacional: el texto y la decisión vienen de `subscriptionNotice` (dominio).
import type { SubscriptionNotice } from '../lib/domain/subscriptionView';

type Warning = Extract<SubscriptionNotice, { kind: 'warning' }>;

export function SubscriptionNoticeBar({ notice, payUrl }: { notice: Warning; payUrl: string }) {
  // En gracia es más urgente: ámbar; en prueba, informativo.
  const tone = notice.status === 'GRACE' ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-brand-50 text-brand-700 border-brand-100';
  return (
    <div role="status" className={`border-b px-4 py-3 text-sm ${tone}`}>
      <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-x-4">
        <p className="font-medium">{notice.message}</p>
        <a href={payUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium underline">
          Pagar por WhatsApp
        </a>
      </div>
    </div>
  );
}
