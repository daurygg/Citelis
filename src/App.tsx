// Raíz de la app. Puerta de autenticación: sin sesión → Login; con sesión → la app.
// Dos modos separados (INVARIANTE 3): Servicios y Ropa, cada uno con sus pestañas.
import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth/AuthContext';
import { supabase } from './lib/supabase/client';
import { StoreProvider } from './lib/store/StoreContext';
import { InventoryProvider } from './lib/store/InventoryContext';
import { DayAgenda } from './components/DayAgenda';
import { ScheduleForm } from './components/ScheduleForm';
import { ServicesScreen } from './components/ServicesScreen';
import { PeriodReport } from './components/PeriodReport';
import { ProductsScreen } from './components/ProductsScreen';
import { SellForm } from './components/SellForm';
import { ClothingReport } from './components/ClothingReport';
import { Login } from './components/Login';

type Mode = 'services' | 'clothing';
type ServiceView = 'agenda' | 'services' | 'report';
type ClothingView = 'sell' | 'products' | 'report';

const SERVICE_TABS: { id: ServiceView; label: string }[] = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'services', label: 'Servicios' },
  { id: 'report', label: 'Reporte' },
];
const CLOTHING_TABS: { id: ClothingView; label: string }[] = [
  { id: 'sell', label: 'Vender' },
  { id: 'products', label: 'Productos' },
  { id: 'report', label: 'Reporte' },
];

export function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

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

function tabButtonClass(active: boolean): string {
  return (
    'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ' +
    (active ? 'bg-white text-rose-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800')
  );
}

function AppShell() {
  const { signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('services');
  const [serviceView, setServiceView] = useState<ServiceView>('agenda');
  const [clothingView, setClothingView] = useState<ClothingView>('sell');
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

          {/* Cambio de modo: Servicios / Ropa (líneas de negocio separadas) */}
          <div className="mt-3 flex gap-1 rounded-xl bg-neutral-100 p-1">
            <button type="button" className={tabButtonClass(mode === 'services')} onClick={() => setMode('services')}>
              Servicios
            </button>
            <button type="button" className={tabButtonClass(mode === 'clothing')} onClick={() => setMode('clothing')}>
              Ropa
            </button>
          </div>

          {/* Pestañas del modo activo */}
          <nav className="mt-2 flex gap-1 rounded-xl bg-neutral-100 p-1">
            {mode === 'services'
              ? SERVICE_TABS.map((tab) => (
                  <button key={tab.id} type="button" className={tabButtonClass(serviceView === tab.id)} onClick={() => setServiceView(tab.id)}>
                    {tab.label}
                  </button>
                ))
              : CLOTHING_TABS.map((tab) => (
                  <button key={tab.id} type="button" className={tabButtonClass(clothingView === tab.id)} onClick={() => setClothingView(tab.id)}>
                    {tab.label}
                  </button>
                ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6">
        {mode === 'services' ? (
          <>
            {serviceView === 'agenda' && (
              <div className="flex flex-col gap-6">
                <ScheduleForm />
                <DayAgenda />
              </div>
            )}
            {serviceView === 'services' && <ServicesScreen />}
            {serviceView === 'report' && <PeriodReport />}
          </>
        ) : (
          <InventoryProvider>
            {clothingView === 'sell' && <SellForm />}
            {clothingView === 'products' && <ProductsScreen />}
            {clothingView === 'report' && <ClothingReport />}
          </InventoryProvider>
        )}
      </main>
    </div>
  );
}
