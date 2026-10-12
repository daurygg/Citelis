// El papel del recibo térmico: solo DIBUJA un `ReceiptData` ya armado (INVARIANTE 5:
// ningún cálculo de dinero aquí). Es genérico a propósito: no sabe de citas ni de
// servicios, solo de renglones, así otro módulo podría reusarlo (INVARIANTE 3).
// En pantalla se ve centrado y angosto; al imprimir, index.css lo deja como único
// contenido de la página, a 80 mm, en negro sobre blanco.
import type { ReactNode } from 'react';
import { formatMoney } from '../lib/format';
import type { ReceiptData } from '../lib/domain/receipt';

const dashed = <div className="my-2 border-t border-dashed border-black" role="separator" />;

function Row({ left, right, strong }: { left: ReactNode; right: ReactNode; strong?: boolean }) {
  return (
    <div className={'flex items-baseline justify-between gap-3 ' + (strong ? 'text-base font-bold' : '')}>
      <span className="min-w-0 break-words">{left}</span>
      <span className="shrink-0 tabular-nums">{right}</span>
    </div>
  );
}

export function ReceiptSheet({ data, qr }: { data: ReceiptData; qr?: ReactNode }) {
  const { header, meta, lines, totals, payments, credit, footer } = data;
  return (
    <article className="receipt-paper mx-auto w-full max-w-[22rem] bg-white p-4 font-mono text-[13px] leading-snug text-black shadow-lg">
      <header className="flex flex-col items-center gap-1 text-center">
        {header.logo_url && (
          <img src={header.logo_url} alt={`Logo de ${header.name}`} className="mb-1 max-h-20 max-w-[60%] object-contain grayscale" />
        )}
        <h2 className="text-base font-bold uppercase">{header.name}</h2>
        {header.address && <p>{header.address}</p>}
        {header.phone && <p>Tel: {header.phone}</p>}
      </header>

      {dashed}
      <div className="flex flex-col gap-0.5">
        {meta.map((row) => (
          <Row key={row.label} left={row.label} right={row.value} />
        ))}
      </div>

      {dashed}
      <ul className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <li key={i}>
            <div className="font-bold">{line.name}</div>
            {line.note && <div>{line.note}</div>}
            <Row left={`${line.quantity} x ${formatMoney(line.unit_price)}`} right={formatMoney(line.line_total)} />
            {line.discount > 0 && <Row left="Descuento" right={`-${formatMoney(line.discount)}`} />}
          </li>
        ))}
      </ul>

      {dashed}
      <Row left="Subtotal" right={formatMoney(totals.subtotal)} />
      <Row left="Descuentos" right={totals.discounts > 0 ? `-${formatMoney(totals.discounts)}` : formatMoney(0)} />
      <div className="mt-1">
        <Row left="TOTAL" right={formatMoney(totals.total)} strong />
      </div>

      {dashed}
      <div className="flex flex-col gap-0.5">
        {payments.map((p) => (
          <Row key={p.label} left={p.label} right={formatMoney(p.amount)} />
        ))}
        <Row left="Crédito" right={formatMoney(credit)} />
      </div>

      {/* Hueco del QR "Tu recibo digital" (P6). Sin QR no se imprime nada: nunca uno falso. */}
      {qr && (
        <>
          {dashed}
          <div className="flex flex-col items-center gap-1 text-center">
            <p>Tu recibo digital</p>
            {qr}
          </div>
        </>
      )}

      {dashed}
      <p className="text-center font-bold">{footer}</p>
    </article>
  );
}
