// Gastos fijos del MES indicado (luz, agua, renta…). Cada mes puede tener montos
// distintos (la luz varía). Se restan de la ganancia bruta para obtener la neta.
import { useState, type FormEvent } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { useToast } from './Toast';
import { btnGhost, card, field, fieldLabel, input } from './ui';

export function FixedExpenses({ month }: { month: string }) {
  const store = useStore();
  const { notify } = useToast();
  const [concept, setConcept] = useState('');
  const [amountText, setAmountText] = useState('');

  const expenses = store.expensesForMonth(month);
  const amount = parseMoneyToCents(amountText);
  const canAdd = concept.trim() !== '' && amount !== null && amount > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdd || amount === null) return;
    store.addFixedExpense({ concept: concept.trim(), amount, month });
    setConcept('');
    setAmountText('');
  }

  function handleCopy() {
    store.copyPreviousMonthExpenses(month);
    notify('Copiados los gastos del mes anterior');
  }

  return (
    <div className={card + ' flex flex-col gap-3'}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Gastos fijos del mes</h3>
        <button type="button" className="text-sm text-rose-700 hover:underline" onClick={handleCopy}>
          Copiar del mes anterior
        </button>
      </div>

      {expenses.length === 0 ? (
        <p className="text-sm text-neutral-500">Aún no hay gastos para este mes.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100">
          {expenses.map((expense) => (
            <li key={expense.id} className="flex items-center justify-between py-2">
              <span>{expense.concept}</span>
              <div className="flex items-center gap-3">
                <span className="font-medium">{formatMoney(expense.amount)}</span>
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => store.removeFixedExpense(expense.id)}
                >
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className={field + ' min-w-[8rem] flex-[2]'}>
          <span className={fieldLabel}>Concepto</span>
          <input className={input} type="text" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej: Luz" />
        </label>
        <label className={field + ' flex-1'}>
          <span className={fieldLabel}>Monto de este mes</span>
          <input className={input} type="text" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </label>
        <button type="submit" className={btnGhost} disabled={!canAdd}>
          Añadir
        </button>
      </form>
    </div>
  );
}
