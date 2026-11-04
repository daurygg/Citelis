import { describe, it, expect } from 'vitest';
import { RELEASE_NOTES, pendingReleaseNote, type ReleaseNote } from './releaseNotes';

const notes: ReleaseNote[] = [
  { id: '2026-12-01', title: 'Lo nuevo de diciembre', items: ['Algo nuevo'] },
  { id: '2026-11-04', title: 'Lo nuevo de noviembre', items: ['Algo viejo'] },
];

// Fechas locales, como las compara la app.
const releaseDay = new Date('2026-12-01T09:00:00');

describe('pendingReleaseNote', () => {
  it('muestra la novedad más reciente a quien no la ha visto', () => {
    expect(pendingReleaseNote({ ok: true, seen: '2026-11-04' }, notes, releaseDay)).toBe(notes[0]);
  });

  it('muestra la más reciente a quien nunca vio ninguna (usuaria de antes de los avisos)', () => {
    expect(pendingReleaseNote({ ok: true, seen: null }, notes, releaseDay)).toBe(notes[0]);
  });

  it('no muestra nada si ya vio la más reciente', () => {
    expect(pendingReleaseNote({ ok: true, seen: '2026-12-01' }, notes, releaseDay)).toBeNull();
  });

  it('no muestra nada si no se puede leer lo visto: saldría en cada entrada', () => {
    expect(pendingReleaseNote({ ok: false }, notes, releaseDay)).toBeNull();
  });

  it('no muestra nada si no hay novedades', () => {
    expect(pendingReleaseNote({ ok: true, seen: null }, [], releaseDay)).toBeNull();
  });

  it('sigue mostrándola el último día de sus 30 días', () => {
    expect(pendingReleaseNote({ ok: true, seen: null }, notes, new Date('2026-12-30T23:59:00'))).toBe(notes[0]);
  });

  it('caduca a los 30 días: tras borrar el navegador no sale un aviso que ya no es nuevo', () => {
    expect(pendingReleaseNote({ ok: true, seen: null }, notes, new Date('2026-12-31T00:00:00'))).toBeNull();
    expect(pendingReleaseNote({ ok: true, seen: '2026-11-04' }, notes, new Date('2027-02-15T10:00:00'))).toBeNull();
  });
});

describe('RELEASE_NOTES', () => {
  it('va de la más reciente a la más vieja, sin ids repetidos', () => {
    const ids = RELEASE_NOTES.map((n) => n.id);
    expect(ids).toEqual([...ids].sort().reverse());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada aviso es corto: de 1 a 4 puntos', () => {
    for (const note of RELEASE_NOTES) {
      expect(note.items.length).toBeGreaterThanOrEqual(1);
      expect(note.items.length).toBeLessThanOrEqual(4);
    }
  });
});
