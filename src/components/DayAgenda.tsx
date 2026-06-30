// Pantalla de inicio: la agenda de HOY. Solo lee del store y muestra.
// No calcula dinero en el JSX (INVARIANTE 5): pide los valores ya calculados.
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, formatTime, statusLabel, todayISODate } from '../lib/format';
import type { AppointmentStatus } from '../lib/domain/types';

// Color por estado (presentación pura, derivada del dato).
const STATUS_COLOR: Record<AppointmentStatus, string> = {
  PENDING: '#b45309', // ámbar
  IN_PROGRESS: '#1d4ed8', // azul
  COMPLETED: '#15803d', // verde
  CANCELED: '#6b7280', // gris
};

export function DayAgenda() {
  const store = useStore();
  const today = todayISODate();
  const appointments = store.appointmentsForDay(today);
  const projected = store.projectedProfitForDay(today);

  return (
    <section>
      <h2>Agenda de hoy</h2>
      <p style={{ color: '#6b7280' }}>
        Ganancia proyectada del día: <strong>{formatMoney(projected)}</strong>{' '}
        <em>(estimada, aún no realizada)</em>
      </p>

      {appointments.length === 0 ? (
        <p>No hay citas para hoy. Agenda la primera.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.5rem' }}>
          {appointments.map((appointment) => {
            const service = store.services.find((s) => s.id === appointment.service_id);
            return (
              <li
                key={appointment.id}
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'baseline',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: '0.5rem 0.75rem',
                }}
              >
                <strong style={{ width: '3.5rem' }}>{formatTime(appointment.datetime)}</strong>
                <span style={{ flex: 1 }}>{appointment.client}</span>
                <span style={{ color: '#6b7280' }}>{service?.name ?? 'Servicio desconocido'}</span>
                <span style={{ color: STATUS_COLOR[appointment.status], fontWeight: 600 }}>
                  {statusLabel(appointment.status)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
