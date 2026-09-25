// Configuración de la dueña para la auto-reserva: qué días trabaja, qué
// bloquea, las reglas del portal y el interruptor que lo abre o lo cierra.
// Toda la lógica de negocio vive en el store; aquí solo se arma la UI
// (INVARIANTE 5). Cero cálculos de dinero: esta pantalla no maneja precios.
import { useState, type FormEvent } from 'react';
import { useStore } from '../../lib/store/StoreContext';
import { useToast } from '../Toast';
import { btnGhost, card, field, fieldLabel, input } from '../ui';

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
      <div className={card + ' flex flex-col gap-3'}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Reservas en línea</h2>
            <p className="text-sm text-neutral-500">
              Con esto abierto, tus clientas pueden pedir su cita por su cuenta.
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={policy?.enabled ?? false} onChange={handleTogglePortal} />
            <span className="text-sm font-medium">{policy?.enabled ? 'Abierto' : 'Cerrado'}</span>
          </label>
        </div>
        {publicUrl && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-3">
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">{publicUrl}</span>
            <button type="button" className={btnGhost + ' px-3 py-1.5 text-sm'} onClick={handleCopyLink}>
              Copiar enlace
            </button>
          </div>
        )}
      </div>

      <div className={card + ' flex flex-col gap-3'}>
        <h2 className="text-lg font-semibold">¿Qué días trabajas?</h2>
        {store.businessHours.length === 0 ? (
          <p className="text-sm text-neutral-500">Aún no has puesto tus horarios.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100">
            {[...store.businessHours]
              .sort((a, b) => a.weekday - b.weekday || a.opens_at.localeCompare(b.opens_at))
              .map((hours) => (
                <li key={hours.id} className="flex items-center justify-between py-2">
                  <span>
                    {WEEKDAY_LABELS[hours.weekday]}: {hours.opens_at} – {hours.closes_at}
                  </span>
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => store.removeBusinessHours(hours.id)}
                  >
                    Quitar
                  </button>
                </li>
              ))}
          </ul>
        )}

        <form onSubmit={handleAddHours} className="flex flex-wrap items-end gap-3">
          <label className={field}>
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
          <button type="submit" className={btnGhost}>
            Añadir
          </button>
        </form>
        <p className="text-xs text-neutral-500">
          Si trabajas mañana y tarde con almuerzo de por medio, añade dos horarios el mismo día.
        </p>
      </div>

      <div className={card + ' flex flex-col gap-3'}>
        <h2 className="text-lg font-semibold">Días que no atiendes</h2>
        <p className="text-sm text-neutral-500">Vacaciones, un asunto personal, lo que necesites bloquear.</p>
        {store.timeBlocks.length === 0 ? (
          <p className="text-sm text-neutral-500">No tienes nada bloqueado.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100">
            {[...store.timeBlocks]
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .map((block) => (
                <li key={block.id} className="flex items-center justify-between py-2">
                  <div>
                    <div>
                      {block.starts_at.replace('T', ' ')} → {block.ends_at.replace('T', ' ')}
                    </div>
                    {block.reason !== '' && <div className="text-sm text-neutral-500">{block.reason}</div>}
                  </div>
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => store.removeTimeBlock(block.id)}
                  >
                    Quitar
                  </button>
                </li>
              ))}
          </ul>
        )}

        <form onSubmit={handleAddBlock} className="flex flex-wrap items-end gap-3">
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
          <label className={field + ' min-w-[10rem] flex-1'}>
            <span className={fieldLabel}>Motivo (opcional)</span>
            <input
              className={input}
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Ej: vacaciones"
            />
          </label>
          <button type="submit" className={btnGhost}>
            Bloquear
          </button>
        </form>
      </div>

      <div className={card + ' flex flex-col gap-3'}>
        <h2 className="text-lg font-semibold">Reglas de reserva</h2>
        <label className={field}>
          <span className={fieldLabel}>¿Con cuánta anticipación mínima necesitas que te avisen?</span>
          <div className="flex items-center gap-2">
            <input
              className={input}
              type="number"
              min={0}
              value={policy?.min_notice_hours ?? 2}
              onChange={(e) => store.updateBookingPolicy({ min_notice_hours: Math.max(0, Number(e.target.value)) })}
            />
            <span className="text-sm text-neutral-500">horas</span>
          </div>
        </label>
        <label className={field}>
          <span className={fieldLabel}>¿Hasta cuántos días por delante pueden reservar?</span>
          <div className="flex items-center gap-2">
            <input
              className={input}
              type="number"
              min={1}
              value={policy?.max_horizon_days ?? 30}
              onChange={(e) => store.updateBookingPolicy({ max_horizon_days: Math.max(1, Number(e.target.value)) })}
            />
            <span className="text-sm text-neutral-500">días</span>
          </div>
        </label>
        <label className={field}>
          <span className={fieldLabel}>¿Cuánto descanso quieres entre una clienta y la siguiente?</span>
          <div className="flex items-center gap-2">
            <input
              className={input}
              type="number"
              min={0}
              value={policy?.buffer_min ?? 0}
              onChange={(e) => store.updateBookingPolicy({ buffer_min: Math.max(0, Number(e.target.value)) })}
            />
            <span className="text-sm text-neutral-500">minutos</span>
          </div>
        </label>
      </div>
    </div>
  );
}
