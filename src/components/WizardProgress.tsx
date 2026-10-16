// Indicador "Paso N de 3" con barra de progreso del asistente guiado. Componente
// hoja y presentacional: la posición sale de `stepProgress` (dominio puro).
import { stepProgress, type OnboardingStep } from '../lib/domain/onboarding';

export function WizardProgress({ step }: { step: OnboardingStep }) {
  const { current, total } = stepProgress(step);
  return (
    <div className="mb-4" aria-current="step">
      <p className="mb-1.5 text-sm font-medium text-neutral-600">
        Paso {current} de {total}
      </p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={`Paso ${current} de ${total}`}
        className="h-2 overflow-hidden rounded-full bg-neutral-200"
      >
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  );
}
