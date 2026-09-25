// Entrega del calendario (Slice E del self-booking, decisión D3). Es la agenda de
// la DUEÑA: guarda la cita en su propio calendario para que le avise. No se manda
// nada a la clienta desde aquí (eso no está en el alcance de este slice).
//
// Solo formatea una cita que YA existe. No calcula dinero ni toca estados: el
// archivo es presentación pura sobre lo que el dominio ya decidió (INVARIANTE 5).
import { appointmentUID, buildICS, googleCalendarUrl, revisionSequence } from '../lib/domain/calendar';
import type { Appointment } from '../lib/domain/types';
import { useStore } from '../lib/store/StoreContext';
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
  const service = store.services.find((s) => s.id === appointment.service_id);

  // Sin servicio no hay nada honesto que poner en el evento.
  if (!service) return null;

  function handleDownload() {
    if (!service) return;
    const ics = buildICS({
      appointment,
      service,
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

  function handleOpenGoogleCalendar() {
    if (!service) return;
    const url = googleCalendarUrl({ appointment, service });
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
      <p className="text-sm text-neutral-600">Agrégala a tu calendario para que te avise.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnGhost + ' px-3 py-1.5 text-sm'} onClick={handleDownload}>
          Descargar para mi calendario
        </button>
        <button type="button" className={btnGhost + ' px-3 py-1.5 text-sm'} onClick={handleOpenGoogleCalendar}>
          Abrir en Google Calendar
        </button>
      </div>
    </div>
  );
}
