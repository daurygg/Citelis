// Reporte flexible de ganancias. Presets Día / Semana / Mes (con navegación) o un
// rango de fechas personalizado. Solo lectura: agrega valores ya congelados
// (INVARIANTE 2/5). Los gastos fijos (mensuales) se PRORRATEAN a los días del
// periodo elegido, así la ganancia neta es comparable en cualquier rango.
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { netProfit, proratedFixedExpenses } from '../lib/domain/reports';
import {
  dayRange,
  daysBetween,
  formatDateShort,
  formatMoney,
  monthLabel,
  monthRange,
  shiftISODate,
  shiftMonthISODate,
  todayISODate,
  weekRange,
} from '../lib/format';
import { FixedExpenses } from './FixedExpenses';
import { btnGhost, card, field, fieldLabel, input } from './ui';

type Mode = 'day' | 'week' | 'month' | 'range';

const MODES: { id: Mode; label: string }[] = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'range', label: 'Rango' },
];

export function PeriodReport() {
  const store = useStore();
  const today = todayISODate();
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(today); // una fecha dentro del periodo mostrado
  const [rangeFrom, setRangeFrom] = useState(today);
  const [rangeTo, setRangeTo] = useState(today);

  // Rango [from, to) y etiqueta según el modo elegido.
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
    to = `${shiftISODate(rangeTo, 1)}T00:00:00`; // +1 día para incluir el día final
    label = `${formatDateShort(rangeFrom)} – ${formatDateShort(rangeTo)}`;
  }

  const summary = store.weekReport(from, to);
  const days = Math.max(1, daysBetween(from, to));
  const periodFixed = proratedFixedExpenses(store.fixedExpensesTotal(), days);
  const net = netProfit(summary.gross_profit, periodFixed);

  const topService =
    summary.most_profitable_service &&
    store.services.find((s) => s.id === summary.most_profitable_service?.service_id);

  function navigate(direction: -1 | 1) {
    if (mode === 'day') setAnchor((a) => shiftISODate(a, direction));
    else if (mode === 'week') setAnchor((a) => shiftISODate(a, direction * 7));
    else if (mode === 'month') setAnchor((a) => shiftMonthISODate(a, direction));
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Reporte de ganancias</h2>

      {/* Selector de modo */}
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

      {/* Navegación (día/semana/mes) o selector de rango */}
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

      <p className="text-center text-sm text-neutral-500">{summary.completed_count} cita(s) completada(s)</p>

      <div className="grid grid-cols-2 gap-3">
        <div className={card}>
          <div className="text-sm text-neutral-500">Ingresos</div>
          <div className="text-xl font-bold">{formatMoney(summary.total_income)}</div>
        </div>
        <div className={card}>
          <div className="text-sm text-neutral-500">Costo de insumos</div>
          <div className="text-xl font-bold">{formatMoney(summary.total_cost)}</div>
        </div>
        <div className={card}>
          <div className="text-sm text-neutral-500">Ganancia de servicios</div>
          <div className="text-xl font-bold text-green-700">{formatMoney(summary.gross_profit)}</div>
        </div>
        <div className={card}>
          <div className="text-sm text-neutral-500">Gastos fijos (del periodo)</div>
          <div className="text-xl font-bold text-neutral-700">−{formatMoney(periodFixed)}</div>
        </div>
        <div className={card + ' col-span-2'}>
          <div className="text-sm text-neutral-500">Ganancia neta</div>
          <div className={'text-2xl font-bold ' + (net >= 0 ? 'text-green-700' : 'text-red-700')}>{formatMoney(net)}</div>
        </div>
      </div>

      <div className={card}>
        <div className="text-sm text-neutral-500">Servicio más rentable</div>
        {summary.most_profitable_service ? (
          <div className="font-semibold">
            {topService?.name ?? `Servicio ${summary.most_profitable_service.service_id}`}{' '}
            <span className="text-green-700">({formatMoney(summary.most_profitable_service.profit)})</span>
          </div>
        ) : (
          <div className="text-neutral-500">Sin citas completadas en este periodo.</div>
        )}
      </div>

      <FixedExpenses />
    </section>
  );
}
