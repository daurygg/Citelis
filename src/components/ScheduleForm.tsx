// Formulario para agendar una cita (máx. 3 datos: cliente, servicio, fecha/hora).
// No se pide precio ni costo (INVARIANTE 2/4): la cita nace PENDING.
// Inputs CONTROLADOS: cada campo tiene su estado y su onChange (no hay two-way binding).
import { useState, type FormEvent } from 'react';
import { useStore } from '../lib/store/StoreContext';

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.25rem',
  marginBottom: '0.75rem',
};

export function ScheduleForm() {
  const store = useStore();
  const [client, setClient] = useState('');
  const [serviceId, setServiceId] = useState<number>(store.services[0]?.id ?? 0);
  const [datetime, setDatetime] = useState('');

  const canSubmit = client.trim() !== '' && datetime !== '' && serviceId > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); // evita que el navegador recargue la página
    if (!canSubmit) return;
    store.schedule({ client: client.trim(), service_id: serviceId, datetime });
    // Limpia el formulario para la siguiente cita (no reseteamos el servicio elegido).
    setClient('');
    setDatetime('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}
    >
      <h2 style={{ marginTop: 0 }}>Agendar cita</h2>

      <label style={fieldStyle}>
        <span>Clienta</span>
        <input
          type="text"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Nombre de la clienta"
        />
      </label>

      <label style={fieldStyle}>
        <span>Servicio</span>
        <select value={serviceId} onChange={(e) => setServiceId(Number(e.target.value))}>
          {store.services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </label>

      <label style={fieldStyle}>
        <span>Fecha y hora</span>
        <input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />
      </label>

      <button type="submit" disabled={!canSubmit}>
        Agendar
      </button>
    </form>
  );
}
