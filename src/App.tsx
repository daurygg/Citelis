// Raíz de la app. Puerta de autenticación: sin sesión → Login; con sesión → la app.
// Dos modos separados (INVARIANTE 3): Servicios y Ropa, cada uno con sus pestañas.
import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth/AuthContext';
import { supabase } from './lib/supabase/client';
import { StoreProvider, useStore } from './lib/store/StoreContext';
import { InventoryProvider } from './lib/store/InventoryContext';
import { useDocumentTitle } from './lib/useDocumentTitle';
import { useBusinessTheme } from './lib/useBusinessTheme';
import { DayAgenda } from './components/DayAgenda';
import { ScheduleForm } from './components/ScheduleForm';
import { ServicesScreen } from './components/ServicesScreen';
import { PeriodReport } from './components/PeriodReport';
import { ProductsScreen } from './components/ProductsScreen';
import { SellForm } from './components/SellForm';
import { ClothingReport } from './components/ClothingReport';
import { CreditsScreen } from './components/CreditsScreen';
import { Login } from './components/Login';
import { PublicBooking } from './components/public/PublicBooking';
import { BookingSettings } from './components/owner/BookingSettings';
import { BrandSettings } from './components/owner/BrandSettings';
import { PublicLinkSettings } from './components/owner/PublicLinkSettings';
import { RequestsInbox } from './components/owner/RequestsInbox';
import { ToastProvider } from './components/Toast';

type Mode = 'services' | 'clothing';
// La identidad del negocio (hoy el color; mañana nombre o logo) manda sobre las
// dos líneas de negocio y sobre el portal público, así que vive en su propia
// pantalla fuera de los modos, no en una pestaña de Servicios.
type Screen = 'work' | 'business';
type ServiceView = 'agenda' | 'reservas' | 'services' | 'report';
type ClothingView = 'sell' | 'products' | 'credits' | 'report';

const SERVICE_TABS: { id: ServiceView; label: string }[] = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'reservas', label: 'Reservas' },
  { id: 'services', label: 'Servicios' },
  { id: 'report', label: 'Reporte' },
];
const CLOTHING_TABS: { id: ClothingView; label: string }[] = [
  { id: 'sell', label: 'Vender' },
  { id: 'products', label: 'Productos' },
  { id: 'credits', label: 'Fiados' },
  { id: 'report', label: 'Reporte' },
];

/**
 * Ruta pública de reserva: /reservar/<slug>. Se lee de la URL porque el proyecto no
 * usa router; si algún día entra uno, esto se sustituye por una ruta de verdad.
 * Devuelve el slug o null si la URL no es la del portal.
 */
function publicBookingSlug(): string | null {
  const match = /^\/reservar\/([^/?#]+)\/?$/.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function App() {
  // El portal público va ANTES de AuthProvider y StoreProvider a propósito: la
  // clienta no tiene cuenta ni negocio, y el árbol autenticado exige ambas cosas.
  const slug = publicBookingSlug();
  if (slug) {
    return (
      <ToastProvider>
        <PublicBooking slug={slug} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ToastProvider>
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

/** Nombre del negocio para mostrar, o "Citelis" si todavía no se conoce o viene vacío. */
function businessDisplayName(name: string | undefined): string {
  return name && name.trim() !== '' ? name.trim() : 'Citelis';
}

function tabButtonClass(active: boolean): string {
  return (
    'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ' +
    (active ? 'bg-white text-brand-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800')
  );
}

function AppShell() {
  const { signOut } = useAuth();
  const { business } = useStore();
  const [screen, setScreen] = useState<Screen>('work');
  const [mode, setMode] = useState<Mode>('services');
  const [serviceView, setServiceView] = useState<ServiceView>('agenda');
  const [clothingView, setClothingView] = useState<ClothingView>('sell');
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const businessName = businessDisplayName(business?.name);
  useDocumentTitle(`${businessName} — ${screen === 'business' ? 'Mi negocio' : 'Agenda'}`);
  useBusinessTheme(business?.theme_color);

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
            <h1 className="text-xl font-bold tracking-tight text-brand-700">{businessName}</h1>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-sm text-neutral-500 hover:text-neutral-800"
                onClick={() => setScreen(screen === 'business' ? 'work' : 'business')}
              >
                {screen === 'business' ? 'Volver' : 'Mi negocio'}
              </button>
              <button type="button" className="text-sm text-neutral-500 hover:text-neutral-800" onClick={invite}>
                Invitar
              </button>
              <button type="button" className="text-sm text-neutral-500 hover:text-neutral-800" onClick={() => signOut()}>
                Salir
              </button>
            </div>
          </div>

          {inviteCode && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm">
              <span>
                Comparte este código: <strong className="tracking-widest">{inviteCode}</strong>
              </span>
              <button type="button" className="text-brand-700 hover:underline" onClick={() => setInviteCode(null)}>
                Cerrar
              </button>
            </div>
          )}

          {screen === 'work' && (
            <>
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
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6">
        {screen === 'business' ? (
          <div className="flex flex-col gap-6">
            <BrandSettings />
            <PublicLinkSettings />
          </div>
        ) : mode === 'services' ? (
          <>
            {serviceView === 'agenda' && (
              <div className="flex flex-col gap-6">
                <ScheduleForm />
                <DayAgenda />
              </div>
            )}
            {serviceView === 'reservas' && (
              <div className="flex flex-col gap-6">
                <RequestsInbox />
                <BookingSettings />
              </div>
            )}
            {serviceView === 'services' && <ServicesScreen />}
            {serviceView === 'report' && <PeriodReport />}
          </>
        ) : (
          <InventoryProvider>
            {clothingView === 'sell' && <SellForm />}
            {clothingView === 'products' && <ProductsScreen />}
            {clothingView === 'credits' && <CreditsScreen />}
            {clothingView === 'report' && <ClothingReport />}
          </InventoryProvider>
        )}
      </main>
    </div>
  );
}
