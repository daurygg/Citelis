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
  const realized = store.dayReport(today); // lo YA ganado hoy (citas completadas)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Agenda de hoy</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className={card}>
          <div className="text-xs text-neutral-400">Ganado hoy</div>
          <div className="text-xl font-bold text-green-700">{formatMoney(realized.gross_profit)}</div>
          <div className="text-xs text-neutral-500">{realized.completed_count} completada(s)</div>
        </div>
        <div className={card}>
          <div className="text-xs text-neutral-400">Proyectado (pendientes)</div>
          <div className="text-xl font-bold text-rose-700">{formatMoney(projected)}</div>
          <div className="text-xs text-neutral-500">aún no realizado</div>
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
