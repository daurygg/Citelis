// Editor enfocado de UN servicio (se abre al tocar una tarjeta de la lista).
// Nombre, precio, duración, insumos (colapsables), override y números en vivo.
// El cálculo de dinero vive en el store/dominio (INVARIANTE 5).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney, parseMoneyToCents } from '../lib/format';
import { SupplyRow } from './SupplyRow';
import { AddSupplyForm } from './AddSupplyForm';
import { btnGhost, btnQuietDanger, field, fieldLabel, input, rowDivider, surface } from './ui';

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
        Volver
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
      <button
        type="button"
        className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-1 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        onClick={onBack}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m10 3.5-4.5 4.5 4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Volver a servicios
      </button>

      <div className={surface + ' grid grid-cols-2 gap-3 p-4'}>
        <label className={field + ' col-span-2'}>
          <span className={fieldLabel}>Nombre del servicio</span>
          <input
            className={input}
            type="text"
            value={service.name}
            onChange={(e) => store.updateService(serviceId, { name: e.target.value })}
          />
        </label>

        <label className={field}>
          <span className={fieldLabel}>Precio de venta</span>
          <input className={input} type="text" inputMode="decimal" value={priceText} onChange={(e) => handlePrice(e.target.value)} />
        </label>
        <label className={field}>
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

      <div className={surface + ' flex flex-col'}>
        <button
          type="button"
          aria-expanded={showSupplies}
          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700"
          onClick={() => setShowSupplies((v) => !v)}
        >
          <span>
            Insumos <span className="font-normal text-muted tabular-nums">({supplies.length})</span>
          </span>
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={'size-4 text-muted transition-transform motion-reduce:transition-none ' + (showSupplies ? 'rotate-180' : '')}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m3.5 6 4.5 4.5L12.5 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {showSupplies && (
          <div className="flex flex-col border-t border-line">
            {supplies.length === 0 ? (
              <p className="p-4 text-muted">Aún no hay insumos. Añade el primero abajo.</p>
            ) : (
              <div className={rowDivider}>
                {supplies.map((supply) => (
                  <SupplyRow key={supply.id} supply={supply} serviceId={serviceId} />
                ))}
              </div>
            )}
            <AddSupplyForm serviceId={serviceId} />

            {availableToLink.length > 0 && (
              <div className="flex items-end gap-2 border-t border-line p-4">
                <label className={field + ' min-w-0 flex-1'}>
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

        <label className={field + ' border-t border-line p-4'}>
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

      {/* Costo y margen en una sola franja, como las cifras del día en la agenda: el margen manda. */}
      <div className={surface + ' grid grid-cols-2 gap-4 p-4 tabular-nums'}>
        <div>
          <div className="text-sm text-muted">Costo</div>
          <div className="text-lg font-semibold">{formatMoney(economics.effective_cost)}</div>
          {service.cost_override != null && (
            <div className="text-sm text-muted">Estimado; los insumos suman {formatMoney(economics.supply_cost)}</div>
          )}
        </div>
        <div className="border-l border-line pl-4">
          <div className="text-sm text-muted">Margen</div>
          <div className={'text-2xl font-bold ' + (economics.margin >= 0 ? 'text-green-700' : 'text-red-700')}>
            {formatMoney(economics.margin)}
          </div>
        </div>
      </div>

      <button type="button" className={btnQuietDanger + ' self-start'} onClick={handleDelete}>
        Eliminar servicio
      </button>
    </section>
  );
}
