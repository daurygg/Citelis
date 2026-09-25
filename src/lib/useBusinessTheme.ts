// Aplica el color de marca del negocio como variables CSS en <html> (Slice G3,
// odd/tasks/business-theming.md). `themeCssVars` (dominio puro, INVARIANTE 5)
// hace toda la matemática de color; este hook solo la conecta al DOM y limpia
// al desmontar, para que salir de una pantalla no deje pegado el color de
// otro negocio (mismo criterio que `useDocumentTitle`).
import { useEffect } from 'react';
import { themeCssVars } from './domain/theme';

export function useBusinessTheme(themeColor: string | null | undefined): void {
  useEffect(() => {
    const root = document.documentElement;
    const vars = themeCssVars(themeColor);
    for (const [property, value] of Object.entries(vars)) {
      root.style.setProperty(property, value);
    }
    return () => {
      for (const property of Object.keys(vars)) {
        root.style.removeProperty(property);
      }
    };
  }, [themeColor]);
}
