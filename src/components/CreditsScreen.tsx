// Fiados (cuentas por cobrar): quién debe, cuánto, y registrar abonos hasta saldar.
import { useState } from 'react';
import { useInventory } from '../lib/store/InventoryContext';
import { saleBalance } from '../lib/domain/inventory/sales';
import type { Sale } from '../lib/domain/inventory/types';
import { formatDateShort, formatMoney, parseMoneyToCents } from '../lib/format';
import { useToast } from './Toast';
import { btnGhost, btnPrimary, card, field, fieldLabel, input } from './ui';

export function CreditsScreen() {
  const inv = useInventory();
  const credits = inv.creditSales();
  const total = inv.outstandingTotal();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Fiados (por cobrar)</h2>

      <div className={card}>
        <div className="text-sm text-neutral-500">Total por cobrar</div>
        <div className="text-2xl font-bold text-rose-700">{formatMoney(total)}</div>
      </div>

      {credits.length === 0 ? (
        <p className={card + ' text-neutral-500'}>No hay fiados pendientes. 🎉</p>
      ) : (
        credits.map((sale) => <CreditRow key={sale.id} sale={sale} />)
      )}
    </section>
  );
}

function CreditRow({ sale }: { sale: Sale }) {
  const inv = useInventory();
  const { notify } = useToast();
  const [amountText, setAmountText] = useState('');

  const balance = saleBalance(sale);
  const productName = inv.products.find((p) => p.id === sale.product_id)?.name ?? `Producto ${sale.product_id}`;

  function pay() {
    const amount = parseMoneyToCents(amountText);
    if (amount === null || amount <= 0) return;
    inv.addPayment(sale.id, amount);
    setAmountText('');
    notify('✓ Abono registrado');
  }

  function payAll() {
    inv.addPayment(sale.id, balance);
    notify('✓ Deuda saldada');
  }

  return (
    <div className={card + ' flex flex-col gap-2'}>
      <div className="flex items-baseline justify-between">
        <div className="min-w-0">
          <div className="truncate font-medium">{sale.client || 'Sin nombre'}</div>
          <div className="truncate text-sm text-neutral-500">
            {sale.quantity} × {productName} · {formatDateShort(sale.datetime)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-400">Debe</div>
          <div className="font-semibold text-rose-700">{formatMoney(balance)}</div>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <label className={field + ' flex-1'}>
          <span className={fieldLabel}>Registrar abono</span>
          <input className={input} type="text" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </label>
        <button type="button" className={btnGhost} onClick={pay}>
          Abonar
        </button>
        <button type="button" className={btnPrimary} onClick={payAll}>
          Saldar
        </button>
      </div>
    </div>
  );
}
