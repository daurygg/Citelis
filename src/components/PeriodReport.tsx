// Reporte flexible de ganancias. Presets Día / Semana / Mes (con navegación) o un
// rango de fechas personalizado. Solo lectura: agrega valores ya congelados
// (INVARIANTE 2/5). Los gastos fijos (mensuales) se PRORRATEAN a los días del
// periodo elegido, así la ganancia neta es comparable en cualquier rango.
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { netProfit, proratedFixedExpenses } from '../lib/domain/reports';
import { PAYMENT_METHODS, paymentMethodLabel } from '../lib/domain/payments';
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
import { btnIcon, field, fieldLabel, input, screenTitle, segment, segmented, surface } from './ui';

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
  const income = store.incomeByMethod(from, to);
  const days = Math.max(1, daysBetween(from, to));
  // Mes de referencia del periodo (el mes en que empieza).
  const monthKey = from.slice(0, 7); // 'YYYY-MM'
  const monthTotal = store.monthExpensesTotal(monthKey);
  // En modo Mes se restan los gastos reales del mes; en otros modos se prorratean.
  const periodFixed = mode === 'month' ? monthTotal : proratedFixedExpenses(monthTotal, days);
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
      <h2 className={screenTitle}>Reporte de ganancias</h2>

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

      {/* Las cifras del periodo en una sola franja: la ganancia neta manda y las cuatro de abajo la explican. */}
      <div className={surface + ' overflow-hidden'}>
        <div className="p-4">
          <p className="text-sm text-muted">Ganancia neta</p>
          <p className={'text-2xl font-bold tabular-nums ' + (net >= 0 ? 'text-green-700' : 'text-red-700')}>{formatMoney(net)}</p>
          <p className="text-sm text-muted">
            {summary.completed_count === 1 ? '1 cita completada' : `${summary.completed_count} citas completadas`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line tabular-nums">
          <div className="bg-white p-4">
            <dt className="text-sm text-muted">Ingresos</dt>
            <dd className="font-semibold">{formatMoney(summary.total_income)}</dd>
          </div>
          <div className="bg-white p-4">
            <dt className="text-sm text-muted">Costo de insumos</dt>
            <dd className="font-semibold">{formatMoney(summary.total_cost)}</dd>
          </div>
          <div className="bg-white p-4">
            <dt className="text-sm text-muted">Ganancia de servicios</dt>
            <dd className="font-semibold text-green-700">{formatMoney(summary.gross_profit)}</dd>
          </div>
          <div className="bg-white p-4">
            <dt className="text-sm text-muted">Gastos fijos del periodo</dt>
            <dd className="font-semibold">−{formatMoney(periodFixed)}</dd>
          </div>
        </dl>
      </div>

      <div className={surface + ' p-4'}>
        <p className="text-sm text-muted">Servicio más rentable</p>
        {summary.most_profitable_service ? (
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 font-semibold">
            <span className="min-w-0 break-words">
              {topService?.name ?? `Servicio ${summary.most_profitable_service.service_id}`}
            </span>
            <span className="tabular-nums text-green-700">{formatMoney(summary.most_profitable_service.profit)}</span>
          </p>
        ) : (
          <p className="text-muted">Sin citas completadas en este periodo.</p>
        )}
      </div>

      {/* Lo pagado por vía NO es lo mismo que lo cobrado cuando hay crédito: se ven
          las dos cifras y la diferencia. Cada pago cuenta en el periodo de su cita. */}
      {summary.completed_count > 0 && (
        <div className={surface + ' p-4'}>
          <h3 className="font-semibold">¿Cómo te pagaron?</h3>
          <p className="text-sm text-muted">Citas de este periodo</p>
          <dl className="mt-2 flex flex-col tabular-nums">
            {PAYMENT_METHODS.map((method) => (
              <div key={method} className="flex justify-between gap-3 py-1">
                <dt className="text-muted">{paymentMethodLabel(method)}</dt>
                <dd>{formatMoney(income.by_method[method])}</dd>
              </div>
            ))}
            {income.by_method.unknown > 0 && (
              <div className="flex justify-between gap-3 py-1">
                <dt className="text-muted">{paymentMethodLabel(null)}</dt>
                <dd>{formatMoney(income.by_method.unknown)}</dd>
              </div>
            )}
            <div className="mt-1 flex justify-between gap-3 border-t border-line pt-2">
              <dt className="text-muted">Ya pagado</dt>
              <dd className="font-semibold">{formatMoney(income.total_paid)}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-muted">Cobrado en total</dt>
              <dd>{formatMoney(income.total_charged)}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-muted">Quedó a crédito</dt>
              <dd className={'font-semibold ' + (income.pending_credit > 0 ? 'text-orange-700' : '')}>{formatMoney(income.pending_credit)}</dd>
            </div>
          </dl>
        </div>
      )}

      <FixedExpenses month={monthKey} />
    </section>
  );
}
