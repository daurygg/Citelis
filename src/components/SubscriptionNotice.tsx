// Aviso visible pero que no estorba: prueba por terminar o plan vencido con plazo (S5).
// Presentacional: el texto y la decisión vienen de `subscriptionNotice` (dominio).
import type { SubscriptionNotice } from '../lib/domain/subscriptionView';

type Warning = Extract<SubscriptionNotice, { kind: 'warning' }>;

export function SubscriptionNoticeBar({ notice }: { notice: Warning }) {
  // En gracia es más urgente: ámbar; en prueba, informativo.
  const tone = notice.status === 'GRACE' ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-brand-50 text-brand-700 border-brand-100';
  return (
    <div role="status" className={`border-b px-4 py-3 text-sm ${tone}`}>
      <p className="mx-auto max-w-xl font-medium">{notice.message}</p>
    </div>
  );
}
