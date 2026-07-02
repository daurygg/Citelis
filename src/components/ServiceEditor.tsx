// Editor enfocado de UN servicio (se abre al tocar una tarjeta de la lista).
// Nombre, precio, duración, insumos (colapsables), override y números en vivo.
// El cálculo de dinero vive en el store/dominio (INVARIANTE 5).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { SupplyRow } from './SupplyRow';
import { AddSupplyForm } from './AddSupplyForm';
import { btnGhost, card, field, fieldLabel, input } from './ui';

export function ServiceEditor({ serviceId, onBack }: { serviceId: number; onBack: () => void }) {
  const store = useStore();
  const service = store.services.find((s) => s.id === serviceId);
  const supplies = store.suppliesForService(serviceId);
  const economics = store.serviceEconomics(serviceId);
  // Insumos del negocio que aún NO están enlazados a este servicio (para compartir).
  const availableToLink = store.allSupplies().filter((s) => !supplies.some((x) => x.id === s.id));

  const [showSupplies, setShowSupplies] = useState(true);
  const [linkId, setLinkId] = useState(0);
  const [priceText, setPriceText] = useState(service ? String(service.price / 100) : '');
  const [overrideText, setOverrideText] = useState(
    service?.cost_override == null ? '' : String(service.cost_override / 100),
  );

  if (!service || !economics) {
    return (
      <button type="button" className={btnGhost} onClick={onBack}>
        ← Volver
      </button>
    );
  }

  function handlePrice(text: string) {
    setPriceText(text);
    const cents = parseMoneyToCents(text);
    if (cents !== null) store.updateService(serviceId, { price: cents });
  }

  function handleOverride(text: string) {
    setOverrideText(text);
    if (text.trim() === '') {
      store.setServiceCostOverride(serviceId, null); // volver al cache de insumos
    } else {
      const cents = parseMoneyToCents(text);
      if (cents !== null) store.setServiceCostOverride(serviceId, cents);
    }
  }

  // Borra el servicio (con confirmación) y vuelve a la lista.
  function handleDelete() {
    if (!window.confirm(`¿Eliminar "${service?.name}"? Esta acción no se puede deshacer.`)) return;
    store.deleteService(serviceId);
    onBack();
  }

  return (
    <section className="flex flex-col gap-4">
      <button type="button" className="self-start text-sm text-rose-700 hover:underline" onClick={onBack}>
        ← Volver a servicios
      </button>

      <div className={card + ' flex flex-col gap-4'}>
        <label className={field}>          
          <span className={fieldLabel}>Nombre del servicio</span>
          <input
            className={input}
            type="text"
            value={service.name}
            onChange={(e) => store.updateService(serviceId, { name: e.target.value })}
          />
        </label>

        <div className="flex gap-3">
          <label className={field + ' flex-1'}>
            <span className={fieldLabel}>Precio de venta</span>
            <input className={input} type="text" inputMode="decimal" value={priceText} onChange={(e) => handlePrice(e.target.value)} />
          </label>
          <label className={field + ' flex-1'}>
            <span className={fieldLabel}>Duración (min)</span>
            <input
              className={input}
              type="number"
              min={0}
              value={service.duration_min}
              onChange={(e) => store.updateService(serviceId, { duration_min: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className={card + ' flex flex-col gap-2'}>
        <button
          type="button"
          className="flex items-center justify-between text-left font-medium"
          onClick={() => setShowSupplies((v) => !v)}
        >
          <span>Insumos ({supplies.length})</span>
          <span className="text-neutral-400">{showSupplies ? '▾' : '▸'}</span>
        </button>

        {showSupplies && (
          <div className="flex flex-col">
            {supplies.length === 0 ? (
              <p className="text-sm text-neutral-500">Aún no hay insumos. Añade el primero abajo.</p>
            ) : (
              supplies.map((supply) => <SupplyRow key={supply.id} supply={supply} serviceId={serviceId} />)
            )}
            <AddSupplyForm serviceId={serviceId} />

            {availableToLink.length > 0 && (
              <div className="mt-3 flex items-end gap-2 rounded-xl bg-neutral-50 p-3">
                <label className={field + ' flex-1'}>
                  <span className={fieldLabel}>…o usa un insumo que ya tienes (compartido)</span>
                  <select className={input} value={linkId} onChange={(e) => setLinkId(Number(e.target.value))}>
                    <option value={0}>Elegir…</option>
                    {availableToLink.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={linkId === 0}
                  onClick={() => {
                    store.linkExistingSupply(serviceId, linkId);
                    setLinkId(0);
                  }}
                >
                  Enlazar
                </button>
              </div>
            )}
          </div>
        )}

        <label className={field + ' mt-2'}>
          <span className={fieldLabel}>O escribe un costo estimado (opcional; manda sobre los insumos)</span>
          <input
            className={input}
            type="text"
            inputMode="decimal"
            value={overrideText}
            onChange={(e) => handleOverride(e.target.value)}
            placeholder="Dejar vacío para usar la suma de insumos"
          />
        </label>
      </div>

      <div className={card + ' flex items-center justify-between'}>
        <div>
          <div className={fieldLabel + ' text-sm'}>Costo</div>
          <div className="text-lg font-semibold">
            {formatMoney(economics.effective_cost)}
            {service.cost_override != null && (
              <span className="ml-1 text-xs font-normal text-neutral-500">
                (estimado; insumos {formatMoney(economics.supply_cost)})
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className={fieldLabel + ' text-sm'}>Margen</div>
          <div className={'text-lg font-semibold ' + (economics.margin >= 0 ? 'text-green-700' : 'text-red-700')}>
            {formatMoney(economics.margin)}
          </div>
        </div>
      </div>

      <button type="button" className="self-start text-sm text-red-600 hover:underline" onClick={handleDelete}>
        Eliminar servicio
      </button>
    </section>
  );
}
