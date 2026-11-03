import { focusRing } from './portalStyles';

/** "Atrás" discreto (no compite con el botón principal) que vuelve por el historial. */
export function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        '-ml-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl py-2 pr-3 pl-1.5 font-medium text-portal-ink transition hover:bg-white disabled:opacity-40 ' +
        focusRing
      }
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m10 3.5-4.5 4.5 4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Atrás
    </button>
  );
}
