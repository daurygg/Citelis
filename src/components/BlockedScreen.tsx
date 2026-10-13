// Pantalla que reemplaza la app cuando el plan venció y se acabó el plazo (S5).
// Presentacional: el enlace de WhatsApp llega por props (lo arma `whatsappPaymentLink`).
import { btnGhost, btnPrimary, card } from './ui';

interface Props {
  whatsappUrl: string;
  onSignOut: () => void;
}

export function BlockedScreen({ whatsappUrl, onSignOut }: Props) {
  return (
    <div className="grid min-h-dvh place-items-center bg-neutral-50 px-4 py-8 text-neutral-900">
      <div className={`${card} flex w-full max-w-md flex-col gap-4`}>
        <h1 className="text-xl font-bold text-brand-700">Tu plan venció</h1>
        <p>
          Para seguir usando Citelis, escríbenos por WhatsApp y te decimos cómo pagar. En cuanto confirmemos tu pago, tu
          cuenta se activa de nuevo.
        </p>
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} inline-flex items-center justify-center text-center`}>
          Escribir por WhatsApp
        </a>
        <button type="button" className={btnGhost} onClick={onSignOut}>
          Salir
        </button>
      </div>
    </div>
  );
}
