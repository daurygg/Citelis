// Una fila de insumo dentro del editor de un servicio.
// Pregunta en lenguaje de la dueña (INVARIANTE 4): "¿cuánto pagaste?" y
// "¿para cuántas clientas alcanza?". Cada edición recalcula el cache (vía store).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { unitCost } from '../lib/domain/costs';
import type { Supply } from '../lib/domain/types';
import { field, fieldLabel, input } from './ui';

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
    <div className="flex flex-wrap items-end gap-3 border-t border-neutral-100 py-3">
      <label className={field + ' min-w-[8rem] flex-[2]'}>
        <span className={fieldLabel}>Insumo</span>
        <input
          className={input}
          type="text"
          value={supply.name}
          onChange={(e) => store.updateSupply(supply.id, { name: e.target.value })}
        />
      </label>

      <label className={field + ' flex-1'}>
        <span className={fieldLabel}>¿Cuánto pagaste?</span>
        <input className={input} type="text" inputMode="decimal" value={paidText} onChange={(e) => handlePaid(e.target.value)} />
      </label>

      <label className={field + ' flex-1'}>
        <span className={fieldLabel}>¿Para cuántas alcanza?</span>
        <input
          className={input}
          type="number"
          min={1}
          value={supply.servings}
          onChange={(e) => store.updateSupply(supply.id, { servings: Number(e.target.value) })}
        />
      </label>

      <div className="flex items-center gap-2 pb-2">
        <span className="text-sm text-neutral-500">c/u {formatMoney(unitCost(supply))}</span>
        <button
          type="button"
          className="text-sm text-red-600 hover:underline"
          onClick={() => store.unlinkSupply(serviceId, supply.id)}
        >
          Quitar
        </button>
      </div>
    </div>
  );
}
