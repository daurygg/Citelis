// Una fila de la agenda. Si la cita está abierta (PENDING/IN_PROGRESS) ofrece
// "Cobrar": muestra precio, costo y ganancia (ya calculados por el store) y permite
// editar el precio cobrado (override para descuentos) antes de completar.
// Maneja su propio estado local de UI (panel abierto + texto del override).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, formatTime, parseMoneyToCents, statusLabel } from '../lib/format';
import type { AppointmentStatus, Appointment } from '../lib/domain/types';
import { btnGhost, btnPrimary, card, field, fieldLabel, input } from './ui';

// Estilo del badge de estado (color de fondo + texto).
const STATUS_BADGE: Record<AppointmentStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELED: 'bg-neutral-100 text-neutral-500',
};

export function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const store = useStore();
  const service = store.services.find((s) => s.id === appointment.service_id);
  const [charging, setCharging] = useState(false);
  const [overrideText, setOverrideText] = useState('');

  const isOpen = appointment.status === 'PENDING' || appointment.status === 'IN_PROGRESS';
  const overrideCents = overrideText.trim() === '' ? undefined : (parseMoneyToCents(overrideText) ?? undefined);
  const preview = store.completionPreview(appointment.id, overrideCents);

  function handleComplete() {
    store.complete(appointment.id, overrideCents);
    setCharging(false);
    setOverrideText('');
  }

  return (
    <li className={card + ' flex flex-col gap-3'}>
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 font-semibold tabular-nums">{formatTime(appointment.datetime)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{appointment.client}</div>
          <div className="truncate text-sm text-neutral-500">{service?.name ?? 'Servicio desconocido'}</div>
        </div>
        <span className={'rounded-full px-2.5 py-1 text-xs font-medium ' + STATUS_BADGE[appointment.status]}>
          {statusLabel(appointment.status)}
        </span>
        {isOpen && (
          <button type="button" className={btnGhost + ' px-3 py-1.5 text-sm'} onClick={() => setCharging((v) => !v)}>
            {charging ? 'Cerrar' : 'Cobrar'}
          </button>
        )}
        {appointment.status === 'COMPLETED' && appointment.profit !== null && (
          <span className="font-semibold text-green-700">+{formatMoney(appointment.profit)}</span>
        )}
      </div>

      {charging && preview && (
        <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
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

          <label className={field + ' mt-1'}>
            <span className={fieldLabel}>¿Cobraste otro precio? (opcional)</span>
            <input
              className={input}
              type="text"
              inputMode="decimal"
              value={overrideText}
              onChange={(e) => setOverrideText(e.target.value)}
              placeholder="Dejar vacío para usar el precio normal"
            />
          </label>

          <button type="button" className={btnPrimary} onClick={handleComplete}>
            Completar cita
          </button>
        </div>
      )}
    </li>
  );
}
