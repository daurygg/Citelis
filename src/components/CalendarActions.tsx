// Entrega del calendario (Slice E del self-booking, decisión D3). La dueña baja el
// archivo o copia el link y se lo manda a la clienta por su cuenta: no hay canal
// automático hacia ella todavía (eso es el Slice F).
//
// Solo formatea una cita que YA existe. No calcula dinero ni toca estados: el
// archivo es presentación pura sobre lo que el dominio ya decidió (INVARIANTE 5).
import { appointmentUID, buildICS, googleCalendarUrl, revisionSequence } from '../lib/domain/calendar';
import type { Appointment } from '../lib/domain/types';
import { useStore } from '../lib/store/StoreContext';
import { useToast } from './Toast';
import { btnGhost } from './ui';

/** Nombre de archivo seguro en cualquier sistema: sin acentos, espacios ni signos. */
function safeFileName(client: string, datetime: string): string {
  const slug = client
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `cita-${slug || 'clienta'}-${datetime.slice(0, 10)}.ics`;
}

export function CalendarActions({ appointment }: { appointment: Appointment }) {
  const store = useStore();
  const { notify } = useToast();
  const service = store.services.find((s) => s.id === appointment.service_id);
  const business = store.business;

  // Sin servicio o sin negocio no hay nada honesto que poner en el evento.
  if (!service || !business) return null;

  function handleDownload() {
    if (!service || !business) return;
    const ics = buildICS({
      appointment,
      service,
      business,
      uid: appointmentUID(appointment),
      sequence: revisionSequence(new Date()),
      now: new Date(),
    });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFileName(appointment.client, appointment.datetime);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopyLink() {
    if (!service || !business) return;
    const url = googleCalendarUrl({ appointment, service, business });
    try {
      await navigator.clipboard.writeText(url);
      notify('✓ Link copiado, ya puedes pegarlo en WhatsApp');
    } catch {
      // Sin permiso de portapapeles (o navegador sin https): abrirlo es el plan B.
      window.open(url, '_blank', 'noopener');
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
      <p className="text-sm text-neutral-600">
        Mándale la cita a {appointment.client} para que le quede guardada en su teléfono.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnGhost + ' px-3 py-1.5 text-sm'} onClick={handleDownload}>
          Descargar la cita
        </button>
        <button type="button" className={btnGhost + ' px-3 py-1.5 text-sm'} onClick={handleCopyLink}>
          Copiar link de Google Calendar
        </button>
      </div>
    </div>
  );
}
