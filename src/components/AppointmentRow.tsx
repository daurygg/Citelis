// Una fila de la agenda. Si la cita está abierta ofrece acciones: Cobrar, No llegó
// y Cancelar. Al cobrar, muestra precio/costo/ganancia (ya calculados por el store).
// Para servicios de precio variable, PIDE el precio (obligatorio) antes de completar.
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, formatTime, parseMoneyToCents, statusLabel } from '../lib/format';
import type { AppointmentStatus, Appointment } from '../lib/domain/types';
import { useToast } from './Toast';
import { btnGhost, btnPrimary, card, field, fieldLabel, input } from './ui';

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELED: 'bg-neutral-100 text-neutral-500',
  NO_SHOW: 'bg-red-100 text-red-700',
};

export function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const store = useStore();
  const { notify } = useToast();
  const service = store.services.find((s) => s.id === appointment.service_id);
  const isVariable = service?.variable_price ?? false;

  const [charging, setCharging] = useState(false);
  const [priceText, setPriceText] = useState('');

  const isOpen = appointment.status === 'PENDING' || appointment.status === 'IN_PROGRESS';
  const parsed = parseMoneyToCents(priceText);
  const priceCents = priceText.trim() === '' ? undefined : (parsed ?? undefined);
  // Para precio variable el precio es obligatorio; para precio fijo es opcional.
  const priceReady = !isVariable || (parsed !== null && parsed > 0);
  const preview = store.completionPreview(appointment.id, priceCents);

  function handleComplete() {
    if (!priceReady) return;
    store.complete(appointment.id, priceCents);
    setCharging(false);
    setPriceText('');
    notify('✓ Cita completada');
  }

  return (
    <li className={card + ' flex flex-col gap-3'}>
      <div className="flex items-center gap-3">
        <span className="w-20 shrink-0 font-semibold tabular-nums">{formatTime(appointment.datetime)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{appointment.client}</div>
          <div className="truncate text-sm text-neutral-500">{service?.name ?? 'Servicio desconocido'}</div>
        </div>
        <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + STATUS_BADGE[appointment.status]}>
          {statusLabel(appointment.status)}
        </span>
        {appointment.status === 'COMPLETED' && appointment.profit !== null && (
          <span className="font-semibold text-green-700">+{formatMoney(appointment.profit)}</span>
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

      {charging && preview && (
        <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
          {isVariable && (
            <label className={field}>
              <span className={fieldLabel}>¿Cuánto cobraste? (obligatorio)</span>
              <input
                className={input}
                type="text"
                inputMode="decimal"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                placeholder="Precio de esta cita"
              />
            </label>
          )}

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

          {!isVariable && (
            <label className={field + ' mt-1'}>
              <span className={fieldLabel}>¿Cobraste otro precio? (opcional)</span>
              <input
                className={input}
                type="text"
                inputMode="decimal"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                placeholder="Dejar vacío para usar el precio normal"
              />
            </label>
          )}

          <button type="button" className={btnPrimary} onClick={handleComplete} disabled={!priceReady}>
            Completar cita
          </button>
        </div>
      )}
    </li>
  );
}
