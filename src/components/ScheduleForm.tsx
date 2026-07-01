// Formulario para agendar una cita (máx. 3 datos: cliente, servicio, fecha/hora).
// No se pide precio ni costo (INVARIANTE 2/4): la cita nace PENDING.
// Inputs CONTROLADOS: cada campo tiene su estado y su onChange (no hay two-way binding).
import { useState, type FormEvent } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { btnPrimary, card, field, fieldLabel, input } from './ui';

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
    setClient('');
    setDatetime('');
  }

  return (
    <form onSubmit={handleSubmit} className={card + ' flex flex-col gap-3'}>
      <h2 className="text-lg font-semibold">Agendar cita</h2>

      <label className={field}>
        <span className={fieldLabel}>Clienta</span>
        <input
          className={input}
          type="text"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Nombre de la clienta"
        />
      </label>

      <label className={field}>
        <span className={fieldLabel}>Servicio</span>
        <select className={input} value={serviceId} onChange={(e) => setServiceId(Number(e.target.value))}>
          {store.services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </label>

      <label className={field}>
        <span className={fieldLabel}>Fecha y hora</span>
        <input className={input} type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />
      </label>

      <button type="submit" className={btnPrimary} disabled={!canSubmit}>
        Agendar
      </button>
    </form>
  );
}
