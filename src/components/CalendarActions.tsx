// Entrega del calendario (Slice E del self-booking, decisión D3). Es la agenda de
// la DUEÑA: guarda la cita en su propio calendario para que le avise. No se manda
// nada a la clienta desde aquí (eso no está en el alcance de este slice).
//
// Solo formatea una cita que YA existe. No calcula dinero ni toca estados: el
// archivo es presentación pura sobre lo que el dominio ya decidió (INVARIANTE 5).
import { appointmentUID, buildICS, googleCalendarUrl, revisionSequence } from '../lib/domain/calendar';
import { resolveAppointmentServices } from '../lib/domain/scheduling';
import type { Appointment } from '../lib/domain/types';
import { useStore } from '../lib/store/StoreContext';
import { btnGhostSm } from './ui';

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
  const { services, anyMissing } = resolveAppointmentServices(appointment, store.services);

  // Fallo seguro (igual que la disponibilidad): si CUALQUIER servicio salió del
  // catálogo, la duración sumada sería falsa y el evento taparía tiempo que no es
  // real. Preferimos no ofrecer el evento a ofrecer uno con la hora de fin equivocada.
  if (services.length === 0 || anyMissing) return null;

  function handleDownload() {
    const ics = buildICS({
      appointment,
      services,
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
    const url = googleCalendarUrl({ appointment, services });
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
      <p className="text-sm text-neutral-600">Agrégala a tu calendario para que te avise.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnGhostSm} onClick={handleDownload}>
          Descargar para mi calendario
        </button>
        <button type="button" className={btnGhostSm} onClick={handleOpenGoogleCalendar}>
          Abrir en Google Calendar
        </button>
      </div>
    </div>
  );
}
