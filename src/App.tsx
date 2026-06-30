// Raíz de la app. Envuelve todo con el StoreProvider para que cualquier
// pantalla pueda pedir el store con useStore().
import { StoreProvider } from './lib/store/StoreContext';
import { DayAgenda } from './components/DayAgenda';

export function App() {
  return (
    <StoreProvider>
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
        <h1>Citelis</h1>
        <DayAgenda />
      </main>
    </StoreProvider>
  );
}
