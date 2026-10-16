// Pantalla de inicio: la agenda de un día (por defecto hoy, con navegación a
// otros días). Solo lee del store y muestra. No calcula dinero en el JSX
// (INVARIANTE 5): pide los valores ya calculados.
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatDateShort, formatMoney, shiftISODate, todayISODate } from '../lib/format';
import { AppointmentRow } from './AppointmentRow';
import { pendingSetupSteps, type SetupStepId } from '../lib/domain/onboardingSetup';
import { btnGhost, btnPrimarySm, card, kpi } from './ui';

export function DayAgenda({ onGoTo }: { onGoTo: (step: SetupStepId) => void }) {
  const store = useStore();
  const today = todayISODate();
  const [date, setDate] = useState(today);

  const appointments = store.appointmentsForDay(date);
  const projected = store.projectedProfitForDay(date);
  const realized = store.dayReport(date); // lo YA ganado ese día (citas completadas)
  const isToday = date === today;
  // Qué le falta configurar al negocio (decisión en dominio puro; aquí solo se pinta).
  const setupSteps = pendingSetupSteps({
    serviceCount: store.services.length,
    hoursDays: new Set(store.businessHours.map((h) => h.weekday)).size,
    bookingOpen: store.bookingPolicy?.enabled ?? false,
  });

  return (
    <section className="flex flex-col gap-3">
      {/* Navegador de día */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btnGhost + ' px-3'}
          onClick={() => setDate((d) => shiftISODate(d, -1))}
          aria-label="Día anterior"
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <div className="font-semibold">
            {formatDateShort(date)} {isToday && <span className="text-brand-700">(hoy)</span>}
          </div>
          <input
            type="date"
            className="mt-1 min-h-11 text-base text-neutral-500 outline-none"
            value={date}
            onChange={(e) => setDate(e.target.value || today)}
          />
        </div>
        <button
          type="button"
          className={btnGhost + ' px-3'}
          onClick={() => setDate((d) => shiftISODate(d, 1))}
          aria-label="Día siguiente"
        >
          ›
        </button>
      </div>

      {!isToday && (
        <button type="button" className="self-center text-sm text-brand-700 hover:underline" onClick={() => setDate(today)}>
          Volver a hoy
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className={kpi}>
          <div className="text-xs text-neutral-400">Ganado</div>
          <div className="text-lg font-bold text-green-700">{formatMoney(realized.gross_profit)}</div>
          <div className="text-xs text-neutral-500">{realized.completed_count} completada(s)</div>
        </div>
        <div className={kpi}>
          <div className="text-xs text-neutral-400">Proyectado (pendientes)</div>
          <div className="text-lg font-bold text-brand-700">{formatMoney(projected)}</div>
          <div className="text-xs text-neutral-500">aún no realizado</div>
        </div>

        <div className={kpi + ' col-span-2'}>
          <div className="text-xs text-neutral-400">Cobrado</div>
          <div className="text-lg font-bold">{formatMoney(realized.total_income)}</div>
        </div>
      </div>

      {appointments.length === 0 ? (
        setupSteps.length > 0 && isToday ? (
          <div className={card + ' flex flex-col gap-3'}>
            <div>
              <h2 className="font-semibold">Para empezar</h2>
              <p className="text-sm text-neutral-500">Aún no tienes citas hoy. Deja tu negocio listo:</p>
            </div>
            <ul className="flex flex-col gap-2">
              {setupSteps.map((step) => (
                <li key={step.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-sm">{step.label}</span>
                  <button type="button" className={btnPrimarySm + ' shrink-0'} onClick={() => onGoTo(step.id)}>
                    Ir
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className={card + ' text-neutral-500'}>
            {isToday ? 'No hay citas para hoy. Agenda la primera arriba.' : 'No hay citas para este día.'}
          </p>
        )
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
