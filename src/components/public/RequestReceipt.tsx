// Comprobante de la solicitud. Decisión D1 del ODD de self-booking: la solicitud
// NO se autoconfirma, así que el estado dice "Pendiente de confirmar" y nunca "reservado".
interface Props {
  businessName: string;
  serviceNames: readonly string[];
  dayLabel: string;
  timeLabel: string;
  durationLabel: string;
  estimate: string;
  clientName: string;
  folio: number | null;
}

export function RequestReceipt({
  businessName,
  serviceNames,
  dayLabel,
  timeLabel,
  durationLabel,
  estimate,
  clientName,
  folio,
}: Props) {
  return (
    <article className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
      <div className="border-b border-dashed border-line p-5">
        <p className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-sm font-medium">
          <span aria-hidden="true" className="size-2 rounded-full bg-brand-700" />
          Pendiente de confirmar
        </p>
        <h2 className="mt-3 text-[1.75rem] leading-tight font-semibold tracking-tight text-balance">
          Recibimos tu solicitud
        </h2>
        <p className="mt-2 text-muted">
          Esto todavía no es una cita confirmada: {businessName} tiene que aceptarla. Te avisamos apenas responda.
        </p>
      </div>
      <dl className="divide-y divide-line px-5">
        <ReceiptRow label="Servicios">
          {serviceNames.map((n) => (
            <span key={n} className="block break-words">
              {n}
            </span>
          ))}
        </ReceiptRow>
        <ReceiptRow label="Día">{dayLabel}</ReceiptRow>
        <ReceiptRow label="Hora">{timeLabel}</ReceiptRow>
        <ReceiptRow label="Duración">{durationLabel}</ReceiptRow>
        <ReceiptRow label="Precio estimado">{estimate}</ReceiptRow>
        <ReceiptRow label="A nombre de">{clientName}</ReceiptRow>
        {folio !== null && <ReceiptRow label="Folio">{folio}</ReceiptRow>}
      </dl>
      <div className="h-2" />
    </article>
  );
}

function ReceiptRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}
