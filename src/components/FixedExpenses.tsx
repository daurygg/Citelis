// Gastos fijos del MES indicado (luz, agua, renta…). Cada mes puede tener montos
// distintos (la luz varía). Se restan de la ganancia bruta para obtener la neta.
import { useState, type FormEvent } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { useToast } from './Toast';
import { btnGhost, btnQuiet, btnQuietDanger, field, fieldLabel, input, rowDivider, surface } from './ui';

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
    <section className={surface + ' flex flex-col'}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 pt-4 pr-2 pl-4">
        <h3 className="text-lg font-semibold">Gastos fijos del mes</h3>
        <button type="button" className={btnQuiet + ' text-brand-700'} onClick={handleCopy}>
          Copiar del mes anterior
        </button>
      </div>

      {expenses.length === 0 ? (
        <p className="p-4 pt-1 text-muted">Aún no hay gastos para este mes.</p>
      ) : (
        <ul className={'mt-2 border-t border-line px-4 ' + rowDivider}>
          {expenses.map((expense) => (
            <li key={expense.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 py-3 break-words">{expense.concept}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatMoney(expense.amount)}</span>
              <button type="button" className={btnQuietDanger} onClick={() => store.removeFixedExpense(expense.id)}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-2 items-end gap-3 border-t border-line p-4">
        <label className={field + ' col-span-2'}>
          <span className={fieldLabel}>Concepto</span>
          <input className={input} type="text" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej: Luz" />
        </label>
        <label className={field}>
          <span className={fieldLabel}>Monto de este mes</span>
          <input className={input} type="text" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </label>
        <button type="submit" className={btnGhost} disabled={!canAdd}>
          Añadir gasto
        </button>
      </form>
    </section>
  );
}
