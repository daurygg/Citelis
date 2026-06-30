// Configuración de UN servicio: nombre, precio, duración, insumos, override y
// los números en vivo (costo y margen). El cálculo de dinero vive en el store/dominio.
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { SupplyRow } from './SupplyRow';
import { AddSupplyForm } from './AddSupplyForm';
import type { Service } from '../lib/domain/types';

const fieldStyle = { display: 'flex', flexDirection: 'column' as const, gap: '0.25rem', marginBottom: '0.75rem' };

export function ServiceConfigCard({ service }: { service: Service }) {
  const store = useStore();
  const supplies = store.suppliesForService(service.id);
  const economics = store.serviceEconomics(service.id);

  // Campos de dinero como texto local (escritura libre → centavos al validar).
  const [priceText, setPriceText] = useState(String(service.price / 100));
  const [overrideText, setOverrideText] = useState(
    service.cost_override == null ? '' : String(service.cost_override / 100),
  );

  function handlePrice(text: string) {
    setPriceText(text);
    const cents = parseMoneyToCents(text);
    if (cents !== null) store.updateService(service.id, { price: cents });
  }

  function handleOverride(text: string) {
    setOverrideText(text);
    if (text.trim() === '') {
      store.setServiceCostOverride(service.id, null); // volver al cache de insumos
    } else {
      const cents = parseMoneyToCents(text);
      if (cents !== null) store.setServiceCostOverride(service.id, cents);
    }
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
      <label style={fieldStyle}>
        <span>Nombre del servicio</span>
        <input
          type="text"
          value={service.name}
          onChange={(e) => store.updateService(service.id, { name: e.target.value })}
        />
      </label>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ ...fieldStyle, flex: 1 }}>
          <span>Precio de venta</span>
          <input type="text" inputMode="decimal" value={priceText} onChange={(e) => handlePrice(e.target.value)} />
        </label>
        <label style={{ ...fieldStyle, flex: 1 }}>
          <span>Duración (minutos)</span>
          <input
            type="number"
            min={0}
            value={service.duration_min}
            onChange={(e) => store.updateService(service.id, { duration_min: Number(e.target.value) })}
          />
        </label>
      </div>

      <h4 style={{ marginBottom: '0.25rem' }}>Insumos</h4>
      {supplies.length === 0 ? (
        <p style={{ color: '#6b7280', margin: 0 }}>Aún no hay insumos. Añade el primero abajo.</p>
      ) : (
        supplies.map((supply) => <SupplyRow key={supply.id} supply={supply} />)
      )}
      <AddSupplyForm serviceId={service.id} />

      <label style={{ ...fieldStyle, marginTop: '1rem' }}>
        <span>O escribe un costo estimado (opcional, manda sobre los insumos)</span>
        <input
          type="text"
          inputMode="decimal"
          value={overrideText}
          onChange={(e) => handleOverride(e.target.value)}
          placeholder="Dejar vacío para usar la suma de insumos"
        />
      </label>

      {economics && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid #e5e7eb',
            paddingTop: '0.5rem',
            marginTop: '0.5rem',
          }}
        >
          <span>
            Costo: <strong>{formatMoney(economics.effective_cost)}</strong>
            {service.cost_override != null && (
              <em style={{ color: '#6b7280' }}> (estimado; insumos: {formatMoney(economics.supply_cost)})</em>
            )}
          </span>
          <span>
            Margen: <strong style={{ color: economics.margin >= 0 ? '#15803d' : '#b91c1c' }}>
              {formatMoney(economics.margin)}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}
