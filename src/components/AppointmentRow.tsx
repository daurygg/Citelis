// Una fila de la agenda. Si la cita está abierta ofrece acciones: Cobrar, No llegó
// y Cancelar. Al cobrar, muestra precio/costo/ganancia (ya calculados por el store).
// Pide UN precio por cada servicio de precio variable antes de completar; lo que
// se pide, y cuándo se puede cobrar, lo decide `buildChargeForm` (dominio puro).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, formatTime, statusLabel } from '../lib/format';
import type { AppointmentStatus, Appointment } from '../lib/domain/types';
import { appointmentServiceIds, serviceNames } from '../lib/domain/appointments';
import { appointmentServices, buildChargeForm, initialChargeTexts, type ChargeTexts } from '../lib/domain/charge';
import { useToast } from './Toast';
import { CalendarActions } from './CalendarActions';
import { ClientNotice } from './ClientNotice';
import { btnGhost, btnPrimary, card, field, fieldLabel, input } from './ui';

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  // Violeta: pide acción de la dueña y no se confunde con el ámbar de Pendiente.
  REQUESTED: 'bg-violet-100 text-violet-800',
  PENDING: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELED: 'bg-neutral-100 text-neutral-500',
  NO_SHOW: 'bg-red-100 text-red-700',
  REJECTED: 'bg-neutral-200 text-neutral-600',
};

export function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const store = useStore();
  const { notify } = useToast();
  const [charging, setCharging] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [sharingCalendar, setSharingCalendar] = useState(false);
  const [newDatetime, setNewDatetime] = useState(appointment.datetime.slice(0, 16));
  const cobroServices = appointmentServices(appointment, store.services);
  // Se precarga el precio acordado al agendar (si lo hay) donde corresponde.
  const [texts, setTexts] = useState<ChargeTexts>(() => initialChargeTexts(appointment, cobroServices ?? []));
  const [saving, setSaving] = useState(false);

  const isOpen = appointment.status === 'PENDING' || appointment.status === 'IN_PROGRESS';
  const form = buildChargeForm(cobroServices ?? [], texts);
  const preview = store.completionPreview(appointment.id, {
    overridePrice: form.overridePrice,
    priceOverrides: form.priceOverrides,
  });
  const canComplete = cobroServices !== null && form.ready && !saving;

  async function handleComplete() {
    if (!canComplete) return;
    setSaving(true);
    const result = await store.complete(appointment.id, {
      overridePrice: form.overridePrice,
      priceOverrides: form.priceOverrides,
    });
    setSaving(false);
    if (!result.ok) {
      notify(result.message, 'error');
      return;
    }
    setCharging(false);
    setTexts({ prices: {}, total: '' });
    notify('✓ Cita completada');
  }

  function handleReschedule() {
    if (newDatetime === '') return;
    const conflict = store.scheduleConflict(newDatetime, appointmentServiceIds(appointment), appointment.id);
    if (conflict) {
      notify(`Ese horario choca con ${conflict.client} (${formatTime(conflict.datetime)})`, 'error');
      return;
    }
    store.reschedule(appointment.id, newDatetime);
    setRescheduling(false);
    notify('✓ Cita reprogramada');
  }

  return (
    <li className={card + ' flex flex-col gap-3'}>
      <div className="flex items-center gap-3">
        <span className="w-20 shrink-0 font-semibold tabular-nums">{formatTime(appointment.datetime)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{appointment.client}</div>
          <div className="truncate text-sm text-neutral-500">{serviceNames(appointment, store.services) || 'Servicio desconocido'}</div>
          {appointment.deposit != null && appointment.deposit > 0 && appointment.status !== 'COMPLETED' && (
            <div className="text-xs text-brand-700">Abonó {formatMoney(appointment.deposit)}</div>
          )}
        </div>
        <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + STATUS_BADGE[appointment.status]}>
          {statusLabel(appointment.status)}
        </span>
        {appointment.status === 'COMPLETED' && appointment.profit !== null && (
          <div className="text-right">
            <div className="font-semibold text-green-700">+{formatMoney(appointment.profit)}</div>
            <div className="text-xs text-neutral-500">Cobró {formatMoney(appointment.charged_price ?? 0)}</div>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary + ' px-3 py-1.5 text-sm'} onClick={() => setCharging((v) => !v)}>
            {charging ? 'Cerrar' : 'Cobrar'}
          </button>
          <button
            type="button"
            className={btnGhost + ' px-3 py-1.5 text-sm'}
            onClick={() => setRescheduling((v) => !v)}
          >
            {rescheduling ? 'Cerrar' : 'Reprogramar'}
          </button>
          <button
            type="button"
            className={btnGhost + ' px-3 py-1.5 text-sm'}
            onClick={() => setSharingCalendar((v) => !v)}
          >
            {sharingCalendar ? 'Cerrar' : 'Calendario'}
          </button>
          <button
            type="button"
            className={btnGhost + ' px-3 py-1.5 text-sm'}
            onClick={() => {
              store.markNoShow(appointment.id);
              notify('Marcada como “no llegó”');
            }}
          >
            No llegó
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm text-red-600 hover:underline"
            onClick={() => {
              if (window.confirm('¿Cancelar esta cita?')) {
                store.cancel(appointment.id);
                notify('Cita cancelada');
              }
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {sharingCalendar && <CalendarActions appointment={appointment} />}

      {/* Se decide solo según el estado: aparece en una cita confirmada o
          cancelada, y desaparece cuando ya no hay nada que avisar. */}
      <ClientNotice appointment={appointment} />

      {rescheduling && (
        <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
          <label className={field}>
            <span className={fieldLabel}>Nueva fecha y hora</span>
            <input
              className={input}
              type="datetime-local"
              value={newDatetime}
              onChange={(e) => setNewDatetime(e.target.value)}
            />
          </label>
          <button type="button" className={btnPrimary} onClick={handleReschedule} disabled={newDatetime === ''}>
            Guardar nuevo horario
          </button>
        </div>
      )}

      {charging && (
        <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
          {/* Un precio por cada servicio de precio variable, con su nombre. */}
          {form.variableServices.map((service) => (
            <label key={service.id} className={field}>
              <span className={fieldLabel}>¿Cuánto cobraste por {service.name}? (obligatorio)</span>
              <input
                className={input}
                type="text"
                inputMode="decimal"
                value={texts.prices[service.id] ?? ''}
                onChange={(e) => setTexts((t) => ({ ...t, prices: { ...t.prices, [service.id]: e.target.value } }))}
                placeholder={`Precio de ${service.name}`}
              />
            </label>
          ))}

          {/* Sin vista previa (servicio de precio variable sin precio todavía) el
              panel sigue: el campo de arriba es justo el que la desbloquea. */}
          {preview && (
            <>
              <div className="flex justify-between">
                <span className="text-neutral-600">Precio</span>
                <strong>{formatMoney(preview.charged_price)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Costo</span>
                <span>{formatMoney(preview.actual_cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Ganancia</span>
                <strong className="text-green-700">{formatMoney(preview.profit)}</strong>
              </div>

              {appointment.deposit != null && appointment.deposit > 0 && (
                <>
                  <div className="flex justify-between border-t border-neutral-200 pt-2">
                    <span className="text-neutral-600">Abono ya pagado</span>
                    <span>−{formatMoney(appointment.deposit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Resto por cobrar</span>
                    <strong>{formatMoney(preview.charged_price - appointment.deposit)}</strong>
                  </div>
                </>
              )}
            </>
          )}

          {form.showTotalField && (
            <label className={field + ' mt-1'}>
              <span className={fieldLabel}>
                {cobroServices !== null && cobroServices.length > 1
                  ? '¿Pactaste un precio por todo? (opcional)'
                  : '¿Cobraste otro precio? (opcional)'}
              </span>
              <input
                className={input}
                type="text"
                inputMode="decimal"
                value={texts.total}
                onChange={(e) => setTexts((t) => ({ ...t, total: e.target.value }))}
                placeholder="Dejar vacío para usar el precio normal"
              />
            </label>
          )}

          <button type="button" className={btnPrimary} onClick={handleComplete} disabled={!canComplete}>
            {saving ? 'Guardando…' : 'Completar cita'}
          </button>
        </div>
      )}
    </li>
  );
}
