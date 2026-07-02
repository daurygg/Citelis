// Formulario para agendar una cita, o registrar una atención al paso (walk-in).
// - Agendar: nace PENDING sin dinero (INVARIANTE 2); el precio se cobra después.
// - Walk-in ("ya la atendí"): crea la cita YA completada, congelando el dinero.
// Inputs CONTROLADOS: cada campo tiene su estado y su onChange.
import { useState, type FormEvent } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { nowLocalDatetime, parseMoneyToCents } from '../lib/format';
import { btnPrimary, card, field, fieldLabel, input } from './ui';

export function ScheduleForm() {
  const store = useStore();
  const [client, setClient] = useState('');
  const [serviceId, setServiceId] = useState<number>(store.services[0]?.id ?? 0);
  const [datetime, setDatetime] = useState('');
  const [walkIn, setWalkIn] = useState(false);
  const [priceText, setPriceText] = useState('');

  const selectedService = store.services.find((s) => s.id === serviceId);
  const isVariable = selectedService?.variable_price ?? false;
  const parsedPrice = parseMoneyToCents(priceText);
  const priceCents = priceText.trim() === '' ? undefined : (parsedPrice ?? undefined);

  const baseValid = client.trim() !== '' && serviceId > 0;
  // Al cobrar (walk-in) un servicio de precio variable, el precio es obligatorio.
  const priceOk = !isVariable || (parsedPrice !== null && parsedPrice > 0);
  const canSubmit = walkIn ? baseValid && priceOk : baseValid && datetime !== '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    if (walkIn) {
      store.registerWalkIn({
        service_id: serviceId,
        client: client.trim(),
        datetime: datetime || nowLocalDatetime(),
        price: priceCents,
      });
    } else {
      store.schedule({ client: client.trim(), service_id: serviceId, datetime });
    }
    setClient('');
    setDatetime('');
    setPriceText('');
  }

  return (
    <form onSubmit={handleSubmit} className={card + ' flex flex-col gap-3'}>
      <h2 className="text-lg font-semibold">{walkIn ? 'Registrar atención' : 'Agendar cita'}</h2>

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
        <span className={fieldLabel}>
          {walkIn ? 'Fecha y hora (opcional, por defecto ahora)' : 'Fecha y hora'}
        </span>
        <input className={input} type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />
      </label>

      {walkIn && (
        <label className={field}>
          <span className={fieldLabel}>
            {isVariable ? '¿Cuánto cobraste? (obligatorio)' : '¿Cobraste otro precio? (opcional)'}
          </span>
          <input
            className={input}
            type="text"
            inputMode="decimal"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            placeholder={isVariable ? 'Precio de esta cita' : 'Dejar vacío para el precio normal'}
          />
        </label>
      )}

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} />
        Ya la atendí (cobrar ahora)
      </label>

      <button type="submit" className={btnPrimary} disabled={!canSubmit}>
        {walkIn ? 'Registrar y cobrar' : 'Agendar'}
      </button>
    </form>
  );
}
