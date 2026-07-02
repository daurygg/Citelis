// Reporte semanal de ganancias. Solo lectura: muestra valores ya agregados por
// weekSummary (dominio). No recalcula nada (INVARIANTE 2/5).
import { useStore } from '../lib/store/StoreContext';
import { currentWeekRange, formatDateShort, formatMoney } from '../lib/format';
import { card } from './ui';

export function WeekReport() {
  const store = useStore();
  const { from, to } = currentWeekRange();
  const summary = store.weekReport(from, to);

  const topService =
    summary.most_profitable_service &&
    store.services.find((s) => s.id === summary.most_profitable_service?.service_id);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Reporte de la semana</h2>
        <p className="text-sm text-neutral-500">
          Semana del {formatDateShort(from)} · {summary.completed_count} cita(s) completada(s)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={card}>
          <div className="text-sm text-neutral-500">Ingresos</div>
          <div className="text-xl font-bold">{formatMoney(summary.total_income)}</div>
        </div>
        <div className={card}>
          <div className="text-sm text-neutral-500">Costos</div>
          <div className="text-xl font-bold">{formatMoney(summary.total_cost)}</div>
        </div>
        <div className={card + ' col-span-2'}>
          <div className="text-sm text-neutral-500">Ganancia de servicios</div>
          <div className={'text-2xl font-bold ' + (summary.gross_profit >= 0 ? 'text-green-700' : 'text-red-700')}>
            {formatMoney(summary.gross_profit)}
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
    </section>
  );
}
