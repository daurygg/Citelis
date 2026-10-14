// Formulario "Registrar pago" (S6). Presentacional: valida con el dominio y entrega los
// argumentos ya convertidos (centavos, fecha ISO) a `onSubmit`; no sabe de Supabase.
import { useState } from 'react';
import {
  SUBSCRIPTION_PAYMENT_METHODS,
  subscriptionPaymentMethodLabel,
  validatePaymentForm,
  type PaymentArgs,
  type PaymentFormErrors,
} from '../../lib/domain/subscriptionAdmin';
import { btnGhost, btnPrimary, field, fieldLabel, input } from '../ui';

interface Props {
  currentPaidUntil: string | null;
  onSubmit: (args: PaymentArgs) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCancel: () => void;
}

export function PaymentForm({ currentPaidUntil, onSubmit, onCancel }: Props) {
  const [amount, setAmount] = useState('');
  const [paidUntil, setPaidUntil] = useState('');
  const [method, setMethod] = useState('TRANSFER');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<PaymentFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const result = validatePaymentForm({ amount, paid_until: paidUntil, method, note }, currentPaidUntil);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setServerError(null);
    setSaving(true);
    const response = await onSubmit(result.value);
    setSaving(false);
    // Si salió bien, el padre cierra el formulario; si no, se muestra el mensaje del servidor.
    if (!response.ok) setServerError(response.message);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3" noValidate>
      <label className={field}>
        <span className={fieldLabel}>¿Cuánto pagó? (RD$)</span>
        <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500" />
        {errors.amount && <span className="text-red-600">{errors.amount}</span>}
      </label>
      <label className={field}>
        <span className={fieldLabel}>Queda pagado hasta</span>
        <input className={input} type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
        {errors.paid_until && <span className="text-red-600">{errors.paid_until}</span>}
      </label>
      <label className={field}>
        <span className={fieldLabel}>¿Cómo pagó?</span>
        <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
          {SUBSCRIPTION_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {subscriptionPaymentMethodLabel(m)}
            </option>
          ))}
        </select>
        {errors.method && <span className="text-red-600">{errors.method}</span>}
      </label>
      <label className={field}>
        <span className={fieldLabel}>Nota (opcional)</span>
        <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {serverError && (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={`${btnPrimary} flex-1`} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar pago'}
        </button>
        <button type="button" className={btnGhost} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
