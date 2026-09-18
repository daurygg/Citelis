// Portal público de auto-reserva (Slice C de self-booking). Sin sesión y sin
// StoreProvider: la visitante es anónima, así que todo pasa por las RPC
// públicas de `publicBooking.ts`. Tres pasos — servicio, día y hora, datos de
// la clienta — y una pantalla final. Decisión D1 del ODD de self-booking: la
// solicitud NO se autoconfirma, así que esa pantalla nunca dice "reservado".
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Appointment, BookingPolicy, BusinessHours, Service, Slot } from '../../lib/domain/types';
import { generateSlots } from '../../lib/domain/availability';
import { formatMoney, formatTime, shiftISODate, todayISODate } from '../../lib/format';
import { btnGhost, btnPrimary, card, field, fieldLabel, input } from '../ui';
import {
  fetchPublicBusiness,
  fetchPublicBusy,
  fetchPublicHours,
  requestPublicBooking,
  type PublicBusinessInfo,
  type PublicBusinessService,
  type PublicBusyRow,
  type PublicHoursRow,
} from '../../lib/public/publicBooking';

type Step = 'service' | 'datetime' | 'details' | 'success';

type BusinessLoad =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; business: PublicBusinessInfo };

type HoursLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; hours: PublicHoursRow[] };

type BusyLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; busy: PublicBusyRow[] };

const DAY_CHIP_CAP = 30;
const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** "2026-07-02" → "jue 2" (etiqueta compacta para los chips de día). */
function dayChipLabel(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10));
  const weekday = new Date(`${isoDate}T00:00`).getDay();
  return `${WEEKDAY_SHORT[weekday]} ${day}`;
}

/**
 * `public_busy` devuelve huecos ANÓNIMOS ({starts_at, duration_min}), no
 * citas reales: no trae `status` ni servicio al que asociarlos. Se fabrica
 * una cita y un servicio "gemelo" por fila —con ids sintéticos negativos,
 * que nunca chocan con ids reales— solo para que `generateSlots` (el
 * algoritmo de disponibilidad ya probado en Slice A) pueda resolver la
 * duración de cada hueco. El estado se fija en `PENDING`: cualquier estado
 * que `holdsSchedule` considere ocupante sirve, porque aquí no hay un estado
 * real que copiar.
 */
function busyToOccupancy(
  rows: readonly PublicBusyRow[],
  businessId: number,
): { appointments: Appointment[]; services: Service[] } {
  const appointments: Appointment[] = [];
  const services: Service[] = [];
  rows.forEach((row, i) => {
    const syntheticId = -(i + 1);
    appointments.push({
      id: syntheticId,
      business_id: businessId,
      service_id: syntheticId,
      client: '',
      datetime: row.starts_at,
      status: 'PENDING',
      quoted_price: null,
      deposit: null,
      charged_price: null,
      actual_cost: null,
      profit: null,
    });
    services.push({
      id: syntheticId,
      business_id: businessId,
      name: '',
      price: 0,
      supply_cost: 0,
      cost_override: null,
      duration_min: row.duration_min,
      variable_price: false,
    });
  });
  return { appointments, services };
}

/** `public_hours` no trae id propio: se le da uno sintético solo para tipar. */
function toBusinessHours(rows: readonly PublicHoursRow[], businessId: number): BusinessHours[] {
  return rows.map((r, i) => ({
    id: -(i + 1),
    business_id: businessId,
    weekday: r.weekday,
    opens_at: r.opens_at,
    closes_at: r.closes_at,
  }));
}

/** El servicio elegido, en la forma que pide `generateSlots`. */
function toDomainService(s: PublicBusinessService, businessId: number): Service {
  return {
    id: s.service_id,
    business_id: businessId,
    name: s.service_name,
    price: s.price,
    supply_cost: 0,
    cost_override: null,
    duration_min: s.duration_min,
    variable_price: false,
  };
}

export function PublicBooking({ slug }: { slug: string }) {
  const [businessLoad, setBusinessLoad] = useState<BusinessLoad>({ status: 'loading' });
  const [hoursLoad, setHoursLoad] = useState<HoursLoad>({ status: 'loading' });
  const [step, setStep] = useState<Step>('service');
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(todayISODate());
  const [busyLoad, setBusyLoad] = useState<BusyLoad>({ status: 'loading' });
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicBusiness(slug).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setBusinessLoad(
          result.reason === 'not_found' ? { status: 'not_found' } : { status: 'error', message: result.message },
        );
        return;
      }
      setBusinessLoad({ status: 'ready', business: result.business });
    });
    fetchPublicHours(slug).then((result) => {
      if (cancelled) return;
      setHoursLoad(result.ok ? { status: 'ready', hours: result.hours } : { status: 'error', message: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const refreshBusy = useCallback(
    (date: string) => {
      setBusyLoad({ status: 'loading' });
      fetchPublicBusy(slug, date).then((result) => {
        setBusyLoad(result.ok ? { status: 'ready', busy: result.busy } : { status: 'error', message: result.message });
      });
    },
    [slug],
  );

  useEffect(() => {
    if (step === 'datetime') refreshBusy(selectedDate);
  }, [step, selectedDate, refreshBusy]);

  const business = businessLoad.status === 'ready' ? businessLoad.business : null;
  const selectedService = business?.services.find((s) => s.service_id === selectedServiceId) ?? null;

  const slots = useMemo<Slot[]>(() => {
    if (!business || !selectedService) return [];
    if (hoursLoad.status !== 'ready' || busyLoad.status !== 'ready') return [];
    const { appointments, services } = busyToOccupancy(busyLoad.busy, business.business_id);
    const policy: BookingPolicy = { business_id: business.business_id, ...business.policy };
    return generateSlots({
      date: selectedDate,
      service: toDomainService(selectedService, business.business_id),
      hours: toBusinessHours(hoursLoad.hours, business.business_id),
      blocks: [],
      appointments,
      services,
      policy,
      now: new Date(),
    });
  }, [business, selectedService, hoursLoad, busyLoad, selectedDate]);

  const dayChips = useMemo(() => {
    const count = business ? Math.min(DAY_CHIP_CAP, Math.max(1, business.policy.max_horizon_days)) : 7;
    const today = todayISODate();
    return Array.from({ length: count }, (_, i) => shiftISODate(today, i));
  }, [business]);

  async function handleSubmit() {
    if (!business || !selectedService || !selectedSlot) return;
    const name = clientName.trim();
    const phone = clientPhone.trim();
    if (name === '' || phone === '') {
      setSubmitError('Escribe tu nombre y tu teléfono.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const result = await requestPublicBooking({
      slug,
      serviceId: selectedService.service_id,
      datetime: selectedSlot.start,
      clientName: name,
      clientPhone: phone,
    });
    setSubmitting(false);
    if (!result.ok) {
      // La causa típica: alguien más acaba de tomar ese horario. Se manda de
      // vuelta a elegir hora (el efecto de arriba refresca `public_busy`)
      // en vez de dejarla insistiendo sobre un horario que ya no existe.
      setSubmitError(result.message);
      setSelectedSlot(null);
      setStep('datetime');
      return;
    }
    setConfirmedId(result.appointmentId);
    setStep('success');
  }

  if (businessLoad.status === 'loading') {
    return <CenteredMessage>Cargando…</CenteredMessage>;
  }
  if (businessLoad.status === 'not_found') {
    return <CenteredMessage>Este negocio no acepta reservas en línea ahora mismo.</CenteredMessage>;
  }
  if (businessLoad.status === 'error') {
    return (
      <CenteredMessage>
        No pudimos conectar. Intenta de nuevo en un momento.
        <span className="mt-1 block text-xs text-neutral-400">{businessLoad.message}</span>
      </CenteredMessage>
    );
  }
  const readyBusiness = businessLoad.business;

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6 text-neutral-900">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <header className="text-center">
          <h1 className="text-xl font-bold text-rose-700">{readyBusiness.business_name}</h1>
          <p className="text-sm text-neutral-500">Reserva tu cita en línea</p>
        </header>

        <StepIndicator step={step} />

        {step === 'service' && (
          <div className={card + ' flex flex-col gap-2'}>
            <h2 className="text-lg font-semibold">Elige tu servicio</h2>
            {readyBusiness.services.length === 0 && (
              <p className="text-sm text-neutral-500">
                Este negocio no tiene servicios disponibles para reservar en línea todavía.
              </p>
            )}
            {readyBusiness.services.map((s) => (
              <button
                key={s.service_id}
                type="button"
                className={
                  'flex items-center justify-between rounded-xl border px-3 py-3 text-left transition ' +
                  (selectedServiceId === s.service_id
                    ? 'border-rose-500 bg-rose-50'
                    : 'border-neutral-200 hover:bg-neutral-50')
                }
                onClick={() => setSelectedServiceId(s.service_id)}
              >
                <span>
                  <span className="block font-medium">{s.service_name}</span>
                  <span className="block text-xs text-neutral-500">{s.duration_min} min</span>
                </span>
                <span className="font-semibold text-rose-700">{formatMoney(s.price)}</span>
              </button>
            ))}
            <button
              type="button"
              className={btnPrimary + ' mt-2'}
              disabled={selectedServiceId === null}
              onClick={() => setStep('datetime')}
            >
              Continuar
            </button>
          </div>
        )}

        {step === 'datetime' && selectedService && (
          <div className={card + ' flex flex-col gap-3'}>
            <h2 className="text-lg font-semibold">Elige día y hora</h2>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {dayChips.map((date) => (
                <button
                  key={date}
                  type="button"
                  className={
                    'shrink-0 rounded-lg border px-3 py-2 text-sm ' +
                    (date === selectedDate
                      ? 'border-rose-500 bg-rose-50 font-semibold text-rose-700'
                      : 'border-neutral-200 text-neutral-600')
                  }
                  onClick={() => {
                    setSelectedDate(date);
                    setSelectedSlot(null);
                  }}
                >
                  {dayChipLabel(date)}
                </button>
              ))}
            </div>

            {busyLoad.status === 'loading' && <p className="text-sm text-neutral-500">Buscando horarios…</p>}
            {busyLoad.status === 'error' && (
              <p className="text-sm text-red-600">No pudimos cargar los horarios de este día. Intenta de nuevo.</p>
            )}
            {hoursLoad.status === 'error' && (
              <p className="text-sm text-red-600">No pudimos cargar el horario de atención. Intenta de nuevo.</p>
            )}
            {busyLoad.status === 'ready' && hoursLoad.status === 'ready' && slots.length === 0 && (
              <p className="text-sm text-neutral-500">No hay horarios disponibles este día. Prueba otro.</p>
            )}
            {busyLoad.status === 'ready' && hoursLoad.status === 'ready' && slots.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    className={
                      'rounded-lg border px-2 py-2 text-sm ' +
                      (selectedSlot?.start === slot.start
                        ? 'border-rose-500 bg-rose-50 font-semibold text-rose-700'
                        : 'border-neutral-200 text-neutral-700')
                    }
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {formatTime(slot.start)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" className={btnGhost} onClick={() => setStep('service')}>
                Atrás
              </button>
              <button
                type="button"
                className={btnPrimary + ' flex-1'}
                disabled={!selectedSlot}
                onClick={() => setStep('details')}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {step === 'details' && selectedService && selectedSlot && (
          <div className={card + ' flex flex-col gap-3'}>
            <h2 className="text-lg font-semibold">Tus datos</h2>
            <p className="text-sm text-neutral-500">
              {selectedService.service_name} · {dayChipLabel(selectedDate)} · {formatTime(selectedSlot.start)}
            </p>

            <label className={field}>
              <span className={fieldLabel}>Tu nombre</span>
              <input
                className={input}
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Nombre completo"
              />
            </label>

            <label className={field}>
              <span className={fieldLabel}>Tu teléfono</span>
              <input
                className={input}
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="Para avisarte si se confirma"
              />
            </label>

            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <div className="flex gap-2">
              <button type="button" className={btnGhost} onClick={() => setStep('datetime')} disabled={submitting}>
                Atrás
              </button>
              <button type="button" className={btnPrimary + ' flex-1'} disabled={submitting} onClick={handleSubmit}>
                {submitting ? 'Enviando…' : 'Solicitar cita'}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && selectedService && selectedSlot && (
          <div className={card + ' flex flex-col gap-2 text-center'}>
            <h2 className="text-lg font-semibold text-rose-700">Solicitud enviada — te confirmamos pronto</h2>
            <p className="text-sm text-neutral-600">
              Pediste <strong>{selectedService.service_name}</strong> el {dayChipLabel(selectedDate)} a las{' '}
              {formatTime(selectedSlot.start)}.
            </p>
            <p className="text-sm text-neutral-500">
              Esto todavía no es una cita confirmada: {readyBusiness.business_name} tiene que aceptarla. Te avisamos
              apenas responda.
            </p>
            {/* El archivo .ics / enlace de Google Calendar (Slice E) se entrega
                solo cuando la dueña ACEPTA la solicitud, no aquí: prometer un
                calendario para una cita que todavía no existe le mentiría a
                la clienta. */}
            {confirmedId !== null && <p className="text-xs text-neutral-400">Folio: {confirmedId}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-neutral-50 px-6 text-center text-neutral-600">
      <div>{children}</div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  if (step === 'success') return null;
  const steps: { id: Step; label: string }[] = [
    { id: 'service', label: 'Servicio' },
    { id: 'datetime', label: 'Día y hora' },
    { id: 'details', label: 'Tus datos' },
  ];
  const activeIndex = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
      {steps.map((s, i) => (
        <span key={s.id} className={i === activeIndex ? 'font-semibold text-rose-700' : ''}>
          {i + 1}. {s.label}
          {i < steps.length - 1 && <span className="mx-1 text-neutral-300">·</span>}
        </span>
      ))}
    </div>
  );
}
