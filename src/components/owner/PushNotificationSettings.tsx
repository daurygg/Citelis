// Botón para que la dueña reciba un aviso en su iPhone cuando entra una
// reserva nueva (T5, odd/tasks/owner-push-notifications.md). Cero cálculos
// aquí (INVARIANTE 5): `pushButtonState` (puro) decide qué estado mostrar,
// `pushSubscriptionApi` (adaptador) habla con el navegador y Supabase.
import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store/StoreContext';
import { useToast } from '../Toast';
import { isIOSDevice, pushButtonState, type PushButtonState } from '../../lib/push/pushSupport';
import { disablePush, enablePush, readPushEnvironment } from '../../lib/push/pushSubscriptionApi';
import { btnGhost, btnPrimary, card } from '../ui';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function PushNotificationSettings() {
  const store = useStore();
  const { notify } = useToast();
  const [state, setState] = useState<PushButtonState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const env = await readPushEnvironment();
    setState(pushButtonState(env));
  }

  useEffect(() => {
    // Solo al montar: el entorno (permiso, suscripción) se vuelve a leer
    // después de cada acción vía `refresh()`, no hace falta repetirlo aquí.
    refresh();
  }, []);

  if (!VAPID_PUBLIC_KEY) {
    return (
      <div className={card + ' flex flex-col gap-2'}>
        <h2 className="text-lg font-semibold">Avisos de nuevas reservas</h2>
        <p className="text-sm text-neutral-500">Todavía no están listos para tu negocio.</p>
      </div>
    );
  }

  async function handleEnable() {
    if (!store.business) return;
    setBusy(true);
    try {
      await enablePush(store.business.id, VAPID_PUBLIC_KEY);
      notify('✓ Ahora te avisamos de las reservas nuevas');
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo activar el aviso', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!store.business) return;
    setBusy(true);
    try {
      await disablePush(store.business.id);
      notify('Avisos apagados');
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo apagar el aviso', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card + ' flex flex-col gap-3'}>
      <h2 className="text-lg font-semibold">Avisos de nuevas reservas</h2>

      {state === 'loading' && <p className="text-sm text-neutral-500">Comprobando…</p>}

      {state === 'unsupported' && (
        <p className="text-sm text-neutral-500">
          Este teléfono o navegador no puede recibir avisos.
          {isIOSDevice(navigator.userAgent, navigator.maxTouchPoints) &&
            ' Prueba a actualizar el sistema de tu iPhone.'}
        </p>
      )}

      {state === 'needs-install' && (
        <div className="text-sm text-neutral-600">
          <p>Para recibir avisos, primero añade Citelis a tu pantalla de inicio:</p>
          <ol className="mt-2 list-decimal pl-5">
            <li>Toca el botón de Compartir (el cuadrado con la flecha hacia arriba).</li>
            <li>Elige "Añadir a pantalla de inicio".</li>
            <li>Abre Citelis desde ese ícono nuevo y vuelve a esta pantalla.</li>
          </ol>
        </div>
      )}

      {state === 'denied' && (
        <p className="text-sm text-neutral-600">
          Tienes los avisos bloqueados para Citelis. Para activarlos: Ajustes → Notificaciones → Citelis, y
          permítelos ahí.
        </p>
      )}

      {state === 'off' && (
        <button type="button" className={btnPrimary} disabled={busy} onClick={handleEnable}>
          {busy ? 'Activando…' : 'Avisarme de nuevas reservas'}
        </button>
      )}

      {state === 'on' && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-neutral-600">Este teléfono te avisa cuando entra una reserva.</p>
          <button type="button" className={btnGhost} disabled={busy} onClick={handleDisable}>
            {busy ? 'Apagando…' : 'Dejar de avisarme'}
          </button>
        </div>
      )}
    </div>
  );
}
