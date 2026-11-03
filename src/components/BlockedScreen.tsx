// Pantalla que reemplaza la app cuando el plan venció y se acabó el plazo (S5).
// Presentacional: el enlace de WhatsApp llega por props (lo arma `whatsappPaymentLink`).
import { btnGhost, btnPrimary, screenTitle, surface } from './ui';

interface Props {
  whatsappUrl: string;
  onSignOut: () => void;
}

export function BlockedScreen({ whatsappUrl, onSignOut }: Props) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4 py-8 text-ink">
      <div className={`${surface} flex w-full max-w-md flex-col gap-4 p-6`}>
        <h1 className={screenTitle}>Tu plan venció</h1>
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
