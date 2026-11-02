// Progreso de tres tramos, sin números: la etiqueta accesible dice en qué paso va.
export function BookingProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div role="img" aria-label={`Paso ${current} de 3`} className="flex gap-1.5">
      {[1, 2, 3].map((n) => (
        <span key={n} className={'h-1.5 flex-1 rounded-full ' + (n <= current ? 'bg-brand-700' : 'bg-portal-line')} />
      ))}
    </div>
  );
}
