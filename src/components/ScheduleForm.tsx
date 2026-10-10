// Formulario para agendar una cita, o registrar una atención al paso (walk-in).
// - Agendar: nace PENDING sin dinero (INVARIANTE 2); el precio se cobra después.
// - Walk-in ("ya la atendí"): crea la cita YA completada, congelando el dinero.
// Inputs CONTROLADOS: cada campo tiene su estado y su onChange.
import { useEffect, useState, type FormEvent } from 'react';
import { newId, useStore } from '../lib/store/StoreContext';
import { formatMoney, formatTime, nowLocalDatetime, parseMoneyToCents } from '../lib/format';
import { buildChargeForm } from '../lib/domain/charge';
import { summarizeSelection, toggleServiceId } from '../lib/domain/selection';
import type { PaymentMethod } from '../lib/domain/types';
import { useToast } from './Toast';
import { PaymentMethodChips } from './PaymentPanel';
import { btnPrimary, card, chip, field, fieldLabel, input } from './ui';

export function ScheduleForm() {
  const store = useStore();
  const { notify } = useToast();
  const [client, setClient] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>(store.services[0] ? [store.services[0].id] : []);
  const [saving, setSaving] = useState(false);
  // Id de la cita en curso, fijo entre reintentos: si un intento llegó a
  // guardarse pero la respuesta se perdió, reintentar no la duplica (la clave
  // primaria lo frena y el store lo da por guardado). Se renueva al limpiar.
  const [draftId, setDraftId] = useState<number | null>(null);
  const [datetime, setDatetime] = useState('');
  const [walkIn, setWalkIn] = useState(false);
  // Cobro al paso: un precio por cada servicio variable + total opcional (igual que cobrar una cita).
  const [chargeTexts, setChargeTexts] = useState<{ prices: Record<number, string>; total: string }>({ prices: {}, total: '' });
  const [quotedText, setQuotedText] = useState(''); // precio acordado (al agendar)
  const [depositText, setDepositText] = useState(''); // abono/adelanto (al agendar)
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('cash'); // vía del abono
  // Atención al paso: con qué vía pagó todo, o 'credit' si todavía no pagó (queda a crédito).
  const [walkInPay, setWalkInPay] = useState<PaymentMethod | 'credit'>('cash');

  // Si la dueña cambia algo tras un fallo, ya es otra cita: id nuevo. Si no, un
  // reintento con datos editados chocaría con la versión vieja ya guardada y se
  // daría por buena sin serlo.
  useEffect(() => {
    setDraftId(null);
  }, [client, selectedIds, datetime, walkIn, quotedText, depositText, depositMethod, walkInPay, chargeTexts]);

  const selection = summarizeSelection(store.services, selectedIds);
  const selectedServices = selection.service_ids.flatMap((id) => store.services.find((s) => s.id === id) ?? []);
  const charge = buildChargeForm(selectedServices, chargeTexts);
  const hasVariable = selection.estimate.hasVariable;
  const quotedCents = quotedText.trim() === '' ? undefined : (parseMoneyToCents(quotedText) ?? undefined);
  const depositCents = depositText.trim() === '' ? undefined : (parseMoneyToCents(depositText) ?? undefined);

  const baseValid = client.trim() !== '' && selection.ready;
  // Al cobrar (walk-in), cada servicio de precio variable necesita su precio.
  const canSubmit = walkIn ? baseValid && charge.ready : baseValid && datetime !== '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // `saving`: un doble clic o doble Enter no registra (ni cobra) dos veces.
    if (!canSubmit || saving) return;
    const id = draftId ?? newId();
    setDraftId(id);
    if (walkIn) {
      setSaving(true);
      let result;
      try {
        result = await store.registerWalkIn({
          id,
          service_ids: selection.service_ids,
          client: client.trim(),
          datetime: datetime || nowLocalDatetime(),
          priceOverrides: charge.priceOverrides,
          price: charge.overridePrice,
          payment_method: walkInPay === 'credit' ? null : walkInPay,
        });
      } finally {
        setSaving(false);
      }
      if (!result.ok) {
        notify(result.message, 'error');
        // Si el servidor no la aceptó, el formulario NO se limpia: no se pierde
        // lo escrito. Salvo que la cita SÍ se guardara sin cobrar: reintentar
        // desde aquí la duplicaría.
        if (!result.leftPending) return;
      } else {
        notify('✓ Atención registrada y cobrada');
      }
    } else {
      const conflict = store.scheduleConflict(datetime, selection.service_ids);
      if (conflict) {
        notify(`Ese horario choca con ${conflict.client} (${formatTime(conflict.datetime)})`, 'error');
        return;
      }
      setSaving(true);
      let result;
      try {
        result = await store.schedule({
          id,
          client: client.trim(),
          service_ids: selection.service_ids,
          datetime,
          quoted_price: quotedCents,
          deposit: depositCents,
          deposit_method: depositCents ? depositMethod : undefined,
        });
      } finally {
        setSaving(false);
      }
      // Si el servidor no la guardó, el formulario conserva lo escrito.
      if (!result.ok) {
        notify(result.message, 'error');
        return;
      }
      notify('✓ Cita agendada');
    }
    setDraftId(null);
    setClient('');
    setDatetime('');
    setChargeTexts({ prices: {}, total: '' });
    setQuotedText('');
    setDepositText('');
    setDepositMethod('cash');
    setWalkInPay('cash');
  }

  return (
    <form onSubmit={handleSubmit} className={card + ' flex flex-col gap-3'}>
      <h2 className="text-lg font-semibold">{walkIn ? 'Registrar atención' : 'Agendar cita'}</h2>

      <label className={field}>
        <span className={fieldLabel}>Clienta</span>
        <input
          className={input}
          type="text"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Nombre de la clienta"
        />
      </label>

      <fieldset className={field}>
        <legend className={fieldLabel}>Servicios (puedes elegir varios)</legend>
        <div className="flex flex-wrap gap-2">
          {store.services.map((service) => {
            const on = selectedIds.includes(service.id);
            return (
              <button
                key={service.id}
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedIds((ids) => toggleServiceId(ids, service.id))}
                className={
                  chip + ' ' +
                  (on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700')
                }
              >
                {service.name}
              </button>
            );
          })}
        </div>
        {selection.service_ids.length > 0 && (
          <p className="text-sm text-neutral-600">
            Duran {selection.duration_min} min · Precio estimado:{' '}
            {hasVariable
              ? selection.estimate.total > 0
                ? `${formatMoney(selection.estimate.total)} + a convenir`
                : 'a convenir'
              : formatMoney(selection.estimate.total)}
          </p>
        )}
        {selectedServices.some((service) => service.duration_min <= 0) && (
          // Sin esto el botón quedaría apagado sin explicar por qué.
          <p className="text-sm text-red-600">
            {selectedServices
              .filter((service) => service.duration_min <= 0)
              .map((service) => service.name)
              .join(', ')}{' '}
            no tiene duración. Ponle cuánto dura en Servicios para poder agendarlo.
          </p>
        )}
      </fieldset>

      <label className={field}>
        <span className={fieldLabel}>
          {walkIn ? 'Fecha y hora (opcional, por defecto ahora)' : 'Fecha y hora'}
        </span>
        <input className={input} type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />
      </label>

      {walkIn && (
        <>
          {/* Un precio por cada servicio de precio variable, con su nombre. */}
          {charge.variableServices.map((service) => (
            <label key={service.id} className={field}>
              <span className={fieldLabel}>¿Cuánto cobraste por {service.name}? (obligatorio)</span>
              <input
                className={input}
                type="text"
                inputMode="decimal"
                value={chargeTexts.prices[service.id] ?? ''}
                onChange={(e) => setChargeTexts((t) => ({ ...t, prices: { ...t.prices, [service.id]: e.target.value } }))}
                placeholder={`Precio de ${service.name}`}
              />
            </label>
          ))}
          {charge.showTotalField && (
            <label className={field}>
              <span className={fieldLabel}>
                {selectedServices.length > 1
                  ? '¿Pactaste un precio por todo? (opcional)'
                  : '¿Cobraste otro precio? (opcional)'}
              </span>
              <input
                className={input}
                type="text"
                inputMode="decimal"
                value={chargeTexts.total}
                onChange={(e) => setChargeTexts((t) => ({ ...t, total: e.target.value }))}
                placeholder="Dejar vacío para el precio normal"
              />
            </label>
          )}
          <div className={field}>
            <span className={fieldLabel}>¿Cómo te pagó?</span>
            <PaymentMethodChips
              value={walkInPay === 'credit' ? null : walkInPay}
              onChange={setWalkInPay}
              label="Vía de pago"
              extra={{ label: 'Todavía no pagó (a crédito)', active: walkInPay === 'credit', onSelect: () => setWalkInPay('credit') }}
            />
          </div>
        </>
      )}

      {!walkIn && hasVariable && (
        <label className={field}>
          <span className={fieldLabel}>Precio acordado (opcional; puedes ponerlo al cobrar)</span>
          <input
            className={input}
            type="text"
            inputMode="decimal"
            value={quotedText}
            onChange={(e) => setQuotedText(e.target.value)}
            placeholder="Ej: para maquillaje, el precio pactado"
          />
        </label>
      )}

      {!walkIn && (
        <label className={field}>
          <span className={fieldLabel}>Abono / adelanto (opcional)</span>
          <input
            className={input}
            type="text"
            inputMode="decimal"
            value={depositText}
            onChange={(e) => setDepositText(e.target.value)}
            placeholder="Lo que dejó pagado por adelantado"
          />
        </label>
      )}
      {!walkIn && depositCents !== undefined && depositCents > 0 && (
        <div className={field}>
          <span className={fieldLabel}>¿Cómo pagó el abono?</span>
          <PaymentMethodChips value={depositMethod} onChange={setDepositMethod} label="Vía del abono" />
        </div>
      )}

      <label className="flex min-h-11 items-center gap-2 text-sm text-neutral-700">
        <input className="size-5" type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} />
        Ya la atendí (cobrar ahora)
      </label>

      <button type="submit" className={btnPrimary} disabled={!canSubmit || saving}>
        {saving ? 'Guardando…' : walkIn ? 'Registrar y cobrar' : 'Agendar'}
      </button>
    </form>
  );
}
