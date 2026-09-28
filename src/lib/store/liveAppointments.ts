// Mantiene al día las citas de la dueña mientras usa la app (odd/tasks/live-appointments.md, T3).
//
// Dos mecanismos, porque ninguno alcanza solo:
//   1. Realtime: un WebSocket por el que Supabase empuja cada INSERT/UPDATE de
//      `appointment` de SU negocio. Es lo que hace que la reserva aparezca sola
//      con la app abierta.
//   2. Ponerse al día: con la app en segundo plano, iOS suspende el JS y corta el
//      socket, y lo que entra mientras tanto no llega por el canal. Por eso se
//      vuelven a pedir las citas al volver a la app (`visibilitychange`) y en
//      cada `SUBSCRIBED`, que Realtime emite al conectar Y al reconectar.
//
// No depende de React: recibe el cliente y el documento, así se prueba con
// dobles. Un `useEffect` de `StoreReady` la arranca y la para.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appointment } from '../domain/types';
import { applyAppointmentChange, type AppointmentChange } from './appointmentSync';

export type LiveClient = Pick<SupabaseClient, 'channel' | 'removeChannel' | 'from'>;

export interface LiveAppointmentsOptions {
  client: LiveClient;
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  businessId: number;
  /** Un cambio que llegó por el canal. */
  onChange: (change: AppointmentChange) => void;
  /** La lista completa y fresca del servidor, tras ponerse al día. */
  onResync: (appointments: Appointment[]) => void;
  onError?: (message: string, detail?: unknown) => void;
}

/** Arranca la escucha y devuelve la función que la para. */
export function startLiveAppointments(options: LiveAppointmentsOptions): () => void {
  const { client, doc, businessId, onChange, onResync } = options;
  const onError = options.onError ?? ((message, detail) => console.warn(message, detail));
  let stopped = false;
  // Solo cuenta la última puesta al día: si dos se cruzan (volver a la app y
  // reconectar a la vez), una respuesta vieja no pisa a una nueva.
  let latestResync = 0;
  // Lo que llega por el canal MIENTRAS la consulta está en vuelo. La foto se
  // tomó antes, así que sin esto la reserva que entra justo al conectar (el
  // momento más probable) desaparecería al llegar la respuesta. Se reaplica
  // encima de la foto. Las escrituras propias vuelven como eco por este mismo
  // canal, así que también quedan cubiertas.
  let sinceFetch: AppointmentChange[] | null = null;

  async function resync(): Promise<void> {
    const ticket = ++latestResync;
    sinceFetch = [];
    const { data, error } = await client
      .from('appointment')
      .select('*')
      .eq('business_id', businessId); // INVARIANTE 1: explícito, además de la RLS
    if (stopped || ticket !== latestResync) return;
    const arrived = sinceFetch ?? [];
    sinceFetch = null;
    if (error || !data) {
      // Se conserva lo que había: una lista vacía por un corte de red sería
      // peor que una lista con un rato de atraso.
      onError('No se pudieron poner al día las citas', error);
      return;
    }
    const fresh = arrived.reduce<readonly Appointment[]>(
      (list, change) => applyAppointmentChange(list, change, businessId),
      data as Appointment[],
    );
    onResync([...fresh]);
  }

  const filter = `business_id=eq.${businessId}`;
  const deliver = (eventType: AppointmentChange['eventType']) => (payload: { new: unknown }) => {
    if (stopped) return;
    const change: AppointmentChange = { eventType, new: payload.new as Appointment };
    sinceFetch?.push(change);
    onChange(change);
  };

  // Sin DELETE: en Realtime los DELETE no pasan por la RLS, y en la app las
  // citas nunca se borran (solo cambian de estado).
  // Tema único por arranque: realtime-js devuelve el canal EXISTENTE si el tema
  // se repite (RealtimeClient.channel), y a uno ya suscrito no se le pueden
  // añadir escuchas. Pasa cuando React monta dos veces seguidas (StrictMode) y
  // la limpieza anterior, que es asíncrona, aún no terminó.
  const topic = `appointments:${businessId}:${Math.random().toString(36).slice(2)}`;
  const channel = client
    .channel(topic)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointment', filter }, deliver('INSERT'))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointment', filter }, deliver('UPDATE'))
    .subscribe((status) => {
      // CHANNEL_ERROR / TIMED_OUT / CLOSED: el cliente reintenta solo, y el
      // SUBSCRIBED de la reconexión es el que trae la puesta al día.
      if (status === 'SUBSCRIBED') void resync();
    });

  const onVisibility = () => {
    if (doc.visibilityState === 'visible') void resync();
  };
  doc.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopped = true;
    doc.removeEventListener('visibilitychange', onVisibility);
    void client.removeChannel(channel);
  };
}
