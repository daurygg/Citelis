// "¿Quién te compró?": lo vendido en servicios a cada clienta en el periodo del
// reporte. Las cifras llegan ya sumadas del dominio (clientSales.ts).
import { useState } from 'react';
import type { ClientSales } from '../lib/domain/clientSales';
import { formatMoney } from '../lib/format';
import { btnText, rowDivider, surface } from './ui';

/** Cuántas se ven antes de pedir la lista completa. */
const PREVIEW = 10;

export function ClientSalesList({ rows }: { rows: readonly ClientSales[] }) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) return null;
  const visible = showAll ? rows : rows.slice(0, PREVIEW);

  return (
    <div className={surface + ' p-4'}>
      <h3 className="font-semibold">¿Quién te compró?</h3>
      <p className="text-sm text-muted">Servicios de este periodo, de la que más a la que menos</p>
      <ul className={'mt-2 tabular-nums ' + rowDivider}>
        {visible.map((row) => (
          <li key={row.key} className="flex flex-col gap-1 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 font-semibold break-words">{row.client}</span>
              <span className="shrink-0 font-semibold">{formatMoney(row.sold)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted">
              <span>{row.visits === 1 ? '1 cita' : `${row.visits} citas`}</span>
              <span className="text-green-700">Ganancia {formatMoney(row.profit)}</span>
            </div>
            {row.owes > 0 && (
              <span className="self-start rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-800">
                Debe {formatMoney(row.owes)}
              </span>
            )}
          </li>
        ))}
      </ul>
      {rows.length > PREVIEW && (
        <button type="button" className={btnText + ' -mx-3'} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Ver menos' : `Ver las ${rows.length} clientas`}
        </button>
      )}
    </div>
  );
}
