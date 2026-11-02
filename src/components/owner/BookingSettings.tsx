// Configuración de la dueña para la auto-reserva: qué días trabaja, qué
// bloquea, las reglas del portal y el interruptor que lo abre o lo cierra.
// Toda la lógica de negocio vive en el store; aquí solo se arma la UI
// (INVARIANTE 5). Cero cálculos de dinero: esta pantalla no maneja precios.
import { useState, type FormEvent } from 'react';
import { formatClock, formatDateShort, formatTime } from '../../lib/format';
import { useStore } from '../../lib/store/StoreContext';
import { useToast } from '../Toast';
import { btnGhost, btnGhostSm, btnQuietDanger, field, fieldLabel, input, rowDivider, surface } from '../ui';

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function BookingSettings() {
  const store = useStore();
  const { notify } = useToast();
  const policy = store.bookingPolicy;

  const [weekday, setWeekday] = useState(1);
  const [opensAt, setOpensAt] = useState('09:00');
  const [closesAt, setClosesAt] = useState('18:00');

  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const publicUrl = policy ? `${window.location.origin}/reservar/${policy.public_slug}` : null;

  function handleTogglePortal() {
    const wasEnabled = policy?.enabled ?? false;
    store.updateBookingPolicy({ enabled: !wasEnabled });
    notify(wasEnabled ? 'Portal cerrado' : '✓ Portal abierto');
  }

  function handleCopyLink() {
    if (!publicUrl) return;
    navigator.clipboard?.writeText(publicUrl).then(
      () => notify('Enlace copiado'),
      () => notify('No se pudo copiar el enlace', 'error'),
    );
  }

  function handleAddHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (opensAt === '' || closesAt === '' || closesAt <= opensAt) {
      notify('La hora de cierre debe ser después de la de apertura', 'error');
      return;
    }
    store.setBusinessHours({ weekday, opens_at: opensAt, closes_at: closesAt });
    notify('✓ Horario añadido');
  }

  function handleAddBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blockStart === '' || blockEnd === '' || blockEnd <= blockStart) {
      notify('La fecha de fin debe ser después de la de inicio', 'error');
      return;
    }
    store.addTimeBlock({ starts_at: blockStart, ends_at: blockEnd, reason: blockReason.trim() });
    setBlockStart('');
    setBlockEnd('');
    setBlockReason('');
    notify('✓ Bloqueo añadido');
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={surface + ' flex flex-col gap-3 p-4'}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Reservas en línea</h2>
            <p className="text-sm text-muted">
              Con esto abierto, tus clientas pueden pedir su cita por su cuenta.
            </p>
          </div>
          {/* Interruptor: el campo nativo sigue siendo el control (teclado y lector de pantalla); la pista solo lo dibuja. */}
          <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2">
            <input
              className="peer sr-only"
              type="checkbox"
              role="switch"
              checked={policy?.enabled ?? false}
              onChange={handleTogglePortal}
            />
            <span
              aria-hidden="true"
              className="relative h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-green-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-700 motion-reduce:transition-none after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 motion-reduce:after:transition-none"
            />
            <span className="w-16 text-sm font-medium">{policy?.enabled ? 'Abierto' : 'Cerrado'}</span>
          </label>
        </div>
        {publicUrl && (
          <div className="flex items-center gap-2 rounded-xl bg-paper p-1 pl-3 ring-1 ring-line">
            <span className="min-w-0 flex-1 truncate text-sm text-muted">{publicUrl}</span>
            <button type="button" className={btnGhostSm} onClick={handleCopyLink}>
              Copiar enlace
            </button>
          </div>
        )}
      </section>

      <section className={surface + ' flex flex-col'}>
        <h2 className="p-4 pb-3 text-lg font-semibold">¿Qué días trabajas?</h2>
        {store.businessHours.length === 0 ? (
          <p className="px-4 pb-4 text-muted">Aún no has puesto tus horarios.</p>
        ) : (
          <ul className={'border-t border-line px-4 ' + rowDivider}>
            {[...store.businessHours]
              .sort((a, b) => a.weekday - b.weekday || a.opens_at.localeCompare(b.opens_at))
              .map((hours) => (
                <li key={hours.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 py-2">
                    <div className="font-medium">{WEEKDAY_LABELS[hours.weekday]}</div>
                    <div className="text-sm text-muted tabular-nums">
                      {formatClock(hours.opens_at)} – {formatClock(hours.closes_at)}
                    </div>
                  </div>
                  <button type="button" className={btnQuietDanger} onClick={() => store.removeBusinessHours(hours.id)}>
                    Quitar
                  </button>
                </li>
              ))}
          </ul>
        )}

        {/* Rejilla y no flex-wrap: en iOS los campos de hora traen un ancho propio
            y, como ítems flex sin ancho, se montaban uno sobre otro. */}
        <form onSubmit={handleAddHours} className="grid grid-cols-2 items-end gap-3 border-t border-line p-4 sm:grid-cols-4">
          <label className={field + ' col-span-2 sm:col-span-1'}>
            <span className={fieldLabel}>Día</span>
            <select className={input} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAY_LABELS.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            <span className={fieldLabel}>Desde</span>
            <input className={input} type="time" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
          </label>
          <label className={field}>
            <span className={fieldLabel}>Hasta</span>
            <input className={input} type="time" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          </label>
          <button type="submit" className={btnGhost + ' col-span-2 sm:col-span-1'}>
            Añadir horario
          </button>
        </form>
        <p className="px-4 pb-4 text-sm text-muted">
          Si trabajas mañana y tarde con almuerzo de por medio, añade dos horarios el mismo día.
        </p>
      </section>

      <section className={surface + ' flex flex-col'}>
        <div className="p-4 pb-3">
          <h2 className="text-lg font-semibold">Días que no atiendes</h2>
          <p className="text-sm text-muted">Vacaciones, un asunto personal, lo que necesites bloquear.</p>
        </div>
        {store.timeBlocks.length === 0 ? (
          <p className="px-4 pb-4 text-muted">No tienes nada bloqueado.</p>
        ) : (
          <ul className={'border-t border-line px-4 ' + rowDivider}>
            {[...store.timeBlocks]
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .map((block) => (
                <li key={block.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 py-2">
                    <div className="text-sm tabular-nums">
                      Del {formatDateShort(block.starts_at)} a las {formatTime(block.starts_at)}
                    </div>
                    <div className="text-sm tabular-nums">
                      al {formatDateShort(block.ends_at)} a las {formatTime(block.ends_at)}
                    </div>
                    {block.reason !== '' && <div className="text-sm text-muted break-words">{block.reason}</div>}
                  </div>
                  <button type="button" className={btnQuietDanger} onClick={() => store.removeTimeBlock(block.id)}>
                    Quitar
                  </button>
                </li>
              ))}
          </ul>
        )}

        <form onSubmit={handleAddBlock} className="grid grid-cols-1 gap-3 border-t border-line p-4 sm:grid-cols-2">
          <label className={field}>
            <span className={fieldLabel}>Desde</span>
            <input
              className={input}
              type="datetime-local"
              value={blockStart}
              onChange={(e) => setBlockStart(e.target.value)}
            />
          </label>
          <label className={field}>
            <span className={fieldLabel}>Hasta</span>
            <input className={input} type="datetime-local" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
          </label>
          <label className={field + ' sm:col-span-2'}>
            <span className={fieldLabel}>Motivo (opcional)</span>
            <input
              className={input}
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Ej: vacaciones"
            />
          </label>
          <button type="submit" className={btnGhost + ' sm:col-span-2'}>
            Bloquear esos días
          </button>
        </form>
      </section>

      <section className={surface + ' flex flex-col gap-4 p-4'}>
        <h2 className="text-lg font-semibold">Reglas de reserva</h2>
        <label className={field}>
          <span className={fieldLabel}>¿Con cuánta anticipación mínima necesitas que te avisen?</span>
          <div className="flex items-center gap-2">
            <input
              className={input + ' max-w-28'}
              type="number"
              min={0}
              value={policy?.min_notice_hours ?? 2}
              onChange={(e) => store.updateBookingPolicy({ min_notice_hours: Math.max(0, Number(e.target.value)) })}
            />
            <span className="text-sm text-muted">horas</span>
          </div>
        </label>
        <label className={field}>
          <span className={fieldLabel}>¿Hasta cuántos días por delante pueden reservar?</span>
          <div className="flex items-center gap-2">
            <input
              className={input + ' max-w-28'}
              type="number"
              min={1}
              value={policy?.max_horizon_days ?? 30}
              onChange={(e) => store.updateBookingPolicy({ max_horizon_days: Math.max(1, Number(e.target.value)) })}
            />
            <span className="text-sm text-muted">días</span>
          </div>
        </label>
        <label className={field}>
          <span className={fieldLabel}>¿Cuánto descanso quieres entre una clienta y la siguiente?</span>
          <div className="flex items-center gap-2">
            <input
              className={input + ' max-w-28'}
              type="number"
              min={0}
              value={policy?.buffer_min ?? 0}
              onChange={(e) => store.updateBookingPolicy({ buffer_min: Math.max(0, Number(e.target.value)) })}
            />
            <span className="text-sm text-muted">minutos</span>
          </div>
        </label>
      </section>
    </div>
  );
}
