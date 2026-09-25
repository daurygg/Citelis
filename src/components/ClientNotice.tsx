// El aviso a la clienta por WhatsApp, colgado de la CITA.
//
// POR QUÉ EXISTE ASÍ
//   La primera versión vivía solo dentro del panel que aparecía al responder en
//   la bandeja. Ese panel es estado de React: al recargar la página moría, y la
//   cita ya no estaba en la bandeja porque había pasado a PENDING. Resultado:
//   la dueña aceptaba, recargaba, y la clienta se quedaba sin enterarse, sin
//   forma de reintentarlo. Ahora el aviso cuelga de la cita, así que se puede
//   mandar cuando sea: mañana, o desde otro teléfono.
//
// Solo formatea. No toca el estado de la cita ni el dinero (INVARIANTE 5).
import { bookingNoticeMessage, noticeOutcomeFor, whatsappUrl, type BookingOutcome } from '../lib/domain/whatsapp';
import { formatDateShort, formatTime } from '../lib/format';
import type { Appointment } from '../lib/domain/types';
import { useStore } from '../lib/store/StoreContext';
import { btnPrimary } from './ui';

export function ClientNotice({
  appointment,
  outcome,
}: {
  appointment: Appointment;
  /**
   * Fuerza el tipo de aviso en vez de deducirlo del estado. Lo necesita la
   * bandeja: allí se guarda la solicitud TAL COMO ESTABA antes de responder, así
   * que su estado sigue siendo REQUESTED y deducirlo daría "no hay nada que
   * avisar" justo en el momento en que más falta hace.
   */
  outcome?: BookingOutcome;
}) {
  const store = useStore();
  const effectiveOutcome = outcome ?? noticeOutcomeFor(appointment.status);
  if (effectiveOutcome === null) return null;

  const service = store.services.find((s) => s.id === appointment.service_id);
  const url = whatsappUrl(
    appointment.client_phone,
    bookingNoticeMessage({
      outcome: effectiveOutcome,
      clientName: appointment.client,
      businessName: store.business?.name ?? 'tu salón',
      serviceName: service?.name ?? 'tu cita',
      dateLabel: formatDateShort(appointment.datetime),
      timeLabel: formatTime(appointment.datetime),
    }),
  );

  if (url === null) {
    // Sin teléfono no hay a quién escribirle, y callarlo sería peor: la dueña
    // tiene que saber que esta clienta se queda sin enterarse.
    return (
      <p className="text-sm text-neutral-600">
        {appointment.client} no dejó un teléfono al que escribirle.
      </p>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={btnPrimary + ' px-3 py-1.5 text-center text-sm'}
    >
      Avisar a {appointment.client} por WhatsApp
    </a>
  );
}
