// Pantalla única para negocios que ya existían antes del registro con perfil
// (odd/tasks/owner-profile.md, S3): si a quien administra le faltan nombre,
// WhatsApp o tipo de negocio, se le piden UNA vez antes de entrar. El servidor
// decide a quién (`owner_profile_pending`): a quien entró por invitación nunca.
//
// Falla abierto: si no se puede consultar (sin conexión, base sin migrar), se entra
// a la app sin pedir nada. Nunca se bloquea el trabajo por estos datos.
//
// Componente hoja: StoreContext.tsx lo importa, así que no puede usar el store.
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import { supabase } from '../lib/supabase/client';
import { friendlyAuthError } from '../lib/domain/authErrors';
import type { OwnerProfile } from '../lib/domain/ownerProfile';
import { LoadingScreen } from './LoadingScreen';
import { OwnerProfileForm } from './OwnerProfileForm';
import { card } from './ui';

type GateState = 'checking' | 'pending' | 'done';

export function OwnerProfileGate({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const [state, setState] = useState<GateState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .rpc('owner_profile_pending')
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) console.error('No se pudo consultar el perfil pendiente', err);
        setState(!err && data === true ? 'pending' : 'done');
      })
      .then(undefined, (e: unknown) => {
        // Falla abierto también si la llamada lanza en vez de devolver `error`.
        console.error('No se pudo consultar el perfil pendiente', e);
        if (active) setState('done');
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(profile: OwnerProfile) {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.rpc('save_owner_profile', {
        p_owner_name: profile.owner_name,
        p_owner_whatsapp: profile.owner_whatsapp,
        p_business_type: profile.business_type,
      });
      if (err) {
        setError(friendlyAuthError(err.message));
        return;
      }
      setState('done');
    } catch (e) {
      setError(friendlyAuthError(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'checking') return <LoadingScreen message="Cargando tus datos…" />;
  if (state === 'done') return <>{children}</>;

  return (
    <div className="min-h-dvh bg-neutral-50 px-4 py-8 sm:py-16 text-neutral-900">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-center text-2xl font-bold text-brand-700">Citelis</h1>
        <div className={card + ' flex flex-col gap-3'}>
          <div>
            <h2 className="text-lg font-semibold">Antes de seguir, cuéntanos de ti</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Es una sola vez. Así sabemos con quién hablar si necesitas ayuda con tu cuenta.
            </p>
          </div>
          <OwnerProfileForm submitLabel="Guardar y entrar" busyLabel="Guardando…" busy={busy} error={error} onSubmit={save} />
        </div>
        <button type="button" className="mt-4 min-h-11 w-full text-center text-sm text-neutral-500 hover:underline" onClick={() => signOut()}>
          Salir
        </button>
      </div>
    </div>
  );
}
