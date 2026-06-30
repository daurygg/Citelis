// Formulario para añadir un insumo a un servicio. Al enviar, el store recalcula
// y guarda el cache supply_cost (INVARIANTE 6).
import { useState, type FormEvent } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { parseMoneyToCents } from '../lib/format';

const fieldStyle = { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', fontSize: '0.85rem' };

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
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '0.5rem' }}
    >
      <label style={{ ...fieldStyle, flex: 2 }}>
        <span>Nuevo insumo</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Pigmento" />
      </label>
      <label style={fieldStyle}>
        <span>¿Cuánto pagaste?</span>
        <input type="text" inputMode="decimal" value={paidText} onChange={(e) => setPaidText(e.target.value)} />
      </label>
      <label style={fieldStyle}>
        <span>¿Para cuántas clientas alcanza?</span>
        <input type="number" min={1} value={servingsText} onChange={(e) => setServingsText(e.target.value)} />
      </label>
      <button type="submit" disabled={!canAdd}>
        Añadir insumo
      </button>
    </form>
  );
}
