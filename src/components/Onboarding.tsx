// Pantalla de bienvenida para usuarios sin negocio: crear uno nuevo (queda como
// dueña) o unirse a uno existente con un código de invitación. Llama a funciones
// RPC de Supabase (SECURITY DEFINER). Tras el éxito, recarga para cargar los datos.
import { useState } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import { supabase } from '../lib/supabase/client';
import { btnGhost, btnPrimary, card, field, fieldLabel, input } from './ui';

export function Onboarding() {
  const { signOut } = useAuth();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createBusiness() {
    if (name.trim() === '') return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('create_business', { p_name: name.trim() });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    window.location.reload();
  }

  async function joinBusiness() {
    if (code.trim() === '') return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('redeem_invitation', { p_code: code.trim() });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-16 text-neutral-900">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-rose-700">Citelis</h1>
        <p className="mb-6 text-center text-sm text-neutral-500">Configura tu negocio para empezar</p>

        {mode === 'choose' && (
          <div className="flex flex-col gap-3">
            <button type="button" className={btnPrimary} onClick={() => setMode('create')}>
              Crear mi negocio
            </button>
            <button type="button" className={btnGhost} onClick={() => setMode('join')}>
              Unirme con un código
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className={card + ' flex flex-col gap-3'}>
            <label className={field}>
              <span className={fieldLabel}>Nombre del negocio</span>
              <input className={input} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Estética Roelis" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="button" className={btnPrimary} disabled={busy || name.trim() === ''} onClick={createBusiness}>
              {busy ? 'Creando…' : 'Crear negocio'}
            </button>
            <button type="button" className="text-sm text-neutral-500 hover:underline" onClick={() => setMode('choose')}>
              ← Volver
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className={card + ' flex flex-col gap-3'}>
            <label className={field}>
              <span className={fieldLabel}>Código de invitación</span>
              <input className={input} type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej: A1B2C3D4" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="button" className={btnPrimary} disabled={busy || code.trim() === ''} onClick={joinBusiness}>
              {busy ? 'Uniéndote…' : 'Unirme'}
            </button>
            <button type="button" className="text-sm text-neutral-500 hover:underline" onClick={() => setMode('choose')}>
              ← Volver
            </button>
          </div>
        )}

        <button type="button" className="mt-6 w-full text-center text-sm text-neutral-500 hover:underline" onClick={() => signOut()}>
          Salir
        </button>
      </div>
    </div>
  );
}
