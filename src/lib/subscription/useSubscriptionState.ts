// Hooks de la suscripción: leen del servidor una vez al montar. Viven fuera de los
// componentes visuales para que estos sean presentacionales.
import { useEffect, useState } from 'react';
import type { SubscriptionState } from '../domain/types';
import { fetchIsPlatformAdmin, fetchMySubscription } from './subscriptionApi';

/** `loading` mientras se consulta; luego `state` (null = no se pudo leer: no se bloquea). */
export function useMySubscription(): { loading: boolean; state: SubscriptionState | null } {
  const [result, setResult] = useState<{ loading: boolean; state: SubscriptionState | null }>({ loading: true, state: null });
  useEffect(() => {
    let alive = true;
    void fetchMySubscription().then((state) => {
      if (alive) setResult({ loading: false, state });
    });
    return () => {
      alive = false;
    };
  }, []);
  return result;
}

export function useIsPlatformAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchIsPlatformAdmin().then((v) => {
      if (alive) setIsAdmin(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return isAdmin;
}
