// Pantalla de Servicios: lista de solo lectura que destaca el margen de cada
// servicio. Tocar una tarjeta abre su editor enfocado (patrón lista → detalle).
import { useState } from 'react';
import { useStore } from '../lib/store/StoreContext';
import { formatMoney } from '../lib/format';
import { ServiceEditor } from './ServiceEditor';
import { btnPrimary, rowDivider, screenTitle, surface } from './ui';

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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={screenTitle}>Servicios y costos</h2>
          <p className="text-muted">Toca un servicio para editarlo.</p>
        </div>
        <button type="button" className={btnPrimary + ' shrink-0'} onClick={handleNew}>
          Nuevo servicio
        </button>
      </div>

      {store.services.length === 0 ? (
        <div className={surface + ' p-5'}>
          <p className="font-semibold">Aún no tienes servicios</p>
          <p className="mt-1 text-muted">Añade el primero con “Nuevo servicio” y ponle su precio.</p>
        </div>
      ) : (
        <ul className={surface + ' ' + rowDivider}>
          {store.services.map((service) => {
            const economics = store.serviceEconomics(service.id);
            return (
              <li key={service.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(service.id)}
                  className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700"
                >
                  <div className="min-w-0">
                    <div className="font-semibold break-words">{service.name}</div>
                    <div className="text-sm text-muted tabular-nums">Precio {formatMoney(service.price)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {economics && (
                      <div className="text-right tabular-nums">
                        <div className="text-sm text-muted">Margen</div>
                        <div className={'font-semibold ' + (economics.margin >= 0 ? 'text-green-700' : 'text-red-700')}>
                          {formatMoney(economics.margin)}
                        </div>
                      </div>
                    )}
                    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m6 3.5 4.5 4.5-4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
