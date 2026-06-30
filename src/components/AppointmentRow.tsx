// Una fila de la agenda. Si la cita está abierta (PENDING/IN_PROGRESS) ofrece
// "Cobrar": muestra precio, costo y ganancia (ya calculados por el store) y permite
// editar el precio cobrado (override para descuentos) antes de completar.
// Maneja su propio estado local de UI (panel abierto + texto del override).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, formatTime, parseMoneyToCents, statusLabel } from '../lib/format';
import type { Appointment, AppointmentStatus } from '../lib/domain/types';

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  PENDING: '#b45309',
  IN_PROGRESS: '#1d4ed8',
  COMPLETED: '#15803d',
  CANCELED: '#6b7280',
};

export function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const store = useStore();
  const service = store.services.find((s) => s.id === appointment.service_id);
  const [charging, setCharging] = useState(false);
  const [overrideText, setOverrideText] = useState('');

  const isOpen = appointment.status === 'PENDING' || appointment.status === 'IN_PROGRESS';

  // Si el texto del override está vacío → undefined (se usa el precio del servicio).
  const overrideCents = overrideText.trim() === '' ? undefined : (parseMoneyToCents(overrideText) ?? undefined);
  const preview = store.completionPreview(appointment.id, overrideCents);

  function handleComplete() {
    store.complete(appointment.id, overrideCents);
    setCharging(false);
    setOverrideText('');
  }

  return (
    <li style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
        <strong style={{ width: '3.5rem' }}>{formatTime(appointment.datetime)}</strong>
        <span style={{ flex: 1 }}>{appointment.client}</span>
        <span style={{ color: '#6b7280' }}>{service?.name ?? 'Servicio desconocido'}</span>
        <span style={{ color: STATUS_COLOR[appointment.status], fontWeight: 600 }}>
          {statusLabel(appointment.status)}
        </span>
        {isOpen && (
          <button type="button" onClick={() => setCharging((open) => !open)}>
            {charging ? 'Cerrar' : 'Cobrar'}
          </button>
        )}
        {appointment.status === 'COMPLETED' && appointment.profit !== null && (
          <span style={{ color: '#15803d', fontWeight: 600 }}>+{formatMoney(appointment.profit)}</span>
        )}
      </div>

      {charging && preview && (
        <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Precio</span>
            <strong>{formatMoney(preview.charged_price)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Costo</span>
            <span>{formatMoney(preview.actual_cost)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Ganancia</span>
            <strong style={{ color: '#15803d' }}>{formatMoney(preview.profit)}</strong>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ color: '#6b7280' }}>¿Cobraste otro precio? (opcional)</span>
            <input
              type="text"
              inputMode="decimal"
              value={overrideText}
              onChange={(e) => setOverrideText(e.target.value)}
              placeholder="Dejar vacío para usar el precio normal"
            />
          </label>

          <button type="button" onClick={handleComplete}>
            Completar cita
          </button>
        </div>
      )}
    </li>
  );
}
