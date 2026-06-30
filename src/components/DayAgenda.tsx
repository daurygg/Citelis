// Pantalla de inicio: la agenda de HOY. Solo lee del store y muestra.
// No calcula dinero en el JSX (INVARIANTE 5): pide los valores ya calculados.
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, todayISODate } from '../lib/format';
import { AppointmentRow } from './AppointmentRow';

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
          {appointments.map((appointment) => (
            <AppointmentRow key={appointment.id} appointment={appointment} />
          ))}
        </ul>
      )}
    </section>
  );
}
