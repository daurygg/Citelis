// Registrar una venta de ropa: elige producto, cantidad y precio opcional.
// Muestra el stock disponible y baja el inventario al vender.
import { useState, type FormEvent } from 'react';
import { useInventory } from '../lib/store/InventoryContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { btnPrimary, card, field, fieldLabel, input } from './ui';

export function SellForm() {
  const inv = useInventory();
  const [productId, setProductId] = useState<number>(inv.products[0]?.id ?? 0);
  const [qtyText, setQtyText] = useState('1');
  const [priceText, setPriceText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const product = inv.products.find((p) => p.id === productId);
  const quantity = Number(qtyText);
  const override = priceText.trim() === '' ? undefined : (parseMoneyToCents(priceText) ?? undefined);
  const unitPrice = override ?? product?.price ?? 0;
  const unitCost = product?.cost ?? 0;

  const validQty = Number.isFinite(quantity) && quantity > 0;
  const enoughStock = product ? quantity <= product.stock : false;
  const canSell = product !== undefined && validQty && enoughStock;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSell) return;
    const ok = inv.registerSale(productId, Math.floor(quantity), override);
    if (ok) {
      setNotice(`Venta registrada: ${Math.floor(quantity)} × ${product?.name}.`);
      setQtyText('1');
      setPriceText('');
    } else {
      setNotice('No se pudo registrar (sin stock suficiente).');
    }
  }

  if (inv.products.length === 0) {
    return <p className={card + ' text-neutral-500'}>Primero añade productos en la pestaña "Productos".</p>;
  }

  return (
    <form onSubmit={handleSubmit} className={card + ' flex flex-col gap-3'}>
      <h2 className="text-lg font-semibold">Vender</h2>

      <label className={field}>
        <span className={fieldLabel}>Producto</span>
        <select className={input} value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
          {inv.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (stock {p.stock})
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-3">
        <label className={field + ' flex-1'}>
          <span className={fieldLabel}>Cantidad</span>
          <input className={input} type="number" min={1} value={qtyText} onChange={(e) => setQtyText(e.target.value)} />
        </label>
        <label className={field + ' flex-1'}>
          <span className={fieldLabel}>¿Otro precio? (opcional)</span>
          <input className={input} type="text" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
        </label>
      </div>

      {product && (
        <div className="flex justify-between rounded-xl bg-neutral-50 p-3 text-sm">
          <span>Disponible: {product.stock}</span>
          <span>
            Ganancia: <strong className="text-green-700">{formatMoney((unitPrice - unitCost) * (validQty ? quantity : 0))}</strong>
          </span>
        </div>
      )}

      {product && !enoughStock && validQty && <p className="text-sm text-red-600">No hay stock suficiente.</p>}
      {notice && <p className="text-sm text-neutral-600">{notice}</p>}

      <button type="submit" className={btnPrimary} disabled={!canSell}>
        Registrar venta
      </button>
    </form>
  );
}
