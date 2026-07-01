// Pantalla de Servicios: lista de solo lectura que destaca el margen de cada
// servicio. Tocar una tarjeta abre su editor enfocado (patrón lista → detalle).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney } from '../lib/format';
import { ServiceEditor } from './ServiceEditor';
import { btnPrimary, card } from './ui';

export function ServicesScreen() {
  const store = useStore();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (selectedId !== null) {
    return <ServiceEditor serviceId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  function handleNew() {
    const id = store.addService();
    setSelectedId(id); // abre el nuevo servicio directo en el editor
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Servicios y costos</h2>
          <p className="text-sm text-neutral-500">Toca un servicio para editarlo.</p>
        </div>
        <button type="button" className={btnPrimary} onClick={handleNew}>
          + Nuevo
        </button>
      </div>

      <ul className="flex flex-col gap-3">
        {store.services.map((service) => {
          const economics = store.serviceEconomics(service.id);
          return (
            <li key={service.id}>
              <button
                type="button"
                onClick={() => setSelectedId(service.id)}
                className={card + ' flex w-full items-center justify-between text-left transition hover:border-rose-300'}
              >
                <div>
                  <div className="font-medium">{service.name}</div>
                  <div className="text-sm text-neutral-500">Precio {formatMoney(service.price)}</div>
                </div>
                <div className="flex items-center gap-3">
                  {economics && (
                    <div className="text-right">
                      <div className="text-xs text-neutral-400">Margen</div>
                      <div className={'font-semibold ' + (economics.margin >= 0 ? 'text-green-700' : 'text-red-700')}>
                        {formatMoney(economics.margin)}
                      </div>
                    </div>
                  )}
                  <span className="text-neutral-300">›</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
