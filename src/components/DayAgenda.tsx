// Pantalla de inicio: la agenda de HOY. Solo lee del store y muestra.
// No calcula dinero en el JSX (INVARIANTE 5): pide los valores ya calculados.
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, todayISODate } from '../lib/format';
import { AppointmentRow } from './AppointmentRow';
import { card } from './ui';

export function DayAgenda() {
  const store = useStore();
  const today = todayISODate();
  const appointments = store.appointmentsForDay(today);
  const projected = store.projectedProfitForDay(today);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agenda de hoy</h2>
        <div className="text-right">
          <div className="text-xs text-neutral-400">Ganancia proyectada</div>
          <div className="font-semibold text-rose-700">{formatMoney(projected)}</div>
        </div>
      </div>

      {appointments.length === 0 ? (
        <p className={card + ' text-neutral-500'}>No hay citas para hoy. Agenda la primera arriba.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {appointments.map((appointment) => (
            <AppointmentRow key={appointment.id} appointment={appointment} />
          ))}
        </ul>
      )}
    </section>
  );
}
