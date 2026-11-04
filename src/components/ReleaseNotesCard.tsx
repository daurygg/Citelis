// Modal de novedades: sale una sola vez por release, con una animación corta al
// abrir y al cerrar. La decisión de mostrarlo vive en `pendingReleaseNote`.
// Se monta en un portal bajo <body>, como ReceiptDialog, para quedar sobre todo.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RELEASE_NOTES, markReleaseNotesSeen, pendingReleaseNote, readSeenReleaseNote } from '../lib/releaseNotes';
import { btnPrimary } from './ui';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ReleaseNotesCard() {
  // Se decide una vez al montar: cerrarlo no debe depender de volver a leer.
  const [note, setNote] = useState(() => pendingReleaseNote(readSeenReleaseNote(), RELEASE_NOTES, new Date()));
  const [closing, setClosing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  function dismiss() {
    if (closing) return;
    markReleaseNotesSeen();
    // Sin animación no llega `animationend`: se cierra al instante.
    if (prefersReducedMotion()) setNote(null);
    else setClosing(true);
  }

  useEffect(() => {
    if (!note) return;
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `dismiss` se rehace en cada render; basta con registrar al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  if (!note) return null;

  return createPortal(
    <div
      className={
        'fixed inset-0 z-50 flex items-end justify-center bg-ink/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:pb-0 ' +
        (closing ? 'modal-backdrop-out' : 'modal-backdrop-in')
      }
      onClick={(e) => {
        // Tocar fuera de la tarjeta también la cierra.
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-notes-title"
        className={'w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-line ' + (closing ? 'modal-panel-out' : 'modal-panel-in')}
        onAnimationEnd={() => {
          if (closing) setNote(null);
        }}
      >
        <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">Nuevo</span>
        <h2 id="release-notes-title" className="mt-3 text-xl font-semibold tracking-tight">
          {note.title}
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-muted">
          {note.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <button ref={button} type="button" className={btnPrimary + ' mt-6 w-full'} onClick={dismiss}>
          Entendido
        </button>
      </div>
    </div>,
    document.body,
  );
}
