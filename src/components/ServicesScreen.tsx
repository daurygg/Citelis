// Pantalla de configuración de servicios (calculadora "por tandas").
import { useStore } from '../lib/store/StoreContext';
import { ServiceConfigCard } from './ServiceConfigCard';

export function ServicesScreen() {
  const store = useStore();
  return (
    <section>
      <h2>Servicios y costos</h2>
      <p style={{ color: '#6b7280' }}>
        Configura cuánto cobras y cuánto te cuestan los insumos. El costo se actualiza solo.
      </p>
      {store.services.map((service) => (
        <ServiceConfigCard key={service.id} service={service} />
      ))}
    </section>
  );
}
