// Pantalla para que la dueña cambie el color de su negocio después de creado
// (decisión T5, odd/tasks/business-theming.md: el color se puede cambiar,
// no solo elegir al crear el negocio). Cero cálculos de color aquí
// (INVARIANTE 5): toda la matemática vive en `src/lib/domain/theme.ts`.
//
// Mientras ella prueba colores, la vista previa se pinta sola con
// `themeCssVars` como estilo inline en su propio contenedor — NUNCA en
// <html> — así que arrastrar el selector no hace parpadear el resto de la
// pantalla, y las variables CSS heredan solas hacia dentro del recuadro. El
// color solo se aplica a toda la app (vía `useBusinessTheme` en App.tsx)
// cuando ella guarda.
import { useState } from 'react';
import { useStore } from '../../lib/store/StoreContext';
import { useToast } from '../Toast';
import { DEFAULT_BRAND_COLOR } from '../../lib/domain/theme';
import { BrandColorPicker } from '../BrandColorPicker';
import { btnPrimary, card } from '../ui';


export function BrandSettings() {
  const store = useStore();
  const { notify } = useToast();
  const savedColor = store.business?.theme_color ?? DEFAULT_BRAND_COLOR;
  const [color, setColor] = useState(savedColor);

  const dirty = color !== savedColor;

  function handleSave() {
    store.updateBusinessTheme(color);
    notify('✓ Color guardado');
  }

  return (
    <div className={card + ' flex flex-col gap-3'}>
      <div>
        <h2 className="text-lg font-semibold">El color de tu negocio</h2>
        <p className="text-sm text-neutral-500">
          Se usa en los botones, en el título y en la página donde tus clientas reservan.
        </p>
      </div>

      <BrandColorPicker value={color} onChange={setColor} />

      <button type="button" className={btnPrimary} disabled={!dirty} onClick={handleSave}>
        Guardar color
      </button>
    </div>
  );
}
