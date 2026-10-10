// Vista del recibo de una cita cobrada: al abrirla emite el recibo (idempotente, así
// reabrirla no gasta otro número) y muestra el papel con "Imprimir" y "Cerrar".
// Se monta en un portal directo bajo <body> para que el CSS de impresión pueda
// ocultar el resto de la app sin tocar nada más (ver `.receipt-portal` en index.css).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../lib/store/StoreContext';
import type { ReceiptResult } from '../lib/domain/receipt';
import { ReceiptSheet } from './ReceiptSheet';
import { btnGhost, btnPrimary } from './ui';

export function ReceiptDialog({ appointmentId, onClose }: { appointmentId: number; onClose: () => void }) {
  const store = useStore();
  const [result, setResult] = useState<ReceiptResult | null>(null);

  useEffect(() => {
    let active = true;
    store.loadReceipt(appointmentId).then((r) => {
      if (active) setResult(r);
    });
    return () => {
      active = false;
    };
    // `store` se rehace en cada render; solo importa cuál cita se abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="receipt-portal fixed inset-0 z-50 overflow-y-auto bg-neutral-900/60 px-3 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Recibo"
    >
      {result === null && (
        // Con mala señal la carga puede tardar: siempre hay una salida (en el celular no hay Escape).
        <div className="receipt-actions mx-auto mt-20 flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-white">Preparando el recibo…</p>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cerrar
          </button>
        </div>
      )}
      {result && !result.ok && (
        <div className="receipt-actions mx-auto mt-20 flex max-w-sm flex-col gap-3 rounded-2xl bg-white p-4 text-center">
          <p className="text-neutral-700">{result.message}</p>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cerrar
          </button>
        </div>
      )}
      {result && result.ok && (
        <div className="mx-auto flex max-w-[22rem] flex-col gap-4">
          <ReceiptSheet data={result.data} />
          <div className="receipt-actions flex gap-2">
            <button type="button" className={btnPrimary + ' flex-1'} onClick={() => window.print()}>
              Imprimir
            </button>
            <button type="button" className={btnGhost + ' flex-1 bg-white'} onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
