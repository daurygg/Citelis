// Pantalla de inicio: la agenda de un día (por defecto hoy, con navegación a
// otros días). Solo lee del store y muestra. No calcula dinero en el JSX
// (INVARIANTE 5): pide los valores ya calculados.
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatDateShort, formatMoney, shiftISODate, todayISODate } from '../lib/format';
import { AppointmentRow } from './AppointmentRow';
import { btnGhost, card } from './ui';

export function DayAgenda() {
  const store = useStore();
  const today = todayISODate();
  const [date, setDate] = useState(today);

  const appointments = store.appointmentsForDay(date);
  const projected = store.projectedProfitForDay(date);
  const realized = store.dayReport(date); // lo YA ganado ese día (citas completadas)
  const isToday = date === today;

  return (
    <section className="flex flex-col gap-3">
      {/* Navegador de día */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btnGhost + ' px-3 py-1.5'}
          onClick={() => setDate((d) => shiftISODate(d, -1))}
          aria-label="Día anterior"
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <div className="font-semibold">
            {formatDateShort(date)} {isToday && <span className="text-rose-700">(hoy)</span>}
          </div>
          <input
            type="date"
            className="mt-1 text-sm text-neutral-500 outline-none"
            value={date}
            onChange={(e) => setDate(e.target.value || today)}
          />
        </div>
        <button
          type="button"
          className={btnGhost + ' px-3 py-1.5'}
          onClick={() => setDate((d) => shiftISODate(d, 1))}
          aria-label="Día siguiente"
        >
          ›
        </button>
      </div>

      {!isToday && (
        <button type="button" className="self-center text-sm text-rose-700 hover:underline" onClick={() => setDate(today)}>
          Volver a hoy
        </button>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className={card}>
          <div className="text-xs text-neutral-400">Ganado</div>
          <div className="text-xl font-bold text-green-700">{formatMoney(realized.gross_profit)}</div>
          <div className="text-xs text-neutral-500">{realized.completed_count} completada(s)</div>
        </div>
        <div className={card}>
          <div className="text-xs text-neutral-400">Proyectado (pendientes)</div>
          <div className="text-xl font-bold text-rose-700">{formatMoney(projected)}</div>
          <div className="text-xs text-neutral-500">aún no realizado</div>
        </div>

        <div className={card}>
          <div className="text-xs text-neutral-400">Cobrado</div>
          <div className="text-xl font-bold">{formatMoney(realized.total_income)}</div>
        </div>
      </div>

      {appointments.length === 0 ? (
        <p className={card + ' text-neutral-500'}>
          {isToday ? 'No hay citas para hoy. Agenda la primera arriba.' : 'No hay citas para este día.'}
        </p>
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
