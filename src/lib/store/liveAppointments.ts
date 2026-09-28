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
// dobles. `useLiveAppointments` solo la arranca y la para.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appointment } from '../domain/types';
import type { AppointmentChange } from './appointmentSync';

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

  async function resync(): Promise<void> {
    const ticket = ++latestResync;
    const { data, error } = await client
      .from('appointment')
      .select('*')
      .eq('business_id', businessId); // INVARIANTE 1: explícito, además de la RLS
    if (stopped || ticket !== latestResync) return;
    if (error || !data) {
      // Se conserva lo que había: una lista vacía por un corte de red sería
      // peor que una lista con un rato de atraso.
      onError('No se pudieron poner al día las citas', error);
      return;
    }
    onResync(data as Appointment[]);
  }

  const filter = `business_id=eq.${businessId}`;
  const deliver = (eventType: AppointmentChange['eventType']) => (payload: { new: unknown }) => {
    if (stopped) return;
    onChange({ eventType, new: payload.new as Appointment });
  };

  // Sin DELETE: en Realtime los DELETE no pasan por la RLS, y en la app las
  // citas nunca se borran (solo cambian de estado).
  const channel = client
    .channel(`appointments:${businessId}`)
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
