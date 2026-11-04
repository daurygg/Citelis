// Sistema de avisos breves (toasts) para confirmar acciones ("✓ Cita agendada").
// Cualquier componente llama useToast().notify('mensaje'). Se auto-ocultan: a los
// 2.5 s pasan a `closing`, se desvanecen y se quitan al terminar la animación.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  closing: boolean;
}
interface ToastApi {
  notify: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const VISIBLE_MS = 2500;
// Red de seguridad por si `animationend` no llega (pestaña oculta, tests sin CSS):
// algo más que la salida de 160 ms de index.css.
const EXIT_FALLBACK_MS = 400;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, kind, closing: false }]);
    setTimeout(() => {
      // Sin animación no llega `animationend`: se quita al instante.
      if (prefersReducedMotion()) {
        remove(id);
        return;
      }
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
      setTimeout(() => remove(id), EXIT_FALLBACK_MS);
    }, VISIBLE_MS);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'rounded-xl px-4 py-3 text-sm font-medium text-white ' +
              (t.kind === 'error' ? 'bg-red-700' : 'bg-ink') +
              (t.closing ? ' toast-out' : ' toast-in')
            }
            onAnimationEnd={() => {
              if (t.closing) remove(t.id);
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  }
  return ctx;
}
