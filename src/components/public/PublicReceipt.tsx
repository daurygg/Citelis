// Recibo digital público: /recibo/<token>. Sin sesión y sin StoreProvider; la clienta
// llega aquí desde el QR del papel. Muestra el MISMO `ReceiptSheet` que se imprime.
// Se monta en un portal bajo <body> (igual que ReceiptDialog) para que el CSS de impresión
// deje solo el recibo. Pensado para celular: una columna, botón grande de imprimir.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchPublicReceipt, type PublicReceiptLoad } from '../../lib/public/publicReceipt';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ReceiptSheet } from '../ReceiptSheet';
import { btnPrimary } from '../ui';

export function PublicReceipt({ token }: { token: string }) {
  const [load, setLoad] = useState<PublicReceiptLoad | null>(null);
  useDocumentTitle('Recibo digital');

  useEffect(() => {
    let active = true;
    fetchPublicReceipt(token)
      .then((r) => active && setLoad(r))
      .catch(() => active && setLoad({ status: 'error', message: 'No se pudo conectar con el servidor.' }));
    return () => {
      active = false;
    };
  }, [token]);

  const message =
    load === null
      ? 'Cargando tu recibo…'
      : load.status === 'not_found'
        ? 'No encontramos este recibo. Revisa que el enlace o el código QR estén completos.'
        : load.status === 'error'
          ? 'No pudimos cargar el recibo. Intenta de nuevo en un momento.'
          : !load.result.ok
            ? 'No pudimos mostrar este recibo.'
            : null;

  return createPortal(
    <div className="receipt-portal fixed inset-0 z-50 overflow-y-auto bg-neutral-100 px-3 py-6">
      {message !== null && <p className="receipt-actions mx-auto mt-20 max-w-sm text-center text-neutral-700">{message}</p>}
      {load?.status === 'found' && load.result.ok && (
        <div className="mx-auto flex max-w-[22rem] flex-col gap-4">
          <ReceiptSheet data={load.result.data} />
          <div className="receipt-actions">
            <button type="button" className={btnPrimary + ' w-full'} onClick={() => window.print()}>
              Imprimir
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
