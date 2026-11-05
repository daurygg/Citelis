// "Cuéntanos de ti": nombre, WhatsApp y tipo de negocio de quien administra
// (odd/tasks/owner-profile.md). Lo usan el registro (paso 1) y la pantalla única
// para negocios que ya existían. Presentacional: la validación sale de
// `validateOwnerProfile` (dominio puro) y quien lo monta decide qué hacer al enviar.
//
// Componente hoja: Onboarding.tsx lo importa y no puede tocar el store (ciclo).
import { useState } from 'react';
import type { BusinessType } from '../lib/domain/types';
import { BUSINESS_TYPES, validateOwnerProfile, type OwnerProfile, type OwnerProfileInput } from '../lib/domain/ownerProfile';
import { btnPrimary, chip, field, fieldLabel, input } from './ui';

export function OwnerProfileForm({
  initial,
  submitLabel,
  busyLabel,
  busy = false,
  error = null,
  onSubmit,
}: {
  initial?: Partial<OwnerProfileInput>;
  submitLabel: string;
  busyLabel?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (profile: OwnerProfile) => void;
}) {
  const [name, setName] = useState(initial?.owner_name ?? '');
  const [whatsapp, setWhatsapp] = useState(initial?.owner_whatsapp ?? '');
  const [type, setType] = useState<BusinessType | null>(initial?.business_type ?? null);
  // Los errores aparecen al salir de cada campo o al intentar seguir, no mientras se escribe.
  const [touched, setTouched] = useState<Partial<Record<keyof OwnerProfileInput, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const check = validateOwnerProfile({ owner_name: name, owner_whatsapp: whatsapp, business_type: type });
  const errors = check.ok ? {} : check.errors;
  const show = (key: keyof OwnerProfileInput) => (submitted || touched[key] ? errors[key] : undefined);
  const touch = (key: keyof OwnerProfileInput) => setTouched((t) => ({ ...t, [key]: true }));

  function submit() {
    setSubmitted(true);
    if (check.ok && !busy) onSubmit(check.value);
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className={field}>
        <span className={fieldLabel}>Tu nombre</span>
        <input
          className={input}
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => touch('owner_name')}
          placeholder="Nombre y apellido"
          aria-invalid={show('owner_name') !== undefined}
          aria-describedby={show('owner_name') ? 'owner-name-error' : undefined}
        />
        {show('owner_name') && (
          <span id="owner-name-error" className="text-sm text-red-600">
            {show('owner_name')}
          </span>
        )}
      </label>

      <label className={field}>
        <span className={fieldLabel}>Tu WhatsApp</span>
        <input
          className={input}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          onBlur={() => touch('owner_whatsapp')}
          placeholder="Ej: 809 555 1234"
          aria-invalid={show('owner_whatsapp') !== undefined}
          aria-describedby={show('owner_whatsapp') ? 'owner-whatsapp-error' : 'owner-whatsapp-hint'}
        />
        {show('owner_whatsapp') ? (
          <span id="owner-whatsapp-error" className="text-sm text-red-600">
            {show('owner_whatsapp')}
          </span>
        ) : (
          <span id="owner-whatsapp-hint" className="text-xs text-neutral-500">
            Solo para ayudarte con tu cuenta. Tu equipo no lo ve.
          </span>
        )}
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className={fieldLabel + ' mb-2 text-sm'}>¿Qué tipo de negocio tienes?</legend>
        <div role="radiogroup" aria-label="Tipo de negocio" className="flex flex-wrap gap-2">
          {BUSINESS_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              onClick={() => setType(t.value)}
              className={
                chip + ' ' + (type === t.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-neutral-300 text-neutral-700')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        {show('business_type') && <span className="text-sm text-red-600">{show('business_type')}</span>}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="submit" className={btnPrimary} disabled={busy}>
        {busy ? (busyLabel ?? submitLabel) : submitLabel}
      </button>
    </form>
  );
}
