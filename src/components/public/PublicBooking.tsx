// Portal público de auto-reserva (Slice C de self-booking). Sin sesión y sin
// StoreProvider: la visitante es anónima, así que todo pasa por las RPC
// públicas de `publicBooking.ts`. Tres pasos — servicio, día y hora, datos de
// la clienta — y una pantalla final. Decisión D1 del ODD de self-booking: la
// solicitud NO se autoconfirma, así que esa pantalla nunca dice "reservado".
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import '@fontsource-variable/bricolage-grotesque/standard.css';
import type { Appointment, BookingPolicy, BusinessHours, Service, Slot } from '../../lib/domain/types';
import { generateSlots } from '../../lib/domain/availability';
import { toggleServiceId } from '../../lib/domain/selection';
import { formatTime, monthLabel, shiftISODate, todayISODate } from '../../lib/format';
import { longDayLabel } from '../../lib/public/dayLabels';
import { estimateLabel, summarizePublicSelection } from '../../lib/public/publicSelection';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useBusinessTheme } from '../../lib/useBusinessTheme';
import { readRememberedClient, rememberClient } from '../../lib/rememberedClient';
import { BookingProgress } from './BookingProgress';
import { DayStrip } from './DayStrip';
import { RequestReceipt } from './RequestReceipt';
import { ServiceList } from './ServiceList';
import { SlotPicker } from './SlotPicker';
import { SummaryBar } from './SummaryBar';
import { portalBack, portalInput, stepTitle } from './portalStyles';
import {
  fetchPublicBusiness,
  fetchPublicBusy,
  fetchPublicHours,
  requestPublicBooking,
  resolvePublicSlug,
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

/** Nombre del negocio para mostrar, o "Citelis" si viene vacío. */
function businessDisplayName(name: string | undefined): string {
  return name && name.trim() !== '' ? name.trim() : 'Citelis';
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
    price: s.price ?? 0,
    supply_cost: 0,
    cost_override: null,
    duration_min: s.duration_min,
    // El precio no entra al cálculo de huecos; el portal nunca lo recibe si es variable.
    variable_price: s.variable_price,
  };
}

export function PublicBooking({ slug: initialSlug }: { slug: string }) {
  // La dirección con la que se trabaja de verdad. Si `initialSlug` resulta ser
  // una dirección abandonada (T4, odd/tasks/editable-public-slug.md), esto se
  // corrige a la actual y toda la pantalla sigue trabajando con la nueva, sin
  // depender de que el padre vuelva a montar el componente.
  const [activeSlug, setActiveSlug] = useState(initialSlug);
  // Un solo intento de resolución por visita. Sin este freno, una dirección
  // resuelta que TAMBIÉN diera 'not_found' (base inconsistente) reintentaría
  // resolver para siempre.
  const resolveAttempted = useRef(false);
  const [businessLoad, setBusinessLoad] = useState<BusinessLoad>({ status: 'loading' });
  const [hoursLoad, setHoursLoad] = useState<HoursLoad>({ status: 'loading' });
  const [step, setStep] = useState<Step>('service');
  // En el orden en que la clienta los fue eligiendo: el primero es el principal.
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayISODate());
  const [busyLoad, setBusyLoad] = useState<BusyLoad>({ status: 'loading' });
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  // Prerellenados con lo que esta clienta dejó la última vez EN ESTE
  // dispositivo, para que quien vuelve no vuelva a teclear lo mismo. El
  // inicializador es perezoso: se lee una sola vez, al montar.
  const [clientName, setClientName] = useState(() => readRememberedClient()?.name ?? '');
  const [clientPhone, setClientPhone] = useState(() => readRememberedClient()?.phone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicBusiness(activeSlug).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        if (result.reason === 'connection_error') {
          setBusinessLoad({ status: 'error', message: result.message });
          return;
        }
        // reason === 'not_found': antes de rendirse, se pregunta si esta
        // dirección es una que el negocio abandonó (cambió su dirección desde
        // "Mi negocio") y, si es así, se corrige la barra de direcciones sola.
        if (resolveAttempted.current) {
          setBusinessLoad({ status: 'not_found' });
          return;
        }
        resolveAttempted.current = true;
        resolvePublicSlug(activeSlug).then((currentSlug) => {
          if (cancelled) return;
          if (currentSlug && currentSlug !== activeSlug) {
            window.history.replaceState(null, '', `/reservar/${encodeURIComponent(currentSlug)}`);
            setActiveSlug(currentSlug);
            return;
          }
          setBusinessLoad({ status: 'not_found' });
        });
        return;
      }
      setBusinessLoad({ status: 'ready', business: result.business });
    });
    fetchPublicHours(activeSlug).then((result) => {
      if (cancelled) return;
      setHoursLoad(result.ok ? { status: 'ready', hours: result.hours } : { status: 'error', message: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, [activeSlug]);

  const refreshBusy = useCallback(
    (date: string) => {
      setBusyLoad({ status: 'loading' });
      fetchPublicBusy(activeSlug, date).then((result) => {
        setBusyLoad(result.ok ? { status: 'ready', busy: result.busy } : { status: 'error', message: result.message });
      });
    },
    [activeSlug],
  );

  useEffect(() => {
    if (step === 'datetime') refreshBusy(selectedDate);
  }, [step, selectedDate, refreshBusy]);

  const business = businessLoad.status === 'ready' ? businessLoad.business : null;
  const selection = useMemo(
    () => summarizePublicSelection(business?.services ?? [], selectedServiceIds),
    [business, selectedServiceIds],
  );
  // Los servicios elegidos, en orden de elección (los ids ausentes del catálogo ya se descartaron).
  const selectedServices = useMemo(
    () =>
      selection.service_ids
        .map((id) => business?.services.find((s) => s.service_id === id))
        .filter((s): s is PublicBusinessService => s !== undefined),
    [business, selection],
  );
  const selectedNames = selectedServices.map((s) => s.service_name).join(', ');

  // Solo se fija el título cuando ya se conoce el negocio (paso 'ready'): si el
  // slug no existe o todavía está cargando, se deja el <title> estático de
  // `index.html` en vez de inventar un nombre.
  useDocumentTitle(business ? `${businessDisplayName(business.business_name)} — Reservar` : null);
  useBusinessTheme(business?.theme_color);

  const slots = useMemo<Slot[]>(() => {
    if (!business || !selection.ready) return [];
    if (hoursLoad.status !== 'ready' || busyLoad.status !== 'ready') return [];
    const { appointments, services } = busyToOccupancy(busyLoad.busy, business.business_id);
    const policy: BookingPolicy = { business_id: business.business_id, ...business.policy };
    return generateSlots({
      date: selectedDate,
      // La visita dura la SUMA de lo elegido: `generateSlots` ya la calcula.
      candidateServices: selectedServices.map((s) => toDomainService(s, business.business_id)),
      hours: toBusinessHours(hoursLoad.hours, business.business_id),
      blocks: [],
      appointments,
      services,
      policy,
      now: new Date(),
    });
  }, [business, selection, selectedServices, hoursLoad, busyLoad, selectedDate]);

  const dayChips = useMemo(() => {
    const count = business ? Math.min(DAY_CHIP_CAP, Math.max(1, business.policy.max_horizon_days)) : 7;
    const today = todayISODate();
    return Array.from({ length: count }, (_, i) => shiftISODate(today, i));
  }, [business]);

  async function handleSubmit() {
    if (!business || !selection.ready || !selectedSlot) return;
    const name = clientName.trim();
    const phone = clientPhone.trim();
    if (name === '' || phone === '') {
      setSubmitError('Escribe tu nombre y tu teléfono.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const result = await requestPublicBooking({
      slug: activeSlug,
      // En orden de elección: el primero es el servicio principal de la cita.
      serviceIds: selection.service_ids,
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
    // Solo se recuerda lo que llegó a enviarse bien: si la reserva falló, no
    // hay motivo para dar por buenos esos datos.
    rememberClient({ name, phone });
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
        <span className="mt-1 block text-xs text-portal-muted">{businessLoad.message}</span>
      </CenteredMessage>
    );
  }
  const readyBusiness = businessLoad.business;
  const readyBusinessName = businessDisplayName(readyBusiness.business_name);
  const today = todayISODate();
  const slotChosen = step === 'datetime' || step === 'details' ? selectedSlot : null;
  const showBar = selection.ready && step !== 'success';

  // Qué muestra la barra fija y qué hace su botón en cada paso.
  const bar = {
    service: { cta: 'Elegir hora', disabled: false, onCta: () => setStep('datetime') },
    datetime: { cta: 'Revisar mis datos', disabled: !selectedSlot, onCta: () => setStep('details') },
    details: { cta: submitting ? 'Enviando…' : 'Enviar solicitud', disabled: submitting, onCta: handleSubmit },
    success: { cta: '', disabled: true, onCta: () => {} },
  }[step];
  const barDetail = slotChosen
    ? `${longDayLabel(selectedDate)}, ${formatTime(slotChosen.start)}`
    : `${selection.duration_min} min`;

  return (
    <div
      className={
        'min-h-dvh bg-portal-paper px-4 pt-8 font-portal text-portal-ink ' + (showBar ? 'pb-40' : 'pb-10')
      }
    >
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <header>
          <p className="text-portal-muted">Reserva en</p>
          <h1
            className={
              'portal-display font-extrabold leading-[1.02] tracking-tight text-balance break-words ' +
              (readyBusinessName.length > 22 ? 'text-[1.875rem]' : 'text-[2.5rem]')
            }
          >
            {readyBusinessName}
          </h1>
        </header>

        {step !== 'success' && <BookingProgress current={step === 'service' ? 1 : step === 'datetime' ? 2 : 3} />}

        {step === 'service' && (
          <section className="flex flex-col gap-4">
            <div>
              <h2 className={stepTitle}>¿Qué te vas a hacer?</h2>
              <p className="mt-1 text-portal-muted">Puedes elegir más de uno.</p>
            </div>
            {readyBusiness.services.length === 0 && (
              <p className="text-portal-muted">
                Este negocio no tiene servicios disponibles para reservar en línea todavía.
              </p>
            )}
            <ServiceList
              services={readyBusiness.services}
              selectedIds={selection.service_ids}
              onToggle={(id) => {
                setSelectedServiceIds((prev) => toggleServiceId(prev, id));
                // Cambió la duración: el horario que tenía elegido ya no vale.
                setSelectedSlot(null);
              }}
            />
          </section>
        )}

        {step === 'datetime' && selection.ready && (
          <section className="flex flex-col gap-4">
            <div>
              <button type="button" className={portalBack} onClick={() => setStep('service')}>
                Cambiar servicios
              </button>
              <h2 className={stepTitle}>¿Cuándo te queda bien?</h2>
              <p className="mt-1 text-portal-muted first-letter:uppercase">{monthLabel(selectedDate)}</p>
            </div>

            <DayStrip
              dates={dayChips}
              today={today}
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
                setSelectedSlot(null);
              }}
            />

            {busyLoad.status === 'loading' && <p className="text-portal-muted">Buscando horarios…</p>}
            {busyLoad.status === 'error' && (
              <p className="text-red-700">No pudimos cargar los horarios de este día. Intenta de nuevo.</p>
            )}
            {hoursLoad.status === 'error' && (
              <p className="text-red-700">No pudimos cargar el horario de atención. Intenta de nuevo.</p>
            )}
            {busyLoad.status === 'ready' && hoursLoad.status === 'ready' && slots.length === 0 && (
              <p className="text-portal-muted">No hay horarios disponibles este día. Prueba otro.</p>
            )}
            {busyLoad.status === 'ready' && hoursLoad.status === 'ready' && slots.length > 0 && (
              <SlotPicker slots={slots} selected={selectedSlot} onSelect={setSelectedSlot} />
            )}
          </section>
        )}

        {step === 'details' && selection.ready && selectedSlot && (
          <section className="flex flex-col gap-4">
            <div>
              <button type="button" className={portalBack} onClick={() => setStep('datetime')} disabled={submitting}>
                Cambiar día u hora
              </button>
              <h2 className={stepTitle}>¿A nombre de quién va la cita?</h2>
            </div>

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="font-medium">Tu nombre</span>
                <input
                  className={portalInput}
                  type="text"
                  name="name"
                  autoComplete="name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nombre completo"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-medium">Tu teléfono</span>
                <input
                  className={portalInput}
                  type="tel"
                  name="tel"
                  autoComplete="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="Para avisarte si se confirma"
                />
              </label>

              {submitError && (
                <p role="alert" className="text-red-700">
                  {submitError}
                </p>
              )}
            </form>
          </section>
        )}

        {step === 'success' && selection.ready && selectedSlot && (
          <>
            <RequestReceipt
              businessName={readyBusinessName}
              serviceNames={selectedServices.map((s) => s.service_name)}
              dayLabel={longDayLabel(selectedDate)}
              timeLabel={formatTime(selectedSlot.start)}
              durationLabel={`${selection.duration_min} min`}
              estimate={estimateLabel(selection)}
              clientName={clientName.trim()}
              folio={confirmedId}
            />
            {/* El archivo .ics / enlace de Google Calendar (Slice E) es para el
                calendario de la DUEÑA, no de la clienta, y solo aparece cuando
                ella ACEPTA la solicitud, no aquí: prometer un evento para una
                cita que todavía no existe le mentiría a la clienta. */}
          </>
        )}
      </div>

      {showBar && (
        <SummaryBar
          title={selectedNames}
          detail={barDetail}
          price={estimateLabel(selection)}
          cta={bar.cta}
          ctaDisabled={bar.disabled}
          onCta={bar.onCta}
        />
      )}
    </div>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-portal-paper px-6 text-center font-portal text-portal-ink">
      <div>{children}</div>
    </div>
  );
}
