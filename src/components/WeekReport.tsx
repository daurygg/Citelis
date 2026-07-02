// Reporte semanal de ganancias. Solo lectura: muestra valores ya agregados por
// weekSummary (dominio). No recalcula nada (INVARIANTE 2/5).
// Distingue ganancia BRUTA (servicios) de NETA (bruta − gastos fijos del negocio).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { netProfit } from '../lib/domain/reports';
import { currentWeekRange, formatDateShort, formatMoney, shiftISODate, todayISODate, weekRange } from '../lib/format';
import { FixedExpenses } from './FixedExpenses';
import { btnGhost, card } from './ui';

export function WeekReport() {
  const store = useStore();
  const [anchor, setAnchor] = useState(todayISODate()); // una fecha dentro de la semana mostrada
  const { from, to } = weekRange(anchor);
  const isThisWeek = from === currentWeekRange().from;

  const summary = store.weekReport(from, to);
  const fixedTotal = store.fixedExpensesTotal();
  const net = netProfit(summary.gross_profit, fixedTotal);

  const topService =
    summary.most_profitable_service &&
    store.services.find((s) => s.id === summary.most_profitable_service?.service_id);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btnGhost + ' px-3 py-1.5'}
          onClick={() => setAnchor((a) => shiftISODate(a, -7))}
          aria-label="Semana anterior"
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <h2 className="font-semibold">
            Semana del {formatDateShort(from)} {isThisWeek && <span className="text-rose-700">(actual)</span>}
          </h2>
          <p className="text-sm text-neutral-500">{summary.completed_count} cita(s) completada(s)</p>
        </div>
        <button
          type="button"
          className={btnGhost + ' px-3 py-1.5'}
          onClick={() => setAnchor((a) => shiftISODate(a, 7))}
          aria-label="Semana siguiente"
        >
          ›
        </button>
      </div>

      {!isThisWeek && (
        <button type="button" className="self-center text-sm text-rose-700 hover:underline" onClick={() => setAnchor(todayISODate())}>
          Volver a la semana actual
        </button>
      )}

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
          <div className="text-sm text-neutral-500">Gastos fijos (mes)</div>
          <div className="text-xl font-bold text-neutral-700">−{formatMoney(fixedTotal)}</div>
        </div>
        <div className={card + ' col-span-2'}>
          <div className="text-sm text-neutral-500">Ganancia neta (después de gastos fijos)</div>
          <div className={'text-2xl font-bold ' + (net >= 0 ? 'text-green-700' : 'text-red-700')}>
            {formatMoney(net)}
          </div>
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
          <div className="text-neutral-500">Aún no hay citas completadas esta semana.</div>
        )}
      </div>

      <FixedExpenses />
    </section>
  );
}
