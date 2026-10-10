// Una fila de la agenda. Si la cita está abierta ofrece acciones: Cobrar, No llegó
// y Cancelar. Al cobrar, muestra precio/costo/ganancia (ya calculados por el store).
// Pide UN precio por cada servicio de precio variable antes de completar; lo que
// se pide, y cuándo se puede cobrar, lo decide `buildChargeForm` (dominio puro).
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, formatTime, statusLabel } from '../lib/format';
import type { AppointmentStatus, Appointment } from '../lib/domain/types';
import { appointmentServiceIds, serviceNames } from '../lib/domain/appointments';
import { canEditServices, servicesChanged } from '../lib/domain/editServices';
import { summarizeSelection, toggleServiceId } from '../lib/domain/selection';
import { activeEmployees } from '../lib/domain/employees';
import { chargeTotals, type DiscountMode } from '../lib/domain/discounts';
import { appointmentServices, buildChargeForm, initialChargeTexts, type ChargeTexts } from '../lib/domain/charge';
import { useToast } from './Toast';
import { CalendarActions } from './CalendarActions';
import { ClientNotice } from './ClientNotice';
import { btnGhostSm, btnPrimary, btnPrimarySm, btnText, card, chip, field, fieldLabel, input } from './ui';

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
  const [editingServices, setEditingServices] = useState(false);
  const [editIds, setEditIds] = useState<number[]>([]);
  const [savingServices, setSavingServices] = useState(false);

  const isOpen = appointment.status === 'PENDING' || appointment.status === 'IN_PROGRESS';
  const form = buildChargeForm(cobroServices ?? [], texts, store.employees);
  const assignable = activeEmployees(store.employees);
  const preview = store.completionPreview(appointment.id, {
    overridePrice: form.overridePrice,
    priceOverrides: form.priceOverrides,
    discounts: form.discounts,
  });
  const breakdown = store.completionBreakdown(appointment.id, {
    overridePrice: form.overridePrice,
    priceOverrides: form.priceOverrides,
    discounts: form.discounts,
  });
  const totals = breakdown ? chargeTotals(breakdown.lines) : null;
  const canComplete = cobroServices !== null && form.ready && !saving && (breakdown?.errors.size ?? 0) === 0;

  const editable = canEditServices(appointment.status);
  // Si la cita deja de ser editable con el panel abierto (se cobró, o un cambio
  // en vivo la canceló), el panel se cierra de verdad: sin esto quedaría oculto
  // pero abierto, y reaparecería con una selección vieja.
  useEffect(() => {
    if (!editable) setEditingServices(false);
  }, [editable]);
  const currentIds = appointmentServiceIds(appointment);
  const editSummary = summarizeSelection(store.services, editIds);
  const editCheck = editingServices ? store.checkServicesEdit(appointment.id, editIds) : null;
  const editChanged = servicesChanged(currentIds, editIds);
  const canSaveServices = editCheck !== null && editCheck.ok && editChanged && !savingServices;

  function toggleEditServices() {
    if (!editingServices) {
      // Se parte de lo que la cita tiene hoy (sin ids que ya no estén en el catálogo).
      setEditIds(summarizeSelection(store.services, currentIds).service_ids);
    }
    setEditingServices((v) => !v);
  }

  async function handleSaveServices() {
    if (!canSaveServices) return;
    setSavingServices(true);
    let result;
    try {
      result = await store.updateAppointmentServices(appointment.id, editIds);
    } finally {
      // Pase lo que pase, el botón no se queda bloqueado en "Guardando…".
      setSavingServices(false);
    }
    if (!result.ok) {
      notify(result.message, 'error');
      return;
    }
    setEditingServices(false);
    notify('✓ Servicios actualizados');
  }

  async function handleComplete() {
    if (!canComplete) return;
    setSaving(true);
    let result;
    try {
      result = await store.complete(appointment.id, {
        overridePrice: form.overridePrice,
        priceOverrides: form.priceOverrides,
        employeeIds: form.employeeIds,
        discounts: form.discounts,
      });
    } finally {
      // Pase lo que pase, el botón no se queda bloqueado en "Guardando…".
      setSaving(false);
    }
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
      <div className="flex items-start gap-3">
        <span className="w-14 shrink-0 font-semibold tabular-nums">{formatTime(appointment.datetime)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{appointment.client}</div>
          <div className="truncate text-sm text-neutral-500">{serviceNames(appointment, store.services) || 'Servicio desconocido'}</div>
          {appointment.deposit != null && appointment.deposit > 0 && appointment.status !== 'COMPLETED' && (
            <div className="text-xs text-brand-700">Abonó {formatMoney(appointment.deposit)}</div>
          )}
        </div>
        {/* Estado y ganancia en una columna aparte: el nombre se queda con el ancho sobrante. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
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
      </div>

      {(isOpen || editable) && (
        <div className="flex flex-wrap gap-2">
          {isOpen && (
            <>
              <button type="button" className={btnPrimarySm} onClick={() => setCharging((v) => !v)}>
                {charging ? 'Cerrar' : 'Cobrar'}
              </button>
              <button
                type="button"
                className={btnGhostSm}
                onClick={() => setRescheduling((v) => !v)}
              >
                {rescheduling ? 'Cerrar' : 'Reprogramar'}
              </button>
            </>
          )}
          {editable && (
            <button type="button" className={btnGhostSm} onClick={toggleEditServices}>
              {editingServices ? 'Cerrar' : 'Editar servicios'}
            </button>
          )}
          {isOpen && (
            <>
              <button
                type="button"
                className={btnGhostSm}
                onClick={() => setSharingCalendar((v) => !v)}
              >
                {sharingCalendar ? 'Cerrar' : 'Calendario'}
              </button>
              <button
                type="button"
                className={btnGhostSm}
                onClick={() => {
                  store.markNoShow(appointment.id);
                  notify('Marcada como “no llegó”');
                }}
              >
                No llegó
              </button>
              <button
                type="button"
                className={btnText + ' text-red-600'}
                onClick={() => {
                  if (window.confirm('¿Cancelar esta cita?')) {
                    store.cancel(appointment.id);
                    notify('Cita cancelada');
                  }
                }}
              >
                Cancelar
              </button>
            </>
          )}
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

      {editingServices && editable && (
        <div className="flex flex-col gap-3 rounded-xl bg-neutral-50 p-3">
          <fieldset className={field}>
            <legend className={fieldLabel}>Servicios de esta cita</legend>
            <div className="flex flex-wrap gap-2">
              {store.services.map((service) => {
                const on = editIds.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    aria-pressed={on}
                    disabled={savingServices}
                    onClick={() => setEditIds((ids) => toggleServiceId(ids, service.id))}
                    className={
                      chip + ' ' +
                      (on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700')
                    }
                  >
                    {service.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {editSummary.service_ids.length > 0 && (
            <p className="text-sm text-neutral-600">
              Duran {editSummary.duration_min} min · Precio estimado:{' '}
              {editSummary.estimate.hasVariable
                ? editSummary.estimate.total > 0
                  ? `${formatMoney(editSummary.estimate.total)} + a convenir`
                  : 'a convenir'
                : formatMoney(editSummary.estimate.total)}
            </p>
          )}
          {/* Sin esto el botón quedaría apagado sin explicar por qué. */}
          {editCheck !== null && !editCheck.ok && <p className="text-sm text-red-600">{editCheck.reason}</p>}
          {editCheck !== null && editCheck.ok && !editChanged && (
            <p className="text-sm text-neutral-500">Aún no cambiaste nada.</p>
          )}
          <button type="button" className={btnPrimary} onClick={handleSaveServices} disabled={!canSaveServices}>
            {savingServices ? 'Guardando…' : 'Guardar servicios'}
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

          {/* Quién hizo cada servicio: opcional, y solo si hay empleadas activas. */}
          {assignable.length > 0 &&
            (cobroServices ?? []).map((service) => (
              <label key={service.id} className={field}>
                <span className={fieldLabel}>¿Quién hizo {service.name}?</span>
                <select
                  className={input + ' min-h-11'}
                  value={texts.employees?.[service.id] ?? ''}
                  onChange={(e) =>
                    setTexts((t) => ({
                      ...t,
                      employees: { ...t.employees, [service.id]: e.target.value === '' ? null : Number(e.target.value) },
                    }))
                  }
                >
                  <option value="">Sin asignar</option>
                  {assignable.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}

          {/* Descuento opcional por servicio: en RD$ o en %. El error sale del dominio. */}
          {(cobroServices ?? []).map((service) => {
            const text = texts.discounts?.[service.id] ?? { mode: 'amount' as DiscountMode, value: '' };
            const error = form.invalidDiscounts.has(service.id)
              ? 'Escribe un número válido (el % va de 0 a 100, sin decimales).'
              : (breakdown?.errors.get(service.id) ?? null);
            const setDiscount = (next: { mode: DiscountMode; value: string }) =>
              setTexts((t) => ({ ...t, discounts: { ...t.discounts, [service.id]: next } }));
            return (
              <div key={service.id} className={field}>
                <span className={fieldLabel}>Descuento en {service.name} (opcional)</span>
                <div className="flex gap-2">
                  <input
                    className={input}
                    type="text"
                    inputMode="decimal"
                    aria-label={`Descuento en ${service.name}`}
                    value={text.value}
                    onChange={(e) => setDiscount({ ...text, value: e.target.value })}
                    placeholder={text.mode === 'percent' ? 'Por ejemplo 10' : 'Por ejemplo 5.00'}
                  />
                  <div className="flex shrink-0 gap-1">
                    {(['amount', 'percent'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={text.mode === mode}
                        onClick={() => setDiscount({ mode, value: text.value })}
                        className={
                          chip + ' ' +
                          (text.mode === mode ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700')
                        }
                      >
                        {mode === 'amount' ? 'RD$' : '%'}
                      </button>
                    ))}
                  </div>
                </div>
                {error !== null && <p className="text-sm text-red-600">{error}</p>}
              </div>
            );
          })}

          {/* Sin vista previa (servicio de precio variable sin precio todavía) el
              panel sigue: el campo de arriba es justo el que la desbloquea. */}
          {preview && (
            <>
              {/* Con descuento se ve la cuenta completa: subtotal, descuentos y total. */}
              {totals !== null && totals.discounts > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Subtotal</span>
                    <span>{formatMoney(totals.gross)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Descuentos</span>
                    <span>−{formatMoney(totals.discounts)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-neutral-600">{totals !== null && totals.discounts > 0 ? 'Total' : 'Precio'}</span>
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
