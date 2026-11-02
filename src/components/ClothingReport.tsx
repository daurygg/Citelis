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
import { btnIcon, btnQuietDanger, field, fieldLabel, input, rowDivider, screenTitle, segment, segmented, surface } from './ui';

type Mode = 'day' | 'week' | 'month' | 'range';
const MODES: { id: Mode; label: string }[] = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'range', label: 'Rango' },
];

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={dir === 'left' ? 'm10 3.5-4.5 4.5 4.5 4.5' : 'm6 3.5 4.5 4.5-4.5 4.5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
      <h2 className={screenTitle}>Reporte de ropa</h2>

      {/* Selector de modo */}
      <div className={segmented} role="group" aria-label="Periodo">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={segment(mode === m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Navegación (día/semana/mes) o selector de rango */}
      {mode === 'range' ? (
        <div className="grid grid-cols-2 gap-3">
          <label className={field}>
            <span className={fieldLabel}>Desde</span>
            <input className={input} type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value || today)} />
          </label>
          <label className={field}>
            <span className={fieldLabel}>Hasta</span>
            <input className={input} type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value || today)} />
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" className={btnIcon} onClick={() => navigate(-1)} aria-label="Anterior">
            <Chevron dir="left" />
          </button>
          <div className="min-w-0 flex-1 text-center font-semibold capitalize">{label}</div>
          <button type="button" className={btnIcon} onClick={() => navigate(1)} aria-label="Siguiente">
            <Chevron dir="right" />
          </button>
        </div>
      )}

      {/* Igual que el reporte de servicios en forma, pero con sus propias cifras (servicios y ropa no se mezclan). */}
      <div className={surface + ' overflow-hidden'}>
        <div className="p-4">
          <p className="text-sm text-muted">Ganancia</p>
          <p className={'text-2xl font-bold tabular-nums ' + (summary.total_profit >= 0 ? 'text-green-700' : 'text-red-700')}>
            {formatMoney(summary.total_profit)}
          </p>
          <p className="text-sm text-muted tabular-nums">
            {summary.units_sold === 1 ? '1 unidad vendida' : `${summary.units_sold} unidades vendidas`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line tabular-nums">
          <div className="bg-white p-4">
            <dt className="text-sm text-muted">Ingresos</dt>
            <dd className="font-semibold">{formatMoney(summary.total_revenue)}</dd>
          </div>
          <div className="bg-white p-4">
            <dt className="text-sm text-muted">Costo</dt>
            <dd className="font-semibold">{formatMoney(summary.total_cost)}</dd>
          </div>
        </dl>
      </div>

      <div className={surface + ' p-4'}>
        <p className="text-sm text-muted">Más vendido</p>
        {summary.best_seller ? (
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 font-semibold">
            <span className="min-w-0 break-words">
              {topProduct?.name ?? `Producto ${summary.best_seller.product_id}`}
            </span>
            <span className="text-muted tabular-nums">
              {summary.best_seller.units === 1 ? '1 unidad' : `${summary.best_seller.units} unidades`}
            </span>
          </p>
        ) : (
          <p className="text-muted">Sin ventas en este periodo.</p>
        )}
      </div>

      <div className={surface + ' flex flex-col'}>
        <h3 className="p-4 pb-3 font-semibold">Ventas del periodo</h3>
        {periodSales.length === 0 ? (
          <p className="px-4 pb-4 text-muted">No hay ventas registradas en este periodo.</p>
        ) : (
          <ul className={'border-t border-line px-4 ' + rowDivider}>
            {periodSales.map((sale) => (
              <li key={sale.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 py-3">
                  <div className="font-medium break-words">
                    {sale.quantity} × {productName(sale.product_id)}
                  </div>
                  <div className="text-sm text-muted tabular-nums">
                    {formatDateShort(sale.datetime)} a las {formatTime(sale.datetime)}
                  </div>
                </div>
                <div className="shrink-0 font-semibold tabular-nums">{formatMoney(saleRevenue(sale))}</div>
                <button type="button" className={btnQuietDanger} onClick={() => handleDeleteSale(sale.id)}>
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
