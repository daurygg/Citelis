// Fila de un producto de ropa: editar nombre/precio/costo, reponer stock y borrar.
import { useState } from 'react';
import { useInventory } from '../lib/store/InventoryContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import type { Product } from '../lib/domain/inventory/types';
import { card, field, fieldLabel, input } from './ui';

export function ProductRow({ product }: { product: Product }) {
  const inv = useInventory();
  const [priceText, setPriceText] = useState(String(product.price / 100));
  const [costText, setCostText] = useState(String(product.cost / 100));
  const [restockText, setRestockText] = useState('');

  function commitPrice(text: string) {
    setPriceText(text);
    const cents = parseMoneyToCents(text);
    if (cents !== null) inv.updateProduct(product.id, { price: cents });
  }
  function commitCost(text: string) {
    setCostText(text);
    const cents = parseMoneyToCents(text);
    if (cents !== null) inv.updateProduct(product.id, { cost: cents });
  }
  function doRestock() {
    const n = Number(restockText);
    if (Number.isFinite(n) && n > 0) {
      inv.restock(product.id, Math.floor(n));
      setRestockText('');
    }
  }

  const margin = product.price - product.cost;

  return (
    <div className={card + ' flex flex-col gap-3'}>
      <label className={field}>
        <span className={fieldLabel}>Producto</span>
        <input
          className={input}
          type="text"
          value={product.name}
          onChange={(e) => inv.updateProduct(product.id, { name: e.target.value })}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className={field + ' flex-1'}>
          <span className={fieldLabel}>Precio de venta</span>
          <input className={input} type="text" inputMode="decimal" value={priceText} onChange={(e) => commitPrice(e.target.value)} />
        </label>
        <label className={field + ' flex-1'}>
          <span className={fieldLabel}>Costo</span>
          <input className={input} type="text" inputMode="decimal" value={costText} onChange={(e) => commitCost(e.target.value)} />
        </label>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>
          En stock: <strong>{product.stock}</strong>
        </span>
        <span>
          Margen:{' '}
          <strong className={margin >= 0 ? 'text-green-700' : 'text-red-700'}>{formatMoney(margin)}</strong>
        </span>
      </div>

      <div className="flex items-end gap-2">
        <label className={field + ' flex-1'}>
          <span className={fieldLabel}>Reponer (unidades)</span>
          <input className={input} type="number" min={1} value={restockText} onChange={(e) => setRestockText(e.target.value)} />
        </label>
        <button type="button" className="rounded-xl border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100" onClick={doRestock}>
          Añadir stock
        </button>
        <button
          type="button"
          className="px-2 py-2 text-sm text-red-600 hover:underline"
          onClick={() => {
            if (window.confirm(`¿Eliminar "${product.name}"? (solo si no tiene ventas)`)) inv.deleteProduct(product.id);
          }}
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}
