// Hook mínimo: mientras haya un título disponible, lo fija en `document.title`;
// al desmontar (o cuando deja de haber uno) restaura el que había antes, para
// que salir de la pantalla nunca deje pegado el nombre de otro negocio.
import { useEffect } from 'react';

export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
