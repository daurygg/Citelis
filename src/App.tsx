// Raíz de la app. Envuelve todo con el StoreProvider para que cualquier
// pantalla pueda pedir el store con useStore(). Navegación simple por estado
// (sin router todavía): basta una variable que decide qué pantalla pintar.
import { useState } from 'react';
import { StoreProvider } from './lib/store/StoreContext';
import { DayAgenda } from './components/DayAgenda';
import { ScheduleForm } from './components/ScheduleForm';
import { ServicesScreen } from './components/ServicesScreen';
import { WeekReport } from './components/WeekReport';

type View = 'agenda' | 'services' | 'report';

export function App() {
  const [view, setView] = useState<View>('agenda');

  return (
    <StoreProvider>
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
        <h1>Citelis</h1>

        <nav style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button type="button" onClick={() => setView('agenda')} disabled={view === 'agenda'}>
            Agenda
          </button>
          <button type="button" onClick={() => setView('services')} disabled={view === 'services'}>
            Servicios
          </button>
          <button type="button" onClick={() => setView('report')} disabled={view === 'report'}>
            Reporte
          </button>
        </nav>

        {view === 'agenda' && (
          <>
            <ScheduleForm />
            <DayAgenda />
          </>
        )}
        {view === 'services' && <ServicesScreen />}
        {view === 'report' && <WeekReport />}
      </main>
    </StoreProvider>
  );
}
