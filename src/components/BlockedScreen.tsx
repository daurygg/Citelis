// Pantalla que reemplaza la app cuando el plan venció y se acabó el plazo (S5).
// Presentacional: las instrucciones de pago llegan por props (ver paymentInstructions.ts).
import { btnGhost, card } from './ui';

interface Props {
  instructions: string;
  onSignOut: () => void;
}

export function BlockedScreen({ instructions, onSignOut }: Props) {
  return (
    <div className="grid min-h-dvh place-items-center bg-neutral-50 px-4 py-8 text-neutral-900">
      <div className={`${card} flex w-full max-w-md flex-col gap-4`}>
        <h1 className="text-xl font-bold text-brand-700">Tu plan está vencido</h1>
        <p>
          Para volver a usar Citelis, paga tu plan. Tus datos están guardados y no se pierde nada. Mientras tanto, tus clientas
          no pueden reservar por tu página.
        </p>
        <div className="rounded-xl bg-neutral-100 p-3 text-sm whitespace-pre-line">
          <h2 className="mb-1 font-semibold">Cómo pagar</h2>
          {instructions}
        </div>
        <p className="text-sm text-neutral-600">Cuando recibamos tu pago, tu cuenta se abre sola. Puede tardar un poco.</p>
        <button type="button" className={btnGhost} onClick={onSignOut}>
          Salir
        </button>
      </div>
    </div>
  );
}
