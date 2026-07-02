// Raíz de la app. Puerta de autenticación: sin sesión → Login; con sesión → la app.
import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth/AuthContext';
import { supabase } from './lib/supabase/client';
import { StoreProvider } from './lib/store/StoreContext';
import { DayAgenda } from './components/DayAgenda';
import { ScheduleForm } from './components/ScheduleForm';
import { ServicesScreen } from './components/ServicesScreen';
import { PeriodReport } from './components/PeriodReport';
import { Login } from './components/Login';

type View = 'agenda' | 'services' | 'report';

const TABS: { id: View; label: string }[] = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'services', label: 'Servicios' },
  { id: 'report', label: 'Reporte' },
];

export function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

// Decide qué mostrar según la sesión.
function Root() {
  const { session, loading } = useAuth();
  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-neutral-50 text-neutral-500">Cargando…</div>;
  }
  if (!session) return <Login />;
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}

// La app autenticada: cabecera con pestañas + salir, y la pantalla activa.
function AppShell() {
  const { signOut } = useAuth();
  const [view, setView] = useState<View>('agenda');
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  async function invite() {
    const { data, error } = await supabase.rpc('create_invitation');
    if (error) {
      window.alert('No se pudo generar la invitación: ' + error.message);
      return;
    }
    setInviteCode(data as string);
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight text-rose-700">Citelis</h1>
            <div className="flex items-center gap-3">
              <button type="button" className="text-sm text-neutral-500 hover:text-neutral-800" onClick={invite}>
                Invitar
              </button>
              <button type="button" className="text-sm text-neutral-500 hover:text-neutral-800" onClick={() => signOut()}>
                Salir
              </button>
            </div>
          </div>

          {inviteCode && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm">
              <span>
                Comparte este código: <strong className="tracking-widest">{inviteCode}</strong>
              </span>
              <button type="button" className="text-rose-700 hover:underline" onClick={() => setInviteCode(null)}>
                Cerrar
              </button>
            </div>
          )}
          <nav className="mt-3 flex gap-1 rounded-xl bg-neutral-100 p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                className={
                  'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ' +
                  (view === tab.id ? 'bg-white text-rose-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800')
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
  );
}
