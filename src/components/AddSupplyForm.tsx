// Formulario para añadir un insumo a un servicio. Al enviar, el store recalcula
// y guarda el cache supply_cost (INVARIANTE 6).
import { useState, type FormEvent } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { parseMoneyToCents } from '../lib/format';
import { btnGhost, field, fieldLabel, input } from './ui';

export function AddSupplyForm({ serviceId }: { serviceId: number }) {
  const store = useStore();
  const [name, setName] = useState('');
  const [paidText, setPaidText] = useState('');
  const [servingsText, setServingsText] = useState('');

  const paid = parseMoneyToCents(paidText);
  const servings = Number(servingsText);
  const canAdd = name.trim() !== '' && paid !== null && Number.isFinite(servings) && servings > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdd || paid === null) return;
    store.addSupply(serviceId, { name: name.trim(), purchase_price: paid, servings });
    setName('');
    setPaidText('');
    setServingsText('');
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-neutral-50 p-3">
      <label className={field + ' min-w-[8rem] flex-[2]'}>
        <span className={fieldLabel}>Nuevo insumo</span>
        <input className={input} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Pigmento" />
      </label>
      <label className={field + ' flex-1'}>
        <span className={fieldLabel}>¿Cuánto pagaste?</span>
        <input className={input} type="text" inputMode="decimal" value={paidText} onChange={(e) => setPaidText(e.target.value)} />
      </label>
      <label className={field + ' flex-1'}>
        <span className={fieldLabel}>¿Para cuántas alcanza?</span>
        <input className={input} type="number" min={1} value={servingsText} onChange={(e) => setServingsText(e.target.value)} />
      </label>
      <button type="submit" className={btnGhost} disabled={!canAdd}>
        Añadir
      </button>
    </form>
  );
}
