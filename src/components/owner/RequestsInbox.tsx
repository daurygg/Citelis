// Bandeja de solicitudes: la clienta pidió un horario desde el portal público
// y espera respuesta. Mientras nadie conteste, esa hora sigue apartada
// (holdsSchedule en appointments.ts trata REQUESTED como ocupante), así que el
// conteo tiene que notarse: una solicitud olvidada bloquea el horario de otras.
import { useState } from 'react';
import { useStore } from '../../lib/store/StoreContext';
import { useToast } from '../Toast';
import { formatDateShort, formatMoney, formatTime } from '../../lib/format';
import { CalendarActions } from '../CalendarActions';
import type { Appointment } from '../../lib/domain/types';
import { btnGhost, btnPrimary, card } from '../ui';

export function RequestsInbox() {
  const store = useStore();
  const { notify } = useToast();
  const requests = store.pendingRequests();
  // La solicitud aceptada sale de la bandeja en el acto, así que guardamos la cita
  // para poder ofrecer el calendario ahí mismo: es el momento en que la dueña tiene
  // a la clienta en la cabeza. Solo se leen datos que la aceptación no cambia
  // (quién, cuándo, qué servicio), nunca el estado.
  const [justAccepted, setJustAccepted] = useState<Appointment | null>(null);

  function handleAccept(request: Appointment) {
    store.acceptRequest(request.id);
    setJustAccepted(request);
    notify(`✓ Cita de ${request.client} aceptada`);
  }

  function handleReject(id: number, client: string) {
    if (!window.confirm(`¿Rechazar la solicitud de ${client}?`)) return;
    store.rejectRequest(id);
    notify(`Solicitud de ${client} rechazada`);
  }

  return (
    <div className={card + ' flex flex-col gap-3'}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Solicitudes por responder</h2>
        {requests.length > 0 && (
          <span className="rounded-full bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white">
            {requests.length}
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-neutral-500">No tienes solicitudes esperando respuesta.</p>
      ) : (
        <p className="text-sm text-brand-700">
          Mientras no respondas, esa hora queda apartada y nadie más puede pedirla.
        </p>
      )}

      {requests.length > 0 && (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => {
            const service = store.services.find((s) => s.id === request.service_id);
            return (
              <li key={request.id} className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{request.client}</span>
                  <span className="text-sm text-neutral-600">{request.client_phone ?? 'Sin teléfono'}</span>
                </div>
                <div className="text-sm text-neutral-700">
                  {service?.name ?? 'Servicio desconocido'} · {formatDateShort(request.datetime)} ·{' '}
                  {formatTime(request.datetime)}
                </div>
                {request.quoted_price != null && (
                  <div className="text-sm text-neutral-600">Precio acordado: {formatMoney(request.quoted_price)}</div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={btnPrimary + ' px-3 py-1.5 text-sm'}
                    onClick={() => handleAccept(request)}
                  >
                    Aceptar
                  </button>
                  <button
                    type="button"
                    className={btnGhost + ' px-3 py-1.5 text-sm'}
                    onClick={() => handleReject(request.id, request.client)}
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {justAccepted && (
        <div className="flex flex-col gap-2 rounded-xl border border-green-200 bg-green-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-green-900">
              Cita de {justAccepted.client} aceptada, {formatDateShort(justAccepted.datetime)} a las{' '}
              {formatTime(justAccepted.datetime)}.
            </p>
            <button
              type="button"
              className="shrink-0 text-sm text-neutral-500 hover:underline"
              onClick={() => setJustAccepted(null)}
            >
              Listo
            </button>
          </div>
          <CalendarActions appointment={justAccepted} />
        </div>
      )}
    </div>
  );
}
