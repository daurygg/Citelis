// Registrar una venta de ropa: producto, cantidad, precio opcional y, si es a
// crédito (fiado), el cliente y cuánto pagó ahora. Baja el inventario al vender.
import { useState, type FormEvent } from 'react';
import { useInventory } from '../lib/store/InventoryContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { useToast } from './Toast';
import { btnPrimary, card, field, fieldLabel, input } from './ui';

export function SellForm() {
  const inv = useInventory();
  const { notify } = useToast();
  const [productId, setProductId] = useState<number>(inv.products[0]?.id ?? 0);
  const [qtyText, setQtyText] = useState('1');
  const [priceText, setPriceText] = useState('');
  const [clientText, setClientText] = useState('');
  const [credit, setCredit] = useState(false);
  const [paidText, setPaidText] = useState('');

  const product = inv.products.find((p) => p.id === productId);
  const quantity = Number(qtyText);
  const override = priceText.trim() === '' ? undefined : (parseMoneyToCents(priceText) ?? undefined);
  const unitPrice = override ?? product?.price ?? 0;
  const unitCost = product?.cost ?? 0;

  const validQty = Number.isFinite(quantity) && quantity > 0;
  const total = validQty ? unitPrice * quantity : 0;
  // Contado: paga todo. A crédito: lo que la clienta dé ahora (por defecto 0).
  const paidNow = credit ? (parseMoneyToCents(paidText) ?? 0) : total;
  const balance = Math.max(0, total - paidNow);

  const enoughStock = product ? quantity <= product.stock : false;
  // A crédito exige nombre de cliente (para saber quién debe).
  const clientOk = !credit || clientText.trim() !== '';
  const canSell = product !== undefined && validQty && enoughStock && clientOk;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSell) return;
    const ok = inv.registerSale({
      productId,
      quantity: Math.floor(quantity),
      overridePrice: override,
      client: clientText,
      paid: paidNow,
    });
    if (ok) {
      notify(balance > 0 ? `✓ Venta a crédito. Debe ${formatMoney(balance)}` : `✓ Venta registrada`);
      setQtyText('1');
      setPriceText('');
      setClientText('');
      setPaidText('');
      setCredit(false);
    } else {
      notify('No se pudo registrar (sin stock suficiente).', 'error');
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

      <label className={field}>
        <span className={fieldLabel}>Cliente {credit ? '(requerido para fiado)' : '(opcional)'}</span>
        <input className={input} type="text" value={clientText} onChange={(e) => setClientText(e.target.value)} placeholder="Nombre de la clienta" />
      </label>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />
        Venta a crédito (fiado)
      </label>

      {credit && (
        <label className={field}>
          <span className={fieldLabel}>¿Cuánto pagó ahora? (opcional)</span>
          <input className={input} type="text" inputMode="decimal" value={paidText} onChange={(e) => setPaidText(e.target.value)} placeholder="Dejar vacío si no pagó nada" />
        </label>
      )}

      {product && (
        <div className="flex flex-col gap-1 rounded-xl bg-neutral-50 p-3 text-sm">
          <div className="flex justify-between">
            <span>Disponible: {product.stock}</span>
            <span>
              Total: <strong>{formatMoney(total)}</strong>
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-700">
              Ganancia: <strong>{formatMoney((unitPrice - unitCost) * (validQty ? quantity : 0))}</strong>
            </span>
            {credit && (
              <span className="text-rose-700">
                Quedará debiendo: <strong>{formatMoney(balance)}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {product && !enoughStock && validQty && <p className="text-sm text-red-600">No hay stock suficiente.</p>}

      <button type="submit" className={btnPrimary} disabled={!canSell}>
        Registrar venta
      </button>
    </form>
  );
}
