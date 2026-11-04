// Pantalla de inicio: la agenda de un día (por defecto hoy, con navegación a
// otros días). Solo lee del store y muestra. No calcula dinero en el JSX
// (INVARIANTE 5): pide los valores ya calculados.
import { useRef, useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { dayHeading } from '../lib/agendaDay';
import { formatMoney, shiftISODate, todayISODate } from '../lib/format';
import { AppointmentRow } from './AppointmentRow';
import { pendingSetupSteps, type SetupStepId } from '../lib/domain/onboardingSetup';
import { btnPrimarySm } from './ui';

const iconButton =
  'grid size-11 shrink-0 place-items-center rounded-xl bg-white text-ink ring-1 ring-line transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={dir === 'left' ? 'm10 3.5-4.5 4.5 4.5 4.5' : 'm6 3.5 4.5 4.5-4.5 4.5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DayAgenda({ onGoTo }: { onGoTo: (step: SetupStepId) => void }) {
  const store = useStore();
  const today = todayISODate();
  const [date, setDate] = useState(today);
  const dateInput = useRef<HTMLInputElement>(null);

  const appointments = store.appointmentsForDay(date);
  const projected = store.projectedProfitForDay(date);
  const realized = store.dayReport(date); // lo YA ganado ese día (citas completadas)
  const isToday = date === today;
  const heading = dayHeading(date, today);
  // Qué le falta configurar al negocio (decisión en dominio puro; aquí solo se pinta).
  const setupSteps = pendingSetupSteps({
    serviceCount: store.services.length,
    hoursDays: new Set(store.businessHours.map((h) => h.weekday)).size,
    bookingOpen: store.bookingPolicy?.enabled ?? false,
  });

  return (
    <section className="flex flex-col gap-4">
      {/* Encabezado del día: el día y la fecha son el selector de fecha. */}
      <div className="flex items-center gap-2">
        <button type="button" className={iconButton} onClick={() => setDate((d) => shiftISODate(d, -1))} aria-label="Día anterior">
          <Chevron dir="left" />
        </button>
        <div className="relative min-h-11 min-w-0 flex-1 rounded-xl px-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-700">
          <div className="pointer-events-none">
            <h2 className="flex items-baseline gap-2 text-[1.75rem] leading-tight font-semibold tracking-tight capitalize">
              {heading.weekday}
              {heading.relative && (
                <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-sm font-medium tracking-normal normal-case">
                  {heading.relative}
                </span>
              )}
            </h2>
            <p className="text-muted">{heading.date}</p>
          </div>
          {/* El input cubre el encabezado: tocarlo abre el selector de fecha del teléfono. */}
          <input
            ref={dateInput}
            type="date"
            aria-label="Elegir otra fecha"
            className="absolute inset-0 size-full min-h-0 cursor-pointer opacity-0"
            value={date}
            onChange={(e) => setDate(e.target.value || today)}
            onClick={() => {
              try {
                dateInput.current?.showPicker?.();
              } catch {
                /* Sin showPicker: el navegador abre su selector por su cuenta. */
              }
            }}
          />
        </div>
        <button type="button" className={iconButton} onClick={() => setDate((d) => shiftISODate(d, 1))} aria-label="Día siguiente">
          <Chevron dir="right" />
        </button>
      </div>

      {!isToday && (
        <button
          type="button"
          className="-mt-2 min-h-11 self-start rounded-lg px-1 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-700"
          onClick={() => setDate(today)}
        >
          Volver a hoy
        </button>
      )}

      {/* Las tres cifras del día en una sola franja: Ganado manda, las otras dos acompañan. */}
      <div className="grid grid-cols-[1.15fr_1fr] gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
        <div>
          <p className="text-sm text-muted">Ganado</p>
          <p className="text-2xl font-bold tabular-nums text-green-700">{formatMoney(realized.gross_profit)}</p>
          <p className="text-sm text-muted">
            {realized.completed_count === 1 ? '1 cita completada' : `${realized.completed_count} citas completadas`}
          </p>
        </div>
        <dl className="flex flex-col justify-between gap-2 border-l border-line pl-4">
          <div>
            <dt className="text-sm text-muted">Proyectado</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(projected)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Cobrado</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(realized.total_income)}</dd>
          </div>
        </dl>
      </div>

      {appointments.length === 0 ? (
        setupSteps.length > 0 && isToday ? (
          /* Guía de primeros pasos (onboarding): qué le falta configurar al negocio. */
          <div className="rounded-2xl bg-white ring-1 ring-line">
            <div className="p-5 pb-3">
              <h2 className="font-semibold">Para empezar</h2>
              <p className="mt-1 text-muted">Aún no tienes citas hoy. Deja tu negocio listo:</p>
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {setupSteps.map((step) => (
                <li key={step.id} className="flex items-center justify-between gap-3 px-5 py-2">
                  <span className="min-w-0">{step.label}</span>
                  <button type="button" className={btnPrimarySm + ' shrink-0'} onClick={() => onGoTo(step.id)}>
                    Ir
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-5 ring-1 ring-line">
            <p className="font-semibold">{isToday ? 'No hay citas para hoy' : 'No hay citas para este día'}</p>
            <p className="mt-1 text-muted">
              {isToday ? 'Cuando agendes una, aparece aquí.' : 'Prueba otro día o agenda una cita.'}
            </p>
          </div>
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {appointments.map((appointment) => (
            <AppointmentRow key={appointment.id} appointment={appointment} />
          ))}
        </ul>
      )}
    </section>
  );
}
