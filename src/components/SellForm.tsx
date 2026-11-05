// Registrar una venta de ropa: producto, cantidad, precio opcional y, si es a
// crédito (fiado), el cliente y cuánto pagó ahora. Baja el inventario al vender.
import { useState, type FormEvent } from 'react';
import { useInventory } from '../lib/store/InventoryContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { useToast } from './Toast';
import { btnPrimary, field, fieldLabel, input, screenTitle, surface } from './ui';

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
  const profit = (unitPrice - unitCost) * (validQty ? quantity : 0);

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
    return (
      <div className={surface + ' p-5'}>
        <p className="font-semibold">Aún no hay nada para vender</p>
        <p className="mt-1 text-muted">Primero añade productos en la pestaña "Productos".</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className={screenTitle}>Vender</h2>

      <div className={surface + ' grid grid-cols-2 gap-3 p-4'}>
        <label className={field + ' col-span-2'}>
          <span className={fieldLabel}>Producto</span>
          <select className={input} value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
            {inv.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (stock {p.stock})
              </option>
            ))}
          </select>
        </label>

        <label className={field}>
          <span className={fieldLabel}>Cantidad</span>
          <input className={input} type="number" min={1} value={qtyText} onChange={(e) => setQtyText(e.target.value)} />
        </label>
        <label className={field}>
          <span className={fieldLabel}>¿Otro precio? (opcional)</span>
          <input className={input} type="text" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
        </label>

        <label className={field + ' col-span-2'}>
          <span className={fieldLabel}>Cliente {credit ? '(requerido para fiado)' : '(opcional)'}</span>
          <input className={input} type="text" value={clientText} onChange={(e) => setClientText(e.target.value)} placeholder="Nombre de quien compra" />
        </label>

        <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-3">
          <input className="size-5 accent-ink" type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />
          Venta a crédito (fiado)
        </label>

        {credit && (
          <label className={field + ' col-span-2'}>
            <span className={fieldLabel}>¿Cuánto pagó ahora? (opcional)</span>
            <input className={input} type="text" inputMode="decimal" value={paidText} onChange={(e) => setPaidText(e.target.value)} placeholder="Dejar vacío si no pagó nada" />
          </label>
        )}
      </div>

      {/* El total manda; lo demás lo acompaña, igual que la franja de cifras de la agenda. */}
      {product && (
        <div className={surface + ' grid grid-cols-[1.15fr_1fr] gap-4 p-4 tabular-nums'}>
          <div>
            <p className="text-sm text-muted">Total</p>
            <p className="text-2xl font-bold">{formatMoney(total)}</p>
            <p className="text-sm text-muted">Disponible: {product.stock}</p>
          </div>
          <dl className="flex flex-col justify-between gap-2 border-l border-line pl-4">
            <div>
              <dt className="text-sm text-muted">Ganancia</dt>
              <dd className="font-semibold text-green-700">{formatMoney(profit)}</dd>
            </div>
            {credit && (
              <div>
                <dt className="text-sm text-muted">Quedará debiendo</dt>
                <dd className="font-semibold text-orange-700">{formatMoney(balance)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {product && !enoughStock && validQty && <p className="text-sm text-red-700">No hay stock suficiente.</p>}

      <button type="submit" className={btnPrimary} disabled={!canSell}>
        Registrar venta
      </button>
    </form>
  );
}
