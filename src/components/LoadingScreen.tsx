// Pantalla de carga con marca: reemplaza los "Cargando…" en texto plano.
// Componente hoja y presentacional; el spinner se detiene con motion-reduce.
export function LoadingScreen({ message }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-dvh place-items-center bg-neutral-50 px-6 text-center"
    >
      <div className="flex flex-col items-center gap-4">
        <span className="text-2xl font-bold tracking-tight text-brand-700">Citelis</span>
        <span
          aria-hidden="true"
          className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600 motion-reduce:animate-none"
        />
        <p className="text-sm text-neutral-500">{message ?? 'Cargando…'}</p>
      </div>
    </div>
  );
}
