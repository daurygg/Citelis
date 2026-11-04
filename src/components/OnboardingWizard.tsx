// Pasos 2-4 del asistente guiado (horarios, primer servicio y pantalla final).
// Se pinta desde StoreContext con el store YA cargado, en lugar de la app, hasta
// que la dueña termina. El paso 1 (crear el negocio) vive en Onboarding.tsx.
// Recibe el store por prop (solo el tipo se importa) para no cerrar un ciclo de
// imports con StoreContext. Toda la lógica está en el dominio puro (INVARIANTE 5).
import { useState } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import type { Store } from '../lib/store/StoreContext';
import { nextStep, isSkippable, type OnboardingStep } from '../lib/domain/onboarding';
import {
  HOURS_PRESETS,
  buildHoursFromPreset,
  buildSetupSummary,
  validateFirstService,
  validateHoursRange,
  type HoursPresetId,
} from '../lib/domain/onboardingSetup';
import { useBusinessTheme } from '../lib/useBusinessTheme';
import { WizardProgress } from './WizardProgress';
import { btnPrimary, btnGhost, card, chip, field, fieldLabel, input } from './ui';

export function OnboardingWizard({ store, onFinish }: { store: Store; onFinish: () => void }) {
  const { signOut } = useAuth();
  useBusinessTheme(store.business?.theme_color);

  // El negocio ya existe: el asistente arranca en horarios y no se vuelve al paso 1.
  const [step, setStep] = useState<OnboardingStep>('hours');
  const [hoursDays, setHoursDays] = useState(0);
  const [serviceName, setServiceName] = useState<string | null>(null);

  const advance = () => setStep((current) => nextStep(current));

  return (
    <div className="min-h-dvh bg-neutral-50 px-4 py-8 sm:py-16 text-neutral-900">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-center text-2xl font-bold text-brand-700">Citelis</h1>
        {step !== 'done' && <WizardProgress step={step} />}

        {step === 'hours' && (
          <HoursStep
            onSave={(days) => {
              setHoursDays(days);
              advance();
            }}
            save={(rows) => rows.forEach((row) => store.setBusinessHours(row))}
            onSkip={advance}
          />
        )}
        {step === 'service' && (
          <ServiceStep
            save={(value) => store.createService(value)}
            onSave={(name) => {
              setServiceName(name);
              advance();
            }}
            onSkip={advance}
          />
        )}
        {step === 'done' && (
          <DoneStep
            summary={buildSetupSummary({ businessName: store.business?.name ?? 'Tu negocio', hoursDays, serviceName })}
            publicSlug={store.bookingPolicy?.public_slug ?? null}
            onFinish={onFinish}
          />
        )}

        <button type="button" className="mt-4 min-h-11 w-full text-center text-sm text-neutral-500 hover:underline" onClick={() => signOut()}>
          Salir
        </button>
      </div>
    </div>
  );
}

type HoursRows = ReturnType<typeof buildHoursFromPreset>;

function HoursStep({ save, onSave, onSkip }: { save: (rows: HoursRows) => void; onSave: (days: number) => void; onSkip: () => void }) {
  const [preset, setPreset] = useState<HoursPresetId>('weekdays');
  const [opensAt, setOpensAt] = useState('09:00');
  const [closesAt, setClosesAt] = useState('18:00');
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const problem = validateHoursRange(opensAt, closesAt);
    if (problem) {
      setError(problem);
      return;
    }
    const rows = buildHoursFromPreset(preset, opensAt, closesAt);
    save(rows);
    onSave(rows.length);
  }

  return (
    <div className={card + ' flex flex-col gap-3'}>
      <div>
        <h2 className="text-lg font-semibold">¿Cuándo atiendes?</h2>
        <p className="text-sm text-neutral-500">Así tus clientas saben cuándo pueden reservar. Después puedes ajustarlo día por día.</p>
      </div>
      <div role="radiogroup" aria-label="Días de trabajo" className="flex flex-wrap gap-2">
        {HOURS_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={preset === p.id}
            onClick={() => setPreset(p.id)}
            className={chip + ' ' + (preset === p.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-neutral-300 text-neutral-700')}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className={field}>
          <span className={fieldLabel}>Abres a las</span>
          <input className={input} type="time" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </label>
        <label className={field}>
          <span className={fieldLabel}>Cierras a las</span>
          <input className={input} type="time" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="button" className={btnPrimary} onClick={handleSave}>
        Guardar y seguir
      </button>
      {isSkippable('hours') && (
        <button type="button" className={btnGhost} onClick={onSkip}>
          Lo hago después
        </button>
      )}
    </div>
  );
}

function ServiceStep({
  save,
  onSave,
  onSkip,
}: {
  save: (value: { name: string; price: number; duration_min: number }) => number;
  onSave: (name: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState('');
  const [priceText, setPriceText] = useState('');
  const [durationText, setDurationText] = useState('60');
  const [submitted, setSubmitted] = useState(false);

  const { errors, value } = validateFirstService({ name, priceText, durationText });
  const show = (message?: string) => (submitted && message ? message : null);

  function handleSave() {
    setSubmitted(true);
    if (value === null) return;
    save(value);
    onSave(value.name);
  }

  return (
    <div className={card + ' flex flex-col gap-3'}>
      <div>
        <h2 className="text-lg font-semibold">Tu primer servicio</h2>
        <p className="text-sm text-neutral-500">Con uno basta para empezar a agendar. Los costos los afinas después.</p>
      </div>
      <label className={field}>
        <span className={fieldLabel}>¿Cómo se llama?</span>
        <input className={input} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Manicure" />
        {show(errors.name) && <span className="text-sm text-red-600">{errors.name}</span>}
      </label>
      <label className={field}>
        <span className={fieldLabel}>¿Cuánto cobras?</span>
        <input className={input} type="text" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="Ej: 350" />
        {show(errors.price) && <span className="text-sm text-red-600">{errors.price}</span>}
      </label>
      <label className={field}>
        <span className={fieldLabel}>¿Cuánto dura? (minutos)</span>
        <input className={input} type="number" min={1} inputMode="numeric" value={durationText} onChange={(e) => setDurationText(e.target.value)} />
        {show(errors.duration) && <span className="text-sm text-red-600">{errors.duration}</span>}
      </label>
      <button type="button" className={btnPrimary} onClick={handleSave}>
        Guardar y seguir
      </button>
      {isSkippable('service') && (
        <button type="button" className={btnGhost} onClick={onSkip}>
          Lo hago después
        </button>
      )}
    </div>
  );
}

function DoneStep({
  summary,
  publicSlug,
  onFinish,
}: {
  summary: ReturnType<typeof buildSetupSummary>;
  publicSlug: string | null;
  onFinish: () => void;
}) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');

  function handleCopy() {
    if (!publicSlug) return;
    const url = `${window.location.origin}/reservar/${publicSlug}`;
    navigator.clipboard?.writeText(url).then(
      () => setCopied('ok'),
      () => setCopied('fail'),
    );
  }

  return (
    <div className={card + ' flex flex-col gap-3'}>
      <div className="text-center">
        <h2 className="text-xl font-semibold">¡Todo listo!</h2>
        <p className="text-sm text-neutral-500">Tu negocio ya está en marcha.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {summary.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm">
            <span aria-hidden="true" className={item.done ? 'text-green-700' : 'text-neutral-400'}>
              {item.done ? '✓' : '○'}
            </span>
            <span className={item.done ? 'text-neutral-800' : 'text-neutral-500'}>{item.label}</span>
          </li>
        ))}
      </ul>
      <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
        Tienes 14 días de prueba gratis para probar Citelis con calma.
      </p>
      <button type="button" className={btnPrimary} onClick={onFinish}>
        Ir a mi agenda
      </button>
      {publicSlug && (
        <>
          <button type="button" className={btnGhost} onClick={handleCopy}>
            {copied === 'ok' ? 'Enlace copiado' : 'Compartir mi enlace de reservas'}
          </button>
          {copied === 'fail' && <p className="text-sm text-red-600">No se pudo copiar el enlace. Lo encuentras en Mi negocio.</p>}
          <p className="text-xs text-neutral-500">Para que te reserven por ahí, abre las reservas en línea desde Mi negocio.</p>
        </>
      )}
    </div>
  );
}
