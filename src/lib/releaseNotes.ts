// Aviso de novedades: la primera vez que la dueña entra tras un release, una
// tarjeta discreta le cuenta lo nuevo. Al cerrarla no vuelve a salir.
//
// CÓMO SE AGREGA UNA NOVEDAD
//   En el mismo PR del release, una entrada nueva AL PRINCIPIO de `RELEASE_NOTES`
//   con un `id` mayor que el anterior (la fecha del release). De 1 a 4 puntos, en
//   el idioma de la dueña (INVARIANTE 4). Quien no vio varias, ve solo la última,
//   y solo durante `RELEASE_NOTE_DAYS` días desde el release: después caduca.
//
// DÓNDE VIVE "YA LO VI"
//   En el almacenamiento local de este navegador. Es por dispositivo: en el
//   celular y en la computadora se ve una vez en cada uno. Quien acaba de crear
//   su negocio la da por vista (ver `markReleaseNotesSeen` en el asistente): a
//   quien recién llega no le sirve un "qué hay de nuevo".
//
// Si no se puede leer el almacenamiento (modo privado, bloqueado), NO se muestra:
// sin memoria saldría en cada entrada, y eso sí molesta.

export interface ReleaseNote {
  /** Fecha del release, `AAAA-MM-DD`. Ordena y sirve de marca de "ya lo vi". */
  id: string;
  title: string;
  items: string[];
}

/** De la más reciente a la más vieja. */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    id: '2026-11-04',
    title: 'Novedades en tu agenda',
    items: [
      'Tus clientes quedan guardados: al agendar, busca por nombre o agrega uno nuevo con su teléfono.',
      'Puedes registrar un abono o el pago completo antes de atender, con el botón "Abonar" de la cita.',
      'En Reporte, "¿Quién te compró?" te dice cuánto te compró cada cliente.',
    ],
  },
];

const STORAGE_KEY = 'citelis.novedades';

/** Lo leído del almacenamiento: `ok: false` si no se pudo leer. */
export type SeenRead = { ok: true; seen: string | null } | { ok: false };

/**
 * Días que una novedad sigue siendo "nueva", contando el día del release. Pasado
 * ese plazo no se muestra aunque no conste como vista: quien borra los datos del
 * navegador, cambia de dispositivo o pierde el almacenamiento (Safari lo borra
 * tras 7 días sin entrar) no vuelve a ver un aviso viejo.
 */
export const RELEASE_NOTE_DAYS = 30;

/** Primer instante (hora local) en que la novedad ya no se muestra. */
function expiresAt(note: ReleaseNote): Date {
  const end = new Date(`${note.id}T00:00:00`);
  end.setDate(end.getDate() + RELEASE_NOTE_DAYS);
  return end;
}

/** La novedad que toca mostrar `now`, o null. Pura. */
export function pendingReleaseNote(read: SeenRead, notes: readonly ReleaseNote[], now: Date): ReleaseNote | null {
  if (!read.ok) return null;
  const latest = notes[0];
  if (!latest || read.seen === latest.id) return null;
  if (now >= expiresAt(latest)) return null;
  return latest;
}

export function readSeenReleaseNote(): SeenRead {
  try {
    return { ok: true, seen: window.localStorage.getItem(STORAGE_KEY) };
  } catch {
    return { ok: false };
  }
}

/** Marca como vista la novedad más reciente. Si no se puede guardar, no pasa nada. */
export function markReleaseNotesSeen(): void {
  const latest = RELEASE_NOTES[0];
  if (!latest) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, latest.id);
  } catch {
    // Modo privado, almacenamiento bloqueado o lleno. Silencio a propósito.
  }
}
