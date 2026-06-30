// Reporte semanal de ganancias. Solo lectura: muestra valores ya agregados por
// weekSummary (dominio). No recalcula nada (INVARIANTE 2/5).
import { useStore } from '../lib/store/StoreContext';
import { currentWeekRange, formatDateShort, formatMoney } from '../lib/format';

const cardStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '1rem',
  flex: '1 1 8rem',
};

export function WeekReport() {
  const store = useStore();
  const { from, to } = currentWeekRange();
  const summary = store.weekReport(from, to);

  const topService =
    summary.most_profitable_service &&
    store.services.find((s) => s.id === summary.most_profitable_service?.service_id);

  return (
    <section>
      <h2>Reporte de la semana</h2>
      <p style={{ color: '#6b7280' }}>
        Semana del {formatDateShort(from)} · {summary.completed_count} cita(s) completada(s)
      </p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={cardStyle}>
          <div style={{ color: '#6b7280' }}>Ingresos</div>
          <strong style={{ fontSize: '1.25rem' }}>{formatMoney(summary.total_income)}</strong>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#6b7280' }}>Costos</div>
          <strong style={{ fontSize: '1.25rem' }}>{formatMoney(summary.total_cost)}</strong>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#6b7280' }}>Ganancia neta</div>
          <strong style={{ fontSize: '1.25rem', color: summary.net_profit >= 0 ? '#15803d' : '#b91c1c' }}>
            {formatMoney(summary.net_profit)}
          </strong>
        </div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <span style={{ color: '#6b7280' }}>Servicio más rentable: </span>
        {summary.most_profitable_service ? (
          <strong>
            {topService?.name ?? `Servicio ${summary.most_profitable_service.service_id}`} (
            {formatMoney(summary.most_profitable_service.profit)})
          </strong>
        ) : (
          <em>aún no hay citas completadas esta semana</em>
        )}
      </div>
    </section>
  );
}
