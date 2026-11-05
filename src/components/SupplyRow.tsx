// Una fila de insumo dentro del editor de un servicio.
// Pregunta en lenguaje de la dueña (INVARIANTE 4): "¿cuánto pagaste?" y
// "¿para cuántas clientas alcanza?". Cada edición recalcula el cache (vía store).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { unitCost } from '../lib/domain/costs';
import type { Supply } from '../lib/domain/types';
import { btnQuietDanger, field, fieldLabel, input } from './ui';

export function SupplyRow({ supply, serviceId }: { supply: Supply; serviceId: number }) {
  const store = useStore();
  // El monto pagado se edita como texto (permite "1,200.50") y se convierte a
  // centavos solo cuando es válido.
  const [paidText, setPaidText] = useState(String(supply.purchase_price / 100));

  function handlePaid(text: string) {
    setPaidText(text);
    const cents = parseMoneyToCents(text);
    if (cents !== null) store.updateSupply(supply.id, { purchase_price: cents });
  }

  return (
    <div className="grid grid-cols-2 items-end gap-3 p-4">
      <label className={field + ' col-span-2'}>
        <span className={fieldLabel}>Insumo</span>
        <input
          className={input}
          type="text"
          value={supply.name}
          onChange={(e) => store.updateSupply(supply.id, { name: e.target.value })}
        />
      </label>

      <label className={field}>
        <span className={fieldLabel}>¿Cuánto pagaste?</span>
        <input className={input} type="text" inputMode="decimal" value={paidText} onChange={(e) => handlePaid(e.target.value)} />
      </label>

      <label className={field}>
        <span className={fieldLabel}>¿Para cuántos servicios alcanza?</span>
        <input
          className={input}
          type="number"
          min={1}
          value={supply.servings}
          onChange={(e) => store.updateSupply(supply.id, { servings: Number(e.target.value) })}
        />
      </label>

      <div className="col-span-2 flex items-center justify-between gap-2">
        <span className="text-sm text-muted tabular-nums">Por servicio: {formatMoney(unitCost(supply))}</span>
        <button type="button" className={btnQuietDanger + ' -mr-3'} onClick={() => store.unlinkSupply(serviceId, supply.id)}>
          Quitar
        </button>
      </div>
    </div>
  );
}
