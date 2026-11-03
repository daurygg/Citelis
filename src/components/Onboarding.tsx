// Pantalla para usuarios sin negocio: bienvenida, paso 1 del asistente (nombre y
// color del negocio) y la vía secundaria de unirse con un código. Llama a RPC de
// Supabase (SECURITY DEFINER). Tras el éxito NO recarga la página: avisa al
// StoreProvider (`onCreated`/`onJoined`), que vuelve a cargar los datos en sitio;
// los pasos 2-4 los pinta OnboardingWizard dentro del store ya cargado.
//
// Este archivo lo importa StoreContext.tsx, así que no puede importar el store
// (formaría un ciclo de imports): por eso solo usa componentes hoja.
import { useState } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import { supabase } from '../lib/supabase/client';
import { friendlyAuthError } from '../lib/domain/authErrors';
import { validateBusinessName } from '../lib/domain/onboarding';
import { DEFAULT_BRAND_COLOR, themeCssVars } from '../lib/domain/theme';
import { slugifyBusinessName } from '../lib/domain/slug';
import { BrandColorPicker } from './BrandColorPicker';
import { WizardProgress } from './WizardProgress';
import { btnPrimary, card, field, fieldLabel, input } from './ui';

type Mode = 'welcome' | 'create' | 'join';

export function Onboarding({ onCreated, onJoined }: { onCreated: () => void; onJoined: () => void }) {
  const { signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('welcome');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [color, setColor] = useState(DEFAULT_BRAND_COLOR);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameError = validateBusinessName(name);

  function goTo(next: Mode) {
    setError(null);
    setMode(next);
  }

  async function createBusiness() {
    setNameTouched(true);
    if (nameError !== null || busy) return;
    setBusy(true);
    setError(null);
    try {
      // El RPC ya tolera un color nulo o mal escrito (cae al default de la
      // columna): nunca hay que bloquear el alta del negocio por el color.
      // El slug lo propone el nombre y el RPC lo valida y lo hace único.
      const trimmedName = name.trim();
      const { error: err } = await supabase.rpc('create_business', {
        p_name: trimmedName,
        p_theme_color: color,
        p_slug: slugifyBusinessName(trimmedName),
      });
      if (err) {
        setError(friendlyAuthError(err.message));
        return;
      }
      onCreated();
    } catch (e) {
      setError(friendlyAuthError(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  }

  async function joinBusiness() {
    if (code.trim() === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.rpc('redeem_invitation', { p_code: code.trim() });
      if (err) {
        setError(friendlyAuthError(err.message));
        return;
      }
      onJoined();
    } catch (e) {
      setError(friendlyAuthError(e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-neutral-50 px-4 py-8 sm:py-16 text-neutral-900">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-brand-700">Citelis</h1>

        {mode === 'welcome' && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-xl font-semibold">Te damos la bienvenida</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Vamos a dejar tu negocio listo en unos 2 minutos, en 3 pasos cortos.
              </p>
            </div>
            <button type="button" className={btnPrimary} onClick={() => goTo('create')}>
              Crear mi negocio
            </button>
            <p className="text-center text-xs text-neutral-500">Cada cuenta puede crear un negocio.</p>
            <div className={card + ' flex flex-col gap-1 text-center'}>
              <p className="text-sm text-neutral-600">¿Te invitaron a un negocio?</p>
              <p className="text-xs text-neutral-500">Es para quien trabaja en un negocio y la dueña le dio un código.</p>
              <button type="button" className="min-h-11 text-sm font-medium text-brand-700 hover:underline" onClick={() => goTo('join')}>
                Unirme con un código
              </button>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div>
            <WizardProgress step="business" />
            <div className={card + ' flex flex-col gap-3'}>
              <h2 className="text-lg font-semibold">Tu negocio</h2>
              <label className={field}>
                <span className={fieldLabel}>Nombre del negocio</span>
                <input
                  className={input}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  placeholder="Ej: Estética Roelis"
                  aria-invalid={nameTouched && nameError !== null}
                  aria-describedby={nameTouched && nameError ? 'business-name-error' : undefined}
                />
                {nameTouched && nameError && (
                  <span id="business-name-error" className="text-sm text-red-600">
                    {nameError}
                  </span>
                )}
              </label>

              <BrandColorPicker value={color} onChange={setColor} />

              {/* Vista previa: las variables de marca se aplican solo a este bloque. */}
              <div style={themeCssVars(color)} className="rounded-xl border border-neutral-200 p-3">
                <p className="mb-2 text-xs text-neutral-500">Así se verá tu color</p>
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white">
                    {name.trim() === '' ? 'Tu negocio' : name.trim()}
                  </span>
                  <span className="text-sm font-medium text-brand-700">Reservar</span>
                </div>
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <button type="button" className={btnPrimary} disabled={busy} onClick={createBusiness}>
                {busy ? 'Creando…' : 'Crear mi negocio'}
              </button>
              <button type="button" className="min-h-11 text-sm text-neutral-500 hover:underline" onClick={() => goTo('welcome')}>
                ← Volver
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className={card + ' flex flex-col gap-3'}>
            <h2 className="text-lg font-semibold">Unirme con un código</h2>
            <p className="text-sm text-neutral-500">Escribe el código que te dio la dueña del negocio.</p>
            <label className={field}>
              <span className={fieldLabel}>Código de invitación</span>
              <input className={input} type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej: A1B2C3D4" />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button type="button" className={btnPrimary} disabled={busy || code.trim() === ''} onClick={joinBusiness}>
              {busy ? 'Uniéndote…' : 'Unirme'}
            </button>
            <button type="button" className="min-h-11 text-sm text-neutral-500 hover:underline" onClick={() => goTo('welcome')}>
              ← Volver
            </button>
          </div>
        )}

        <button type="button" className="mt-4 min-h-11 w-full text-center text-sm text-neutral-500 hover:underline" onClick={() => signOut()}>
          Salir
        </button>
      </div>
    </div>
  );
}
