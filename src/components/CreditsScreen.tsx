// Fiados (cuentas por cobrar): quién debe, cuánto, y registrar abonos hasta saldar.
import { useState } from 'react';
import { useInventory } from '../lib/store/InventoryContext';
import { saleBalance } from '../lib/domain/inventory/sales';
import type { Sale } from '../lib/domain/inventory/types';
import { formatDateShort, formatMoney, parseMoneyToCents } from '../lib/format';
import { useToast } from './Toast';
import { btnGhostSm, btnPrimarySm, field, fieldLabel, input, rowDivider, screenTitle, surface } from './ui';

export function CreditsScreen() {
  const inv = useInventory();
  const credits = inv.creditSales();
  const total = inv.outstandingTotal();

  return (
    <section className="flex flex-col gap-4">
      <h2 className={screenTitle}>Fiados por cobrar</h2>

      <div className={surface + ' p-4'}>
        <p className="text-sm text-muted">Total por cobrar</p>
        <p className="text-2xl font-bold tabular-nums">{formatMoney(total)}</p>
        <p className="text-sm text-muted">
          {credits.length === 1 ? '1 fiado pendiente' : `${credits.length} fiados pendientes`}
        </p>
      </div>

      {credits.length === 0 ? (
        <div className={surface + ' p-5'}>
          <p className="font-semibold">No hay fiados pendientes</p>
          <p className="mt-1 text-muted">Cuando vendas a crédito, la deuda aparece aquí.</p>
        </div>
      ) : (
        <div className={surface + ' ' + rowDivider}>
          {credits.map((sale) => (
            <CreditRow key={sale.id} sale={sale} />
          ))}
        </div>
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
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold break-words">{sale.client || 'Sin nombre'}</div>
          <div className="text-sm text-muted break-words">
            {sale.quantity} × {productName}
          </div>
          <div className="text-sm text-muted tabular-nums">{formatDateShort(sale.datetime)}</div>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <div className="text-sm text-muted">Debe</div>
          <div className="font-semibold text-orange-700">{formatMoney(balance)}</div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
        <label className={field + ' min-w-0'}>
          <span className={fieldLabel}>Registrar abono</span>
          <input className={input} type="text" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </label>
        <button type="button" className={btnGhostSm} onClick={pay}>
          Abonar
        </button>
        <button type="button" className={btnPrimarySm} onClick={payAll}>
          Saldar
        </button>
      </div>
    </div>
  );
}
