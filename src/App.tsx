// Raíz de la app. Puerta de autenticación: sin sesión → Login; con sesión → la app.
// Dos modos separados (INVARIANTE 3): Servicios y Ropa, cada uno con sus pestañas.
import { useEffect, useRef, useState } from 'react';
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
import { ServiceCreditsScreen } from './components/ServiceCreditsScreen';
import { Login } from './components/Login';
import { PublicBooking } from './components/public/PublicBooking';
import { PublicReceipt } from './components/public/PublicReceipt';
import { BookingSettings } from './components/owner/BookingSettings';
import { EmployeeSettings } from './components/owner/EmployeeSettings';
import { BrandSettings } from './components/owner/BrandSettings';
import { ReceiptSettings } from './components/owner/ReceiptSettings';
import { PublicLinkSettings } from './components/owner/PublicLinkSettings';
import { PushNotificationSettings } from './components/owner/PushNotificationSettings';
import { RequestsInbox } from './components/owner/RequestsInbox';
import { ToastProvider } from './components/Toast';
import { SubscriptionNoticeBar } from './components/SubscriptionNotice';
import { BlockedScreen } from './components/BlockedScreen';
import { AdminPanel } from './components/admin/AdminPanel';
import { CITELIS_WHATSAPP } from './lib/subscription/paymentInstructions';
import { useIsPlatformAdmin, useMySubscription } from './lib/subscription/useSubscriptionState';
import { subscriptionNotice, whatsappPaymentLink, type SubscriptionNotice } from './lib/domain/subscriptionView';
import { initialViewFromSearch, type Screen, type ServiceView } from './lib/initialView';

type Mode = 'services' | 'clothing';
type ClothingView = 'sell' | 'products' | 'credits' | 'report';

const SERVICE_TABS: { id: ServiceView; label: string }[] = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'reservas', label: 'Reservas' },
  { id: 'services', label: 'Servicios' },
  { id: 'credits', label: 'Créditos' },
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

/**
 * Ruta pública del recibo digital: /recibo/<token>. La forma exacta del uuid se vuelve
 * a validar antes de llamar al servidor (ver `isReceiptToken`).
 */
function publicReceiptToken(): string | null {
  const match = /^\/recibo\/([0-9a-f-]{36})\/?$/i.exec(window.location.pathname);
  return match ? match[1] : null;
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

  const receiptToken = publicReceiptToken();
  if (receiptToken) return <PublicReceipt token={receiptToken} />;

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
    return <div className="grid min-h-dvh place-items-center bg-paper text-muted">Cargando…</div>;
  }
  if (!session) return <Login />;
  return <SubscriptionGate />;
}

/**
 * Lee el estado del plan ANTES de montar el store: con el negocio bloqueado el servidor
 * ya no deja leer sus datos, así que cargar el store solo daría errores. Si no se puede
 * leer el estado, la app sigue abierta (falla abierto; el servidor hace cumplir el bloqueo).
 */
function SubscriptionGate() {
  const { signOut } = useAuth();
  const { loading, state } = useMySubscription();
  if (loading) {
    return <div className="grid min-h-dvh place-items-center bg-paper text-muted">Cargando…</div>;
  }
  const notice = subscriptionNotice(state);
  if (notice.kind === 'blocked') {
    // Aquí el store aún no existe, así que no se conoce el nombre del negocio: mensaje sin nombre.
    return <BlockedScreen whatsappUrl={whatsappPaymentLink(CITELIS_WHATSAPP)} onSignOut={() => void signOut()} />;
  }
  return (
    <StoreProvider>
      <AppShell notice={notice} />
    </StoreProvider>
  );
}

/** Nombre del negocio para mostrar, o "Citelis" si todavía no se conoce o viene vacío. */
function businessDisplayName(name: string | undefined): string {
  return name && name.trim() !== '' ? name.trim() : 'Citelis';
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';
const menuItem =
  'min-h-11 rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-paper ' + focusRing;
const headerButton =
  'min-h-11 rounded-lg px-2.5 text-sm font-medium text-muted hover:text-ink ' + focusRing;

/** Cambio de modo (Servicios / Ropa): pastilla segmentada pequeña, quieta. */
function modeButtonClass(active: boolean): string {
  return (
    'min-h-11 flex-1 rounded-lg px-3 text-sm font-medium transition ' +
    focusRing +
    (active ? ' bg-white text-ink shadow-sm' : ' text-muted hover:text-ink')
  );
}

/** Pestaña con subrayado de marca: la activa lleva tinta y una barra de 2px. */
function tabButtonClass(active: boolean): string {
  return (
    'relative min-h-11 shrink-0 whitespace-nowrap px-3.5 text-sm font-medium transition ' +
    focusRing +
    (active
      ? ' text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-700'
      : ' text-muted hover:text-ink')
  );
}

function AppShell({ notice }: { notice: SubscriptionNotice }) {
  const { signOut } = useAuth();
  const isPlatformAdmin = useIsPlatformAdmin();
  const [adminOpen, setAdminOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrap = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);

  // Patrón de divulgación: el menú se cierra con Escape (devolviendo el foco a
  // "Más") y al tocar fuera de él.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuTrigger.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!menuWrap.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);
  const { business } = useStore();
  // Si la app se abrió desde el toque de un aviso push (?vista=reservas),
  // arranca directo en la bandeja de reservas en vez de en la agenda.
  const [screen, setScreen] = useState<Screen>(() => initialViewFromSearch(window.location.search).screen);
  const [mode, setMode] = useState<Mode>('services');
  const [serviceView, setServiceView] = useState<ServiceView>(
    () => initialViewFromSearch(window.location.search).serviceView,
  );
  const [clothingView, setClothingView] = useState<ClothingView>('sell');
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  useEffect(() => {
    // Limpia SOLO `?vista=`: un refresco no debe volver a forzar la pestaña,
    // y la barra de direcciones no debe quedar con el parámetro del push.
    // Cualquier otro parámetro futuro se conserva.
    const params = new URLSearchParams(window.location.search);
    if (params.has('vista')) {
      params.delete('vista');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
  }, []);

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
    <div className="min-h-dvh bg-paper text-ink">
      {/* Solo la barra de pestañas queda fija: el título y el cambio de modo se
          van con el scroll para no comerse ~150px de pantalla. */}
      <header className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-xl px-4 pt-3 pb-1">
          <div className="flex items-center justify-between gap-2">
            <h1 className="display-name min-w-0 truncate text-2xl leading-tight font-extrabold tracking-tight">{businessName}</h1>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                className={headerButton}
                onClick={() => setScreen(screen === 'business' ? 'work' : 'business')}
              >
                {screen === 'business' ? 'Volver' : 'Mi negocio'}
              </button>
              {/* El resto de acciones, plegadas: el nombre del negocio se queda con el ancho. */}
              <div className="relative" ref={menuWrap}>
                <button
                  ref={menuTrigger}
                  type="button"
                  className={headerButton}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  Más
                </button>
                {menuOpen && (
                  <div className="absolute top-full right-0 z-20 mt-1 flex min-w-40 flex-col rounded-xl bg-white p-1 ring-1 ring-line">
                    {isPlatformAdmin && (
                      <button
                        type="button"
                        className={menuItem}
                        onClick={() => {
                          setAdminOpen(!adminOpen);
                          setMenuOpen(false);
                        }}
                      >
                        {adminOpen ? 'Cerrar panel' : 'Administrar'}
                      </button>
                    )}
                    <button
                      type="button"
                      className={menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        void invite();
                      }}
                    >
                      Invitar
                    </button>
                    <button type="button" className={menuItem} onClick={() => signOut()}>
                      Salir
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {inviteCode && (
            <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm">
              <span className="min-w-0">
                Comparte este código: <strong className="tracking-widest">{inviteCode}</strong>
              </span>
              <button type="button" className={"shrink-0 " + headerButton} onClick={() => setInviteCode(null)}>
                Cerrar
              </button>
            </div>
          )}

          {screen === 'work' && (
            /* Cambio de modo: Servicios / Ropa (líneas de negocio separadas) */
            <div className="mt-1 flex gap-1 rounded-xl bg-line/60 p-1">
              <button type="button" className={modeButtonClass(mode === 'services')} aria-pressed={mode === 'services'} onClick={() => setMode('services')}>
                Servicios
              </button>
              <button type="button" className={modeButtonClass(mode === 'clothing')} aria-pressed={mode === 'clothing'} onClick={() => setMode('clothing')}>
                Ropa
              </button>
            </div>
          )}
        </div>
      </header>

      {notice.kind === 'warning' && <SubscriptionNoticeBar notice={notice} payUrl={whatsappPaymentLink(CITELIS_WHATSAPP, business?.name)} />}

      {screen === 'work' && !adminOpen && (
        /* Pestañas del modo activo */
        <nav className="sticky top-0 z-10 mt-1 border-b border-line bg-paper">
          <div className="mx-auto max-w-xl px-2">
            {/* Con 5 pestañas no caben en un teléfono angosto: la barra se desplaza
                sola en vez de ensanchar toda la página. */}
            <div className="flex overflow-x-auto">
              {mode === 'services'
                ? SERVICE_TABS.map((tab) => (
                    <button key={tab.id} type="button" className={tabButtonClass(serviceView === tab.id)} aria-current={serviceView === tab.id ? 'page' : undefined} onClick={() => setServiceView(tab.id)}>
                      {tab.label}
                    </button>
                  ))
                : CLOTHING_TABS.map((tab) => (
                    <button key={tab.id} type="button" className={tabButtonClass(clothingView === tab.id)} aria-current={clothingView === tab.id ? 'page' : undefined} onClick={() => setClothingView(tab.id)}>
                      {tab.label}
                    </button>
                  ))}
            </div>
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-xl px-4 py-5">
        {adminOpen && isPlatformAdmin ? (
          <AdminPanel />
        ) : screen === 'business' ? (
          <div className="flex flex-col gap-4">
            <BrandSettings />
            <ReceiptSettings />
            <PublicLinkSettings />
            <EmployeeSettings />
            <PushNotificationSettings />
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
            {serviceView === 'credits' && <ServiceCreditsScreen />}
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
