// Pantalla para que la dueña cambie la dirección pública de su negocio sin
// que las clientas que ya guardaron el enlace viejo se queden afuera (T3,
// odd/tasks/editable-public-slug.md). En la UI esto es "la dirección de tu
// página", nunca "slug" (INVARIANTE 4): es lo que reparte por WhatsApp.
//
// El formato se valida dos veces, y a propósito: `isValidSlug` da una
// respuesta inmediata mientras escribe, pero la palabra final es del
// servidor (`set_public_slug`, vía `store.updatePublicSlug`) — solo él sabe
// si esa dirección ya la usa otro negocio, ahora o en el pasado. Por eso el
// error que se muestra tras guardar es siempre `error.message` tal cual la
// base lo manda, no uno inventado aquí.
import { useState } from 'react';
import { useStore } from '../../lib/store/StoreContext';
import { useToast } from '../Toast';
import { isValidSlug, slugifyBusinessName } from '../../lib/domain/slug';
import { btnPrimary, card, field, fieldLabel, input } from '../ui';

export function PublicLinkSettings() {
  const store = useStore();
  const { notify } = useToast();
  const policy = store.bookingPolicy;
  const savedSlug = policy?.public_slug ?? '';

  const [value, setValue] = useState(savedSlug);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const trimmed = value.trim();
  const dirty = trimmed !== savedSlug;
  const formatValid = trimmed !== '' && isValidSlug(trimmed);
  const showFormatHint = trimmed !== '' && !formatValid;

  // Sugerencia armada a partir del nombre del negocio: es lo que le permite a
  // alguien que quedó con `negocio-1001` arreglarlo con un solo toque, sin
  // tener que entender de dónde salió ese número.
  const suggestedSlug = store.business ? slugifyBusinessName(store.business.name) : null;
  const showSuggestion =
    suggestedSlug !== null && suggestedSlug !== savedSlug && suggestedSlug !== trimmed;

  function applySuggestion() {
    if (!suggestedSlug) return;
    setValue(suggestedSlug);
    setServerError(null);
  }

  async function handleSave() {
    if (!dirty || !formatValid || saving) return;
    setSaving(true);
    setServerError(null);
    const result = await store.updatePublicSlug(trimmed);
    setSaving(false);
    if (!result.ok) {
      setServerError(result.message);
      return;
    }
    setValue(result.slug);
    notify('✓ Dirección actualizada');
  }

  if (!policy) {
    return (
      <div className={card + ' flex flex-col gap-2'}>
        <h2 className="text-lg font-semibold">La dirección de tu página</h2>
        <p className="text-sm text-neutral-500">
          Todavía no tienes una. Se crea sola en cuanto abras las reservas en línea, en "Reservas".
        </p>
      </div>
    );
  }

  return (
    <div className={card + ' flex flex-col gap-3'}>
      <div>
        <h2 className="text-lg font-semibold">La dirección de tu página</h2>
        <p className="text-sm text-neutral-500">
          Es el enlace que le mandas a tus clientas para que reserven. Ahora es:
        </p>
        <p className="mt-1 break-all font-mono text-sm text-brand-700">
          {window.location.origin}/reservar/{savedSlug}
        </p>
      </div>

      <label className={field}>
        <span className={fieldLabel}>Cambiar la última parte</span>
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-sm text-neutral-400">/reservar/</span>
          <input
            className={input}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setServerError(null);
            }}
          />
        </div>
      </label>

      {showFormatHint && (
        <p className="text-sm text-red-600">
          Solo letras sin acentos, números y guiones, sin espacios ni mayúsculas.
        </p>
      )}
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      {showSuggestion && (
        <button type="button" className="self-start text-sm text-brand-700 hover:underline" onClick={applySuggestion}>
          Usar "{suggestedSlug}" (viene del nombre de tu negocio)
        </button>
      )}

      <p className="text-xs text-neutral-400">
        La dirección anterior va a seguir funcionando: nadie que la haya guardado se queda sin poder
        entrar.
      </p>

      <button type="button" className={btnPrimary} disabled={!dirty || !formatValid || saving} onClick={handleSave}>
        {saving ? 'Guardando…' : 'Guardar dirección'}
      </button>
    </div>
  );
}
