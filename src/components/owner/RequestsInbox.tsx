// Bandeja de solicitudes: la clienta pidió un horario desde el portal público
// y espera respuesta. Mientras nadie conteste, esa hora sigue apartada
// (holdsSchedule en appointments.ts trata REQUESTED como ocupante), así que el
// conteo tiene que notarse: una solicitud olvidada bloquea el horario de otras.
import { useState } from 'react';
import { useStore } from '../../lib/store/StoreContext';
import { useToast } from '../Toast';
import { formatDateShort, formatMoney, formatTime } from '../../lib/format';
import { CalendarActions } from '../CalendarActions';
import { bookingNoticeMessage, whatsappUrl, type BookingOutcome } from '../../lib/domain/whatsapp';
import type { Appointment } from '../../lib/domain/types';
import { btnGhost, btnPrimary, card } from '../ui';

/** La solicitud que se acaba de responder, y qué se decidió sobre ella. */
interface Answered {
  appointment: Appointment;
  outcome: BookingOutcome;
}

export function RequestsInbox() {
  const store = useStore();
  const { notify } = useToast();
  const requests = store.pendingRequests();
  // La solicitud respondida sale de la bandeja en el acto, así que se guarda para
  // poder ofrecer ahí mismo las dos cosas que solo tienen sentido en ese instante:
  // avisarle a la clienta, y (si se aceptó) anotarla en el calendario de la dueña.
  // Solo se leen datos que la respuesta no cambia (quién, cuándo, qué servicio).
  const [answered, setAnswered] = useState<Answered | null>(null);

  function handleAccept(request: Appointment) {
    store.acceptRequest(request.id);
    setAnswered({ appointment: request, outcome: 'accepted' });
    notify(`✓ Cita de ${request.client} aceptada`);
  }

  function handleReject(request: Appointment) {
    if (!window.confirm(`¿Rechazar la solicitud de ${request.client}?`)) return;
    store.rejectRequest(request.id);
    setAnswered({ appointment: request, outcome: 'rejected' });
    notify(`Solicitud de ${request.client} rechazada`);
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
                    onClick={() => handleReject(request)}
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {answered && <AnsweredPanel answered={answered} onDismiss={() => setAnswered(null)} />}
    </div>
  );
}

/**
 * Lo que aparece justo después de responder. Se muestra en los DOS caminos: una
 * solicitud rechazada sin avisar deja a la clienta esperando una respuesta que no
 * llega, y es la única forma que tiene de enterarse (no hay correo, ni página de
 * estado, ni ninguna RPC pública que devuelva en qué quedó su solicitud).
 */
function AnsweredPanel({ answered, onDismiss }: { answered: Answered; onDismiss: () => void }) {
  const store = useStore();
  const { appointment, outcome } = answered;
  const accepted = outcome === 'accepted';

  const service = store.services.find((s) => s.id === appointment.service_id);
  const dateLabel = formatDateShort(appointment.datetime);
  const timeLabel = formatTime(appointment.datetime);

  const noticeUrl = whatsappUrl(
    appointment.client_phone,
    bookingNoticeMessage({
      outcome,
      clientName: appointment.client,
      businessName: store.business?.name ?? 'tu salón',
      serviceName: service?.name ?? 'tu cita',
      dateLabel,
      timeLabel,
    }),
  );

  const tone = accepted
    ? 'border-green-200 bg-green-50'
    : 'border-amber-200 bg-amber-50';
  const headline = accepted
    ? `Cita de ${appointment.client} aceptada, ${dateLabel} a las ${timeLabel}.`
    : `Solicitud de ${appointment.client} rechazada (${dateLabel} a las ${timeLabel}).`;

  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-neutral-900">{headline}</p>
        <button type="button" className="shrink-0 text-sm text-neutral-500 hover:underline" onClick={onDismiss}>
          Listo
        </button>
      </div>

      {noticeUrl ? (
        <a
          href={noticeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={btnPrimary + ' px-3 py-1.5 text-center text-sm'}
        >
          Avisar a {appointment.client} por WhatsApp
        </a>
      ) : (
        // Sin teléfono no hay a quién escribirle, y callarlo sería peor: la dueña
        // tiene que saber que esta clienta se queda sin enterarse.
        <p className="text-sm text-neutral-600">
          No dejó un teléfono al que escribirle, así que no se va a enterar por aquí.
        </p>
      )}

      {/* El calendario es para la agenda de la dueña, y solo tiene sentido si la cita existe. */}
      {accepted && <CalendarActions appointment={appointment} />}
    </div>
  );
}
