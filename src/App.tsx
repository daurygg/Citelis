// Raíz de la app: shell mobile-first con cabecera y pestañas.
// Navegación simple por estado (sin router): una variable decide qué pantalla pintar.
import { useState } from 'react';
import { StoreProvider } from './lib/store/StoreContext';
import { DayAgenda } from './components/DayAgenda';
import { ScheduleForm } from './components/ScheduleForm';
import { ServicesScreen } from './components/ServicesScreen';
import { PeriodReport } from './components/PeriodReport';

type View = 'agenda' | 'services' | 'report';

const TABS: { id: View; label: string }[] = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'services', label: 'Servicios' },
  { id: 'report', label: 'Reporte' },
];

export function App() {
  const [view, setView] = useState<View>('agenda');

  return (
    <StoreProvider>
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
          <div className="mx-auto max-w-xl px-4 py-3">
            <h1 className="text-xl font-bold tracking-tight text-rose-700">Citelis</h1>
            <nav className="mt-3 flex gap-1 rounded-xl bg-neutral-100 p-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  className={
                    'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ' +
                    (view === tab.id
                      ? 'bg-white text-rose-700 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-800')
                  }
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-xl px-4 py-6">
          {view === 'agenda' && (
            <div className="flex flex-col gap-6">
              <ScheduleForm />
              <DayAgenda />
            </div>
          )}
          {view === 'services' && <ServicesScreen />}
          {view === 'report' && <PeriodReport />}
        </main>
      </div>
    </StoreProvider>
  );
}
