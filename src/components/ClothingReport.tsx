// Reporte de ventas de ropa: presets Día/Semana/Mes o rango. Solo lectura,
// agrega valores ya congelados (salesSummary del dominio de inventario).
import { useState } from 'react';
import { useInventory } from '../lib/store/InventoryContext';
import { saleRevenue } from '../lib/domain/inventory/sales';
import {
  dayRange,
  formatDateShort,
  formatMoney,
  formatTime,
  monthLabel,
  monthRange,
  shiftISODate,
  shiftMonthISODate,
  todayISODate,
  weekRange,
} from '../lib/format';
import { useToast } from './Toast';
import { btnGhost, card, field, fieldLabel, input } from './ui';

type Mode = 'day' | 'week' | 'month' | 'range';
const MODES: { id: Mode; label: string }[] = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'range', label: 'Rango' },
];

export function ClothingReport() {
  const inv = useInventory();
  const { notify } = useToast();
  const today = todayISODate();
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(today);
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(today);

  let from: string;
  let to: string;
  let label: string;
  if (mode === 'day') {
    ({ from, to } = dayRange(anchor));
    label = formatDateShort(anchor);
  } else if (mode === 'week') {
    ({ from, to } = weekRange(anchor));
    label = `Semana del ${formatDateShort(from)}`;
  } else if (mode === 'month') {
    ({ from, to } = monthRange(anchor));
    label = monthLabel(anchor);
  } else {
    from = `${rangeFrom}T00:00:00`;
    to = `${shiftISODate(rangeTo, 1)}T00:00:00`;
    label = `${formatDateShort(rangeFrom)} – ${formatDateShort(rangeTo)}`;
  }

  const summary = inv.salesReport(from, to);
  const periodSales = inv.salesInPeriod(from, to);
  const topProduct =
    summary.best_seller && inv.products.find((p) => p.id === summary.best_seller?.product_id);

  function productName(id: number): string {
    return inv.products.find((p) => p.id === id)?.name ?? `Producto ${id}`;
  }

  function handleDeleteSale(saleId: number) {
    if (!window.confirm('¿Eliminar esta venta? El stock volverá a su lugar.')) return;
    inv.deleteSale(saleId);
    notify('Venta eliminada, stock restaurado');
  }

  function navigate(direction: -1 | 1) {
    if (mode === 'day') setAnchor((a) => shiftISODate(a, direction));
    else if (mode === 'week') setAnchor((a) => shiftISODate(a, direction * 7));
    else if (mode === 'month') setAnchor((a) => shiftMonthISODate(a, direction));
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Reporte de ropa</h2>

      <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={
              'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ' +
              (mode === m.id ? 'bg-white text-rose-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800')
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'range' ? (
        <div className="flex flex-wrap gap-3">
          <label className={field + ' flex-1'}>
            <span className={fieldLabel}>Desde</span>
            <input className={input} type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value || today)} />
          </label>
          <label className={field + ' flex-1'}>
            <span className={fieldLabel}>Hasta</span>
            <input className={input} type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value || today)} />
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" className={btnGhost + ' px-3 py-1.5'} onClick={() => navigate(-1)} aria-label="Anterior">
            ‹
          </button>
          <div className="flex-1 text-center font-semibold capitalize">{label}</div>
          <button type="button" className={btnGhost + ' px-3 py-1.5'} onClick={() => navigate(1)} aria-label="Siguiente">
            ›
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className={card}>
          <div className="text-sm text-neutral-500">Unidades vendidas</div>
          <div className="text-xl font-bold">{summary.units_sold}</div>
        </div>
        <div className={card}>
          <div className="text-sm text-neutral-500">Ingresos</div>
          <div className="text-xl font-bold">{formatMoney(summary.total_revenue)}</div>
        </div>
        <div className={card}>
          <div className="text-sm text-neutral-500">Costo</div>
          <div className="text-xl font-bold">{formatMoney(summary.total_cost)}</div>
        </div>
        <div className={card}>
          <div className="text-sm text-neutral-500">Ganancia</div>
          <div className={'text-xl font-bold ' + (summary.total_profit >= 0 ? 'text-green-700' : 'text-red-700')}>
            {formatMoney(summary.total_profit)}
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="text-sm text-neutral-500">Más vendido</div>
        {summary.best_seller ? (
          <div className="font-semibold">
            {topProduct?.name ?? `Producto ${summary.best_seller.product_id}`}{' '}
            <span className="text-neutral-500">({summary.best_seller.units} u.)</span>
          </div>
        ) : (
          <div className="text-neutral-500">Sin ventas en este periodo.</div>
        )}
      </div>

      <div className={card + ' flex flex-col gap-2'}>
        <h3 className="font-semibold">Ventas del periodo</h3>
        {periodSales.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay ventas registradas en este periodo.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100">
            {periodSales.map((sale) => (
              <li key={sale.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {sale.quantity} × {productName(sale.product_id)}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {formatDateShort(sale.datetime)} · {formatTime(sale.datetime)} · {formatMoney(saleRevenue(sale))}
                  </div>
                </div>
                <button type="button" className="shrink-0 text-sm text-red-600 hover:underline" onClick={() => handleDeleteSale(sale.id)}>
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
