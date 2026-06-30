// Una fila de insumo dentro de la configuración de un servicio.
// Pregunta en lenguaje de la dueña (INVARIANTE 4): "¿cuánto pagaste?" y
// "¿para cuántas clientas alcanza?". Cada edición recalcula el cache (vía store).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { unitCost } from '../lib/domain/costs';
import type { Supply } from '../lib/domain/types';

const fieldStyle = { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', fontSize: '0.85rem' };

export function SupplyRow({ supply }: { supply: Supply }) {
  const store = useStore();
  // El monto pagado se edita como texto (permite escribir "1,200.50") y se
  // convierte a centavos solo cuando es válido.
  const [paidText, setPaidText] = useState(String(supply.purchase_price / 100));

  function handlePaid(text: string) {
    setPaidText(text);
    const cents = parseMoneyToCents(text);
    if (cents !== null) store.updateSupply(supply.id, { purchase_price: cents });
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        borderTop: '1px solid #f0f0f0',
        padding: '0.5rem 0',
      }}
    >
      <label style={{ ...fieldStyle, flex: 2 }}>
        <span>Insumo</span>
        <input
          type="text"
          value={supply.name}
          onChange={(e) => store.updateSupply(supply.id, { name: e.target.value })}
        />
      </label>

      <label style={fieldStyle}>
        <span>¿Cuánto pagaste?</span>
        <input type="text" inputMode="decimal" value={paidText} onChange={(e) => handlePaid(e.target.value)} />
      </label>

      <label style={fieldStyle}>
        <span>¿Para cuántas clientas alcanza?</span>
        <input
          type="number"
          min={1}
          value={supply.servings}
          onChange={(e) => store.updateSupply(supply.id, { servings: Number(e.target.value) })}
        />
      </label>

      <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>c/u {formatMoney(unitCost(supply))}</span>

      <button type="button" onClick={() => store.removeSupply(supply.id)}>
        Quitar
      </button>
    </div>
  );
}
