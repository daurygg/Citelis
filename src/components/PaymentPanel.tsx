// Piezas de pago compartidas: las vías como chips y el panel para registrar un pago
// de lo que una clienta debe. Los cálculos viven en el dominio (payments.ts).
import { useRef, useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import type { Appointment, PaymentMethod } from '../lib/domain/types';
import { PAYMENT_METHODS, appointmentBalance, checkPaymentAmount, paymentMethodLabel } from '../lib/domain/payments';
import { useToast } from './Toast';
import { btnPrimary, chip, field, fieldLabel, input } from './ui';

/** Texto de un monto en centavos para precargar un campo ("30.00"). */
export function centsToText(cents: number): string {
  return (cents / 100).toFixed(2);
}

const chipOn = 'border-neutral-900 bg-neutral-900 text-white';
const chipOff = 'border-neutral-300 bg-white text-neutral-700';

/**
 * Efectivo / Transferencia / Tarjeta. `extra` añade una opción más aparte (p. ej.
 * "A crédito"); con ella activa, ninguna vía queda marcada.
 */
export function PaymentMethodChips({
  value,
  onChange,
  label,
  extra,
}: {
  value: PaymentMethod | null;
  onChange: (next: PaymentMethod) => void;
  label: string;
  extra?: { label: string; active: boolean; onSelect: () => void };
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {PAYMENT_METHODS.map((method) => (
        <button
          key={method}
          type="button"
          aria-pressed={value === method}
          onClick={() => onChange(method)}
          className={chip + ' ' + (value === method ? chipOn : chipOff)}
        >
          {paymentMethodLabel(method)}
        </button>
      ))}
      {extra && (
        <button
          type="button"
          aria-pressed={extra.active}
          onClick={extra.onSelect}
          className={chip + ' ' + (extra.active ? chipOn : chipOff)}
        >
          {extra.label}
        </button>
      )}
    </div>
  );
}

/**
 * Registrar un pago de lo que debe una cita ya cobrada. El saldo lo calcula el
 * dominio; el servidor vuelve a comprobar que no se pase. NO cambia lo cobrado.
 */
export function RegisterPaymentPanel({ appointment, onDone }: { appointment: Appointment; onDone?: () => void }) {
  const store = useStore();
  const { notify } = useToast();
  const balance = appointmentBalance(appointment.charged_price ?? 0, store.paidOf(appointment.id));
  const [amountText, setAmountText] = useState<string | null>(null); // null = el saldo completo
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);
  // Id del pago fijo entre reintentos: si un intento llegó a registrarse pero la
  // respuesta se perdió, reintentar no cobra dos veces.
  const paymentId = useRef<string | null>(null);

  const text = amountText ?? centsToText(balance);
  const cents = parseMoneyToCents(text);
  const check = cents === null ? { ok: false as const, reason: 'Escribe cuánto pagó.' } : checkPaymentAmount(cents, balance);

  async function handleSave() {
    if (!check.ok || cents === null || saving) return;
    paymentId.current ??= crypto.randomUUID();
    setSaving(true);
    let result;
    try {
      result = await store.addPayment(appointment.id, cents, method, 'credit_payment', paymentId.current);
    } finally {
      setSaving(false);
    }
    if (!result.ok) {
      notify(result.message, 'error');
      return;
    }
    paymentId.current = null;
    setAmountText(null);
    notify('✓ Pago registrado');
    onDone?.();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
      <div className="flex justify-between text-sm">
        <span className="text-neutral-600">Debe</span>
        <strong>{formatMoney(balance)}</strong>
      </div>
      <label className={field}>
        <span className={fieldLabel}>¿Cuánto pagó?</span>
        <input
          className={input}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            paymentId.current = null; // otro monto = otro pago
            setAmountText(e.target.value);
          }}
        />
      </label>
      {!check.ok && cents !== null && <p className="text-sm text-red-600">{check.reason}</p>}
      <div className={field}>
        <span className={fieldLabel}>¿Cómo pagó?</span>
        <PaymentMethodChips
          value={method}
          onChange={(next) => {
            paymentId.current = null; // otra vía = otro pago
            setMethod(next);
          }}
          label="Vía de pago"
        />
      </div>
      <button type="button" className={btnPrimary} onClick={handleSave} disabled={!check.ok || saving}>
        {saving ? 'Guardando…' : 'Guardar pago'}
      </button>
    </div>
  );
}
