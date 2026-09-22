// Selector del color del negocio, compartido por el onboarding y la pantalla de
// configuración. Es un componente HOJA a propósito: solo importa `theme.ts` y las
// clases de `ui.ts`, nunca el store. Si importara el store se formaría el ciclo
// StoreContext → Onboarding → (este componente) → StoreContext, porque el store
// renderiza el onboarding cuando el usuario todavía no tiene negocio.
//
// La vista previa aplica las variables a ESTE contenedor, no al documento: así la
// app no parpadea mientras la dueña arrastra el selector, y como las variables CSS
// heredan, todo lo de dentro se previsualiza solo.
import { DEFAULT_BRAND_COLOR, themeCssVars } from '../lib/domain/theme';
import { field, fieldLabel, input } from './ui';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function BrandColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  // El <input type="color"> exige un hex válido de 6 dígitos; si ella está a mitad
  // de teclear el código a mano, la muestra se queda en el último color válido en
  // vez de romperse. No bloquea nada: el valor escrito se conserva tal cual.
  const swatchValue = HEX_RE.test(value) ? value : DEFAULT_BRAND_COLOR;

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className={fieldLabel}>Elige un color</span>
          <input
            type="color"
            className="h-11 w-16 cursor-pointer rounded-lg border border-neutral-300"
            value={swatchValue}
            onChange={(e) => onChange(e.target.value)}
            aria-label="El color de tu negocio"
          />
        </label>
        <label className={field + ' min-w-[10rem] flex-1'}>
          <span className={fieldLabel}>O escribe el código, si ya lo tienes (el de tu logo, por ejemplo)</span>
          <input
            className={input}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={DEFAULT_BRAND_COLOR}
          />
        </label>
      </div>

      {/* Ver el resultado explica mejor que cualquier texto por qué un color muy
          claro o muy oscuro no sale literal en el botón (decisión T2). */}
      <div style={themeCssVars(value)} className="rounded-xl bg-brand-50 p-4">
        <p className="text-sm font-semibold text-brand-700">Así se va a ver</p>
        <button type="button" className="mt-2 rounded-xl bg-brand-600 px-4 py-2.5 font-medium text-brand-fg">
          Botón de ejemplo
        </button>
      </div>
    </>
  );
}
