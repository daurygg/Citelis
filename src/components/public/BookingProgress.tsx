// Progreso de tres tramos, sin números: la etiqueta accesible dice en qué paso va.
// El tramo del paso actual se llena de izquierda a derecha (index.css: `progress-fill-in`).
export function BookingProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div role="img" aria-label={`Paso ${current} de 3`} className="flex gap-1.5">
      {[1, 2, 3].map((n) => (
        <span key={n} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          {n <= current && (
            <span
              className={'absolute inset-0 origin-left rounded-full bg-brand-700' + (n === current ? ' progress-fill-in' : '')}
            />
          )}
        </span>
      ))}
    </div>
  );
}
