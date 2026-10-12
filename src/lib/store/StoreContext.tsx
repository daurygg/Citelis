// Store respaldado por Supabase (Slice 4), con la MISMA fachada síncrona que
// usaban las Fases 1-3 (para no reescribir la UI). Al montar carga los datos del
// negocio; cada cambio actualiza el estado local (optimista) y se persiste por
// detrás (write-through). Los cálculos siguen en el dominio puro (INVARIANTE 5).
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  Appointment,
  AppointmentPayment,
  BookingPolicyRow,
  Business,
  BusinessHours,
  Employee,
  FixedExpense,
  MemberName,
  PaymentKind,
  PaymentMethod,
  Service,
  ServiceSupply,
  Supply,
  TimeBlock,
} from '../domain/types';
import {
  appointmentServiceIds,
  foldServiceIds,
  previewCompletion,
  previewLines,
  transition,
  type AppointmentServiceRow,
  type CompleteOptions,
} from '../domain/appointments';
import { completeRpcArgs, planCompletion, type ChargePayment } from '../domain/charge';
import { creditsByClient, incomeByMethod, paymentStatus, type ClientCredit, type IncomeByMethod, type PaymentStatus } from '../domain/payments';
import { buildReceiptData, type ReceiptLineInput, type ReceiptResult } from '../domain/receipt';
import { scheduleRpcArgs } from '../domain/selection';
import { checkServicesEdit, updateServicesRpcArgs, type ServicesEditCheck } from '../domain/editServices';
import { applyAppointmentChange, applyServiceIds, keepKnownServiceIds } from './appointmentSync';
import { isAlreadySaved, type WriteError } from './writeResult';
import { startLiveAppointments } from './liveAppointments';
import { findScheduleConflict } from '../domain/scheduling';
import { effectiveCost, profit, suppliesCost } from '../domain/costs';
import { expectedProfitForServices, fixedExpensesForMonth, weekSummary, type ServiceProfitLine, type WeekSummary } from '../domain/reports';
import { completedWithoutLines, mergeServiceLines } from './serviceLines';
import { dayRange, shiftMonthISODate } from '../format';
import { supabase } from '../supabase/client';
import { useAuth } from '../auth/AuthContext';
import { LOGO_BUCKET, buildLogoPath, validateAddress, validateDisplayName, validateLogoFile, validatePhone } from '../domain/receiptProfile';
import { Onboarding } from '../../components/Onboarding';

// ── Tipos de la fachada (idénticos a las fases en memoria) ──────────────────
export interface ScheduleInput {
  /** Id fijo entre reintentos (ver `newId`): un reintento no duplica la cita. */
  id?: number;
  /** Servicios de la cita. El primero es el principal (`service_id`). */
  service_ids: number[];
  client: string;
  datetime: string;
  quoted_price?: number; // precio acordado (servicios variables), opcional
  deposit?: number; // abono/adelanto pagado al reservar, opcional
  deposit_method?: PaymentMethod; // cómo pagó el abono (el pago nace con la cita)
}
export interface WalkInInput {
  /** Id fijo entre reintentos (ver `newId`): un reintento no duplica la cita. */
  id?: number;
  /** Servicios de la atención. El primero es el principal (`service_id`). */
  service_ids: number[];
  client: string;
  datetime: string;
  /** Precio de cada servicio de precio variable, por id (de `buildChargeForm`). */
  priceOverrides?: ReadonlyMap<number, number>;
  /** Total pactado, si lo hay: manda sobre la suma. */
  price?: number;
  /** Vía con la que pagó TODO el cobro. null = no pagó todavía: queda a crédito. */
  payment_method?: PaymentMethod | null;
}
// Resultado de una escritura que SÍ espera al servidor (cobrar). `message` va en
// el idioma de la dueña porque la UI lo muestra tal cual.
// `leftPending`: la cita SÍ se guardó, pero quedó sin cobrar (la RPC falló después
// de insertarla). Quien llama no debe reintentar el alta, o la duplicaría.
export type ActionResult = { ok: true } | { ok: false; message: string; leftPending?: true };
export interface CompletionPreview {
  charged_price: number;
  actual_cost: number;
  profit: number;
}
/** Desglose del cobro por línea (lista, descuento, neto) y descuentos que no valen. */
export type CompletionBreakdown = NonNullable<ReturnType<typeof previewLines>>;
export interface SupplyInput {
  name: string;
  purchase_price: number;
  servings: number;
}
export interface ServicePatch {
  name?: string;
  price?: number;
  duration_min?: number;
  variable_price?: boolean;
}
export interface ServiceEconomics {
  supply_cost: number;
  effective_cost: number;
  margin: number;
}
export interface FixedExpenseInput {
  concept: string;
  amount: number;
  month: string; // 'YYYY-MM' al que corresponde el gasto
}

// ── Auto-reserva (Slice D: lado de la dueña) ────────────────────────────────
// `booking_policy` en supabase/self-booking.sql trae columnas que
// src/lib/domain/types.ts todavía no declara (`public_slug`, `enabled`,
// `max_requests_per_phone_per_day`): ese archivo está fuera del alcance de
// este slice (ver odd/tasks/self-booking.md). Se extiende aquí, como forma de
// fila de Supabase, no como regla de negocio pura.
export type BookingPolicyPatch = Partial<Omit<BookingPolicyRow, 'business_id'>>;

export interface BusinessHoursInput {
  weekday: number;
  opens_at: string; // 'HH:MM'
  closes_at: string; // 'HH:MM'
}
export interface TimeBlockInput {
  starts_at: string; // 'YYYY-MM-DDTHH:MM'
  ends_at: string;
  reason: string;
}


export interface Store {
  services: readonly Service[];
  /** Todas las empleadas del negocio, activas o no (las de baja siguen en el historial). */
  employees: readonly Employee[];
  addEmployee: (name: string) => number;
  renameEmployee: (employeeId: number, name: string) => void;
  setEmployeeActive: (employeeId: number, active: boolean) => void;
  appointmentsForDay: (isoDate: string) => Appointment[];
  projectedProfitForDay: (isoDate: string) => number;
  dayReport: (isoDate: string) => WeekSummary;
  completionPreview: (appointmentId: number, options?: CompleteOptions) => CompletionPreview | null;
  completionBreakdown: (appointmentId: number, options?: CompleteOptions) => CompletionBreakdown | null;
  scheduleConflict: (datetime: string, serviceIds: readonly number[], excludeId?: number) => Appointment | null;
  schedule: (input: ScheduleInput) => Promise<ActionResult>;
  checkServicesEdit: (appointmentId: number, serviceIds: readonly number[]) => ServicesEditCheck;
  updateAppointmentServices: (appointmentId: number, serviceIds: readonly number[]) => Promise<ActionResult>;
  reschedule: (appointmentId: number, datetime: string) => void;
  complete: (appointmentId: number, options?: CompleteOptions, payments?: readonly ChargePayment[]) => Promise<ActionResult>;
  /** Pagos de la cita (abonos, cobro y pagos de crédito). Solo lectura: append-only. */
  payments: readonly AppointmentPayment[];
  paymentStatusOf: (appointmentId: number) => PaymentStatus | null;
  /** Lo ya pagado de una cita (para el resto por cobrar). */
  paidOf: (appointmentId: number) => number;
  /** Crédito vivo de servicios por clienta. Separado del crédito de ropa (INVARIANTE 3). */
  serviceCredits: () => ClientCredit[];
  incomeByMethod: (from: string, to: string) => IncomeByMethod;
  /** Registra un abono (cita abierta) o un pago de crédito (cita cobrada). Espera al servidor. */
  addPayment: (appointmentId: number, amount: number, method: PaymentMethod, kind: Extract<PaymentKind, 'deposit' | 'credit_payment'>, clientRef?: string) => Promise<ActionResult>;
  cancel: (appointmentId: number) => void;
  markNoShow: (appointmentId: number) => void;
  registerWalkIn: (input: WalkInInput) => Promise<ActionResult>;
  suppliesForService: (serviceId: number) => Supply[];
  allSupplies: () => Supply[];
  serviceEconomics: (serviceId: number) => ServiceEconomics | null;
  addService: () => number;
  updateService: (serviceId: number, patch: ServicePatch) => void;
  deleteService: (serviceId: number) => void;
  setServiceCostOverride: (serviceId: number, cents: number | null) => void;
  addSupplyToService: (serviceId: number, input: SupplyInput) => void;
  linkExistingSupply: (serviceId: number, supplyId: number) => void;
  unlinkSupply: (serviceId: number, supplyId: number) => void;
  updateSupply: (supplyId: number, patch: Partial<SupplyInput>) => void;
  weekReport: (from: string, to: string) => WeekSummary;
  fixedExpenses: readonly FixedExpense[];
  expensesForMonth: (month: string) => FixedExpense[];
  monthExpensesTotal: (month: string) => number;
  addFixedExpense: (input: FixedExpenseInput) => void;
  removeFixedExpense: (id: number) => void;
  copyPreviousMonthExpenses: (month: string) => void;
  // Auto-reserva (Slice D): horarios, bloqueos, política y bandeja de solicitudes.
  business: Business | null;
  businessHours: readonly BusinessHours[];
  timeBlocks: readonly TimeBlock[];
  bookingPolicy: BookingPolicyRow | null;
  pendingRequests: () => Appointment[];
  setBusinessHours: (input: BusinessHoursInput) => void;
  removeBusinessHours: (id: number) => void;
  addTimeBlock: (input: TimeBlockInput) => void;
  removeTimeBlock: (id: number) => void;
  updateBookingPolicy: (patch: BookingPolicyPatch) => void;
  acceptRequest: (appointmentId: number) => void;
  rejectRequest: (appointmentId: number) => void;
  // Color de marca del negocio (T5, odd/tasks/business-theming.md): se puede
  // cambiar después de crearlo, no solo al crearlo.
  updateBusinessTheme: (hex: string) => void;
  // Datos del recibo (P4). A diferencia del color, esperan al servidor: un rechazo
  // (RLS, longitud) tiene que verlo la dueña, no perderse en silencio.
  /** Quién soy (auth.uid) y los nombres visibles de las miembros del negocio. */
  currentUserId: string | null;
  memberNames: readonly MemberName[];
  updateReceiptProfile: (input: { address: string; phone: string }) => Promise<SaveResult>;
  setMyDisplayName: (name: string) => Promise<SaveResult>;
  /** Sube el logo (valida tipo y peso), guarda su ruta y borra el anterior. */
  uploadBusinessLogo: (file: File) => Promise<SaveResult>;
  removeBusinessLogo: () => Promise<SaveResult>;
  /** URL pública del logo, o null si no hay. */
  businessLogoUrl: string | null;
  /**
   * Emite (idempotente) el recibo de una cita COMPLETED y arma su `ReceiptData`.
   * Lee del servidor la cita, sus líneas y sus pagos al abrirlo: las líneas con
   * descuento y empleada no viven en memoria y así el recibo nunca va desfasado.
   */
  /** `token`: el del recibo digital público (para el QR); null si no se pudo emitir. */
  loadReceipt: (appointmentId: number) => Promise<{ result: ReceiptResult; token: string | null }>;
  // Dirección pública del negocio (T3, odd/tasks/editable-public-slug.md).
  // A diferencia de todo lo demás de este store, esto NO es optimista: ver el
  // comentario junto a su implementación.
  updatePublicSlug: (slug: string) => Promise<{ ok: true; slug: string } | { ok: false; message: string }>;
}

export type SaveResult = { ok: true } | { ok: false; message: string };

const StoreContext = createContext<Store | null>(null);

// Id numérico único generado en el cliente (conserva la fachada síncrona).
export function newId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

// Dispara una escritura a Supabase y registra el error si falla (no bloquea la UI).
function persist(op: PromiseLike<{ error: unknown }>): void {
  op.then((res) => {
    if (res.error) console.error('Persistencia falló:', res.error);
  });
}

interface LoadedData {
  businessId: number;
  business: Business | null;
  services: Service[];
  supplies: Supply[];
  serviceSupplies: ServiceSupply[];
  employees: Employee[];
  payments: AppointmentPayment[];
  appointments: Appointment[];
  /** Líneas de `appointment_service` con su ganancia congelada (reportes por servicio). */
  serviceLines: ServiceProfitLine[];
  fixedExpenses: FixedExpense[];
  businessHours: BusinessHours[];
  timeBlocks: TimeBlock[];
  bookingPolicy: BookingPolicyRow | null;
  memberNames: MemberName[];
  currentUserId: string | null;
}

// Carga inicial: resuelve el negocio del usuario y trae sus datos. Solo cuando
// están listos monta StoreReady (así los métodos trabajan con business_id definido).
export function StoreProvider({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noBusiness, setNoBusiness] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // `order by` antes del `limit`: sin él, con más de una membresía Postgres
      // puede devolver cualquiera de las dos y la app abriría un negocio distinto
      // en cada carga. El modelo permite varias membresías (invitaciones,
      // create_business), así que el desempate tiene que ser explícito: se abre
      // siempre el negocio más antiguo del usuario.
      const { data: members, error: mErr } = await supabase
        .from('business_member')
        .select('business_id')
        .order('business_id', { ascending: true })
        .limit(1);
      if (!active) return;
      if (mErr) {
        setError('No se pudieron cargar tus datos: ' + mErr.message);
        return;
      }
      if (!members || members.length === 0) {
        setNoBusiness(true); // sin negocio → pantalla de onboarding
        return;
      }
      const businessId = (members[0] as { business_id: number }).business_id;
      // INVARIANTE 1: cada consulta filtra por business_id de forma explícita,
      // además de la RLS. Con varias membresías, la RLS deja ver las filas de
      // todos los negocios del usuario; sin este filtro se mezclarían.
      const [biz, svc, sup, ss, emp, apt, aptSvc, fx, bh, tb, bp, pay, names, sess] = await Promise.all([
        // El nombre del negocio sale en el .ics y en el link de Google Calendar.
        supabase.from('business').select('*').eq('id', businessId),
        supabase.from('service').select('*').eq('business_id', businessId),
        supabase.from('supply').select('*').eq('business_id', businessId),
        supabase.from('service_supply').select('*').eq('business_id', businessId),
        supabase.from('employee').select('*').eq('business_id', businessId).order('id', { ascending: true }),
        supabase.from('appointment').select('*').eq('business_id', businessId),
        // Los servicios de cada cita (varios por cita): alimentan `service_ids` y,
        // con `profit` (congelado al completar), el servicio más rentable.
        supabase.from('appointment_service').select('appointment_id, service_id, business_id, profit').eq('business_id', businessId),
        supabase.from('fixed_expense').select('*').eq('business_id', businessId),
        supabase.from('business_hours').select('*').eq('business_id', businessId),
        supabase.from('time_block').select('*').eq('business_id', businessId),
        // Una fila por negocio (PK = business_id); todavía puede no existir.
        supabase.from('booking_policy').select('*').eq('business_id', businessId),
        // Pagos de las citas (abonos, cobros, pagos de crédito). Si falla, se cargan sin pagos.
        supabase.from('appointment_payment').select('*').eq('business_id', businessId),
        // Nombres visibles de quienes cobran (RPC acotada a mi negocio). Si falla, sin nombres.
        supabase.rpc('business_member_names', { p_business_id: businessId }),
        supabase.auth.getSession(),
      ]);
      if (!active) return;
      setData({
        businessId,
        business: ((biz.data ?? [])[0] ?? null) as Business | null,
        services: (svc.data ?? []) as Service[],
        supplies: (sup.data ?? []) as Supply[],
        serviceSupplies: (ss.data ?? []) as ServiceSupply[],
        employees: (emp.data ?? []) as Employee[],
        payments: ((pay.data ?? []) as AppointmentPayment[]).filter((p) => p.business_id === businessId),
        // Si la consulta de líneas falla, cada cita cae a su `service_id`.
        appointments: foldServiceIds((apt.data ?? []) as Appointment[], (aptSvc.data ?? []) as AppointmentServiceRow[], businessId),
        serviceLines: ((aptSvc.data ?? []) as ServiceProfitLine[]).filter((l) => l.business_id === businessId),
        fixedExpenses: (fx.data ?? []) as FixedExpense[],
        businessHours: (bh.data ?? []) as BusinessHours[],
        timeBlocks: (tb.data ?? []) as TimeBlock[],
        bookingPolicy: ((bp.data ?? [])[0] ?? null) as BookingPolicyRow | null,
        memberNames: (names.data ?? []) as MemberName[],
        currentUserId: sess.data.session?.user.id ?? null,
      });
    })();
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-50 px-6 text-center">
        <div>
          <p className="mb-4 text-neutral-700">{error}</p>
          <button type="button" className="text-sm text-brand-700 hover:underline" onClick={() => signOut()}>
            Salir
          </button>
        </div>
      </div>
    );
  }
  if (noBusiness) return <Onboarding />;
  if (!data) {
    return <div className="grid min-h-dvh place-items-center bg-neutral-50 text-neutral-500">Cargando tus datos…</div>;
  }
  return <StoreReady data={data}>{children}</StoreReady>;
}

function StoreReady({ data, children }: { data: LoadedData; children: ReactNode }) {
  const businessId = data.businessId;
  const [business, setBusiness] = useState<Business | null>(data.business);
  const [memberNames, setMemberNames] = useState<readonly MemberName[]>(data.memberNames);
  const [services, setServices] = useState<readonly Service[]>(data.services);
  const [supplies, setSupplies] = useState<readonly Supply[]>(data.supplies);
  const [serviceSupplies, setServiceSupplies] = useState<readonly ServiceSupply[]>(data.serviceSupplies);
  const [employees, setEmployees] = useState<readonly Employee[]>(data.employees);
  const [payments, setPayments] = useState<readonly AppointmentPayment[]>(data.payments);
  const [appointments, setAppointments] = useState<readonly Appointment[]>(data.appointments);
  const [serviceLines, setServiceLines] = useState<readonly ServiceProfitLine[]>(data.serviceLines);
  const [fixedExpenses, setFixedExpenses] = useState<readonly FixedExpense[]>(data.fixedExpenses);
  const [businessHours, setBusinessHoursState] = useState<readonly BusinessHours[]>(data.businessHours);
  const [timeBlocks, setTimeBlocksState] = useState<readonly TimeBlock[]>(data.timeBlocks);
  const [bookingPolicy, setBookingPolicyState] = useState<BookingPolicyRow | null>(data.bookingPolicy);

  // Citas en vivo: la reserva que entra desde el portal (o el cambio hecho en
  // otro dispositivo) aparece sin recargar, y al volver a la app se pone al día.
  // Ver liveAppointments.ts y odd/tasks/live-appointments.md.
  useEffect(
    () =>
      startLiveAppointments({
        client: supabase,
        doc: document,
        businessId,
        onChange: (change) => setAppointments((prev) => applyAppointmentChange(prev, change, businessId)),
        onServiceIds: (id, ids) => setAppointments((prev) => applyServiceIds(prev, id, ids, businessId)),
        onResync: (fresh) => setAppointments((prev) => keepKnownServiceIds(prev, fresh)),
      }),
    [businessId],
  );

  // Una cita cobrada desde otro dispositivo llega por Realtime sin sus líneas
  // (esa tabla no se emite). Se piden aparte, una sola vez por cita: si no las
  // hay (cita anterior al reparto) el reporte la atribuye a su servicio principal.
  const linesRequested = useRef(new Set<number>());
  const missingLineIds = completedWithoutLines(appointments, serviceLines).filter((id) => !linesRequested.current.has(id));
  const missingKey = missingLineIds.join(',');
  useEffect(() => {
    if (missingLineIds.length === 0) return;
    missingLineIds.forEach((id) => linesRequested.current.add(id));
    // Sin bandera de cancelación A PROPÓSITO: la propia petición cambia
    // `missingKey` (los ids pasan a "pedidos"), así que cancelar en la limpieza
    // del efecto descartaba la respuesta y esas citas no se volvían a pedir.
    // Una respuesta de otro negocio la descarta mergeServiceLines (INVARIANTE 1).
    void (async () => {
      try {
        // INVARIANTE 1: filtro explícito por negocio, además de la RLS.
        const { data: rows, error } = await supabase
          .from('appointment_service')
          .select('appointment_id, service_id, business_id, profit')
          .eq('business_id', businessId)
          .in('appointment_id', missingLineIds);
        if (error || !rows) {
          missingLineIds.forEach((id) => linesRequested.current.delete(id)); // reintentable
          return;
        }
        setServiceLines((prev) => mergeServiceLines(prev, rows as ServiceProfitLine[], businessId));
      } catch {
        missingLineIds.forEach((id) => linesRequested.current.delete(id));
      }
    })();
    // missingKey resume missingLineIds: solo se vuelve a pedir si cambia el conjunto.
  }, [missingKey, businessId]);

  // ── Lecturas (puras, sobre el estado ya cargado) ──────────────────────────
  function appointmentsForDay(isoDate: string): Appointment[] {
    const dayKey = isoDate.slice(0, 10);
    return appointments
      .filter((a) => a.business_id === businessId)
      // Ni canceladas ni solicitudes rechazadas ensucian la agenda del día.
      .filter((a) => a.status !== 'CANCELED' && a.status !== 'REJECTED')
      .filter((a) => a.datetime.slice(0, 10) === dayKey)
      .sort((a, b) => a.datetime.localeCompare(b.datetime));
  }

  function projectedProfitForDay(isoDate: string): number {
    return appointmentsForDay(isoDate)
      .filter((a) => a.status === 'PENDING' || a.status === 'IN_PROGRESS')
      .reduce((sum: number, a) => {
        const set = appointmentServiceIds(a).flatMap((id) => services.find((s) => s.id === id) ?? []);
        // Si falta algún servicio del catálogo, la cita no suma (no se estima a medias).
        if (set.length !== appointmentServiceIds(a).length) return sum;
        // Usa el precio acordado si lo hay; ignora precios desconocidos (null).
        const expected = expectedProfitForServices(a, set);
        return expected === null ? sum : sum + expected;
      }, 0);
  }

  function dayReport(isoDate: string): WeekSummary {
    const { from, to } = dayRange(isoDate);
    return weekSummary(appointments, businessId, from, to, serviceLines);
  }

  function completionPreview(appointmentId: number, options: CompleteOptions = {}): CompletionPreview | null {
    const appointment = appointments.find((a) => a.id === appointmentId);
    if (!appointment) return null;
    return previewCompletion(appointment, services, options.overridePrice, options.priceOverrides, options.discounts);
  }

  function completionBreakdown(appointmentId: number, options: CompleteOptions = {}): CompletionBreakdown | null {
    const appointment = appointments.find((a) => a.id === appointmentId);
    if (!appointment) return null;
    return previewLines(appointment, services, options);
  }

  function paymentStatusOf(appointmentId: number): PaymentStatus | null {
    const appointment = appointments.find((a) => a.id === appointmentId && a.business_id === businessId);
    return appointment ? paymentStatus(appointment, payments, businessId) : null;
  }

  function paidOf(appointmentId: number): number {
    return payments
      .filter((p) => p.business_id === businessId && p.appointment_id === appointmentId)
      .reduce((sum, p) => sum + p.amount, 0);
  }

  function serviceCredits(): ClientCredit[] {
    return creditsByClient(appointments, payments, businessId);
  }

  function paymentsIncome(from: string, to: string): IncomeByMethod {
    return incomeByMethod(appointments, payments, businessId, from, to);
  }

  function suppliesForService(serviceId: number): Supply[] {
    const linkedIds = serviceSupplies.filter((l) => l.service_id === serviceId).map((l) => l.supply_id);
    return supplies.filter((s) => linkedIds.includes(s.id));
  }

  function allSupplies(): Supply[] {
    return supplies.filter((s) => s.business_id === businessId);
  }

  function serviceEconomics(serviceId: number): ServiceEconomics | null {
    const service = services.find((s) => s.id === serviceId);
    if (!service) return null;
    const effective_cost = effectiveCost(service);
    return { supply_cost: service.supply_cost, effective_cost, margin: profit(service.price, effective_cost) };
  }

  function weekReport(from: string, to: string): WeekSummary {
    return weekSummary(appointments, businessId, from, to, serviceLines);
  }

  function expensesForMonth(month: string): FixedExpense[] {
    return fixedExpenses.filter((e) => e.business_id === businessId && e.month === month);
  }

  function monthExpensesTotal(month: string): number {
    return fixedExpensesForMonth(fixedExpenses, businessId, month);
  }

  // Solicitudes que esperan respuesta de la dueña, de la más próxima a la más lejana.
  // `client_phone` viaja en la fila aunque `Appointment` no lo declare (ver Appointment).
  function pendingRequests(): Appointment[] {
    return appointments
      .filter((a) => a.business_id === businessId && a.status === 'REQUESTED')
      .sort((a, b) => a.datetime.localeCompare(b.datetime))
      .map((a) => a as Appointment);
  }

  // ── Escrituras (estado local + persistencia) ──────────────────────────────
  // Devuelve una cita que choca con el horario propuesto, o null si está libre.
  function scheduleConflict(datetime: string, serviceIds: readonly number[], excludeId?: number): Appointment | null {
    const scoped = appointments.filter((a) => a.business_id === businessId);
    // La duración de la candidata es la SUMA de todos sus servicios.
    return findScheduleConflict({ datetime, service_ids: [...serviceIds], id: excludeId }, scoped, services);
  }

  // Reprograma (cambia fecha/hora) una cita abierta. No congela dinero (INVARIANTE 2).
  function reschedule(appointmentId: number, datetime: string): void {
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, datetime } : a)));
    persist(supabase.from('appointment').update({ datetime }).eq('id', appointmentId).eq('business_id', businessId));
  }

  // Agenda una cita con TODOS sus servicios en UNA transacción
  // (`schedule_appointment`, T6c). Como `complete`, rompe a propósito el patrón
  // fire-and-forget: con dos escrituras sueltas la cita podría quedar sin sus
  // líneas. El estado local solo cambia cuando el servidor confirma, y si falla
  // el formulario conserva lo escrito para reintentar.
  // Si la respuesta se perdió tras el commit, el reintento (mismo id) choca con
  // la clave primaria: eso confirma que ya estaba guardada (isAlreadySaved).
  async function insertScheduled(appointment: Appointment, depositMethod?: PaymentMethod): Promise<WriteError | null> {
    try {
      const { error } = await supabase.rpc(
        'schedule_appointment',
        scheduleRpcArgs(businessId, { ...appointment, service_ids: appointmentServiceIds(appointment), deposit_method: depositMethod }),
      );
      return isAlreadySaved(error) ? null : error;
    } catch (e) {
      return { message: e instanceof Error ? e.message : 'No se pudo conectar con el servidor.' };
    }
  }

  function newPayment(appointmentId: number, amount: number, method: PaymentMethod | null, kind: PaymentKind, id = newId()): AppointmentPayment {
    return { id, business_id: businessId, appointment_id: appointmentId, amount, method, kind, paid_at: new Date().toISOString() };
  }

  // Pone al día los pagos de UNA cita con lo que el servidor guardó de verdad
  // (ids reales). Si la lectura falla, se añaden los pagos recién confirmados para
  // que la pantalla no se quede atrás; el servidor ya los tiene.
  async function syncPayments(appointmentId: number, added: AppointmentPayment[]): Promise<void> {
    try {
      // INVARIANTE 1: filtro explícito por negocio, además de la RLS.
      const { data: rows, error } = await supabase
        .from('appointment_payment')
        .select('*')
        .eq('business_id', businessId)
        .eq('appointment_id', appointmentId);
      if (!error && rows) {
        const fresh = (rows as AppointmentPayment[]).filter((p) => p.business_id === businessId);
        setPayments((prev) => [...prev.filter((p) => p.appointment_id !== appointmentId), ...fresh]);
        return;
      }
    } catch {
      // cae al respaldo local
    }
    setPayments((prev) => [...prev, ...added]);
  }

  async function schedule(input: ScheduleInput): Promise<ActionResult> {
    if (input.service_ids.length === 0) return { ok: false, message: 'Elige al menos un servicio.' };
    const appointment: Appointment = {
      id: input.id ?? newId(),
      business_id: businessId,
      service_id: input.service_ids[0],
      service_ids: input.service_ids,
      client: input.client,
      datetime: input.datetime,
      status: 'PENDING',
      quoted_price: input.quoted_price ?? null,
      deposit: input.deposit ?? null,
      charged_price: null,
      actual_cost: null,
      profit: null,
    };
    const error = await insertScheduled(appointment, input.deposit_method);
    if (error) return { ok: false, message: error.message };
    putAppointment(appointment);
    // El abono es un pago: el servidor lo creó con la cita, aquí se refleja.
    if (appointment.deposit != null && appointment.deposit > 0) {
      await syncPayments(appointment.id, [newPayment(appointment.id, appointment.deposit, input.deposit_method ?? null, 'deposit')]);
    }
    return { ok: true };
  }

  // ¿Cabe este conjunto de servicios en la cita? Sirve a la pantalla para
  // explicar por qué no, antes de intentar guardar.
  function servicesEditCheck(appointmentId: number, serviceIds: readonly number[]): ServicesEditCheck {
    const current = appointments.find((a) => a.id === appointmentId && a.business_id === businessId);
    if (!current) return { ok: false, reason: 'No encontramos esa cita.' };
    return checkServicesEdit({
      appointment: current,
      serviceIds,
      services,
      appointments: appointments.filter((a) => a.business_id === businessId),
      hours: businessHours.filter((h) => h.business_id === businessId),
      blocks: timeBlocks.filter((b) => b.business_id === businessId),
    });
  }

  // Cambia los servicios de una cita aún abierta (`update_appointment_services`).
  // Como `schedule` y `complete`, ESPERA al servidor: reemplazar las líneas son
  // varias escrituras y a medias dejarían la cita con servicios de menos. El
  // dominio decide si la nueva suma de duraciones cabe en el horario; el
  // servidor vuelve a comprobar estado, negocio y lista. El estado local solo
  // cambia cuando el servidor confirma, y el dinero no se toca (INVARIANTE 2).
  async function updateAppointmentServices(appointmentId: number, serviceIds: readonly number[]): Promise<ActionResult> {
    const check = servicesEditCheck(appointmentId, serviceIds);
    if (!check.ok) return { ok: false, message: check.reason };
    let error: { message: string } | null;
    try {
      ({ error } = await supabase.rpc('update_appointment_services', updateServicesRpcArgs(businessId, appointmentId, check.service_ids)));
    } catch (e) {
      error = { message: e instanceof Error ? e.message : 'No se pudo conectar con el servidor.' };
    }
    if (error) return { ok: false, message: error.message };
    setAppointments((prev) =>
      prev.map((a) => (a.id === appointmentId ? { ...a, service_id: check.service_ids[0], service_ids: check.service_ids } : a)),
    );
    return { ok: true };
  }

  // Llama a la RPC de cobro. Un fallo de red puede llegar como excepción en vez de
  // como `error`; se normaliza para que quien llama siempre reciba un resultado.
  async function callCompleteRpc(
    plan: Parameters<typeof completeRpcArgs>[1],
    chargePayments: readonly ChargePayment[] = [],
  ): Promise<{ error: { message: string } | null }> {
    try {
      const { error } = await supabase.rpc('complete_appointment', completeRpcArgs(businessId, plan, chargePayments));
      return { error };
    } catch (e) {
      return { error: { message: e instanceof Error ? e.message : 'No se pudo conectar con el servidor.' } };
    }
  }

  // Pone en el estado local una cita ya persistida. Si el evento en vivo de
  // Realtime se adelantó y ya la trajo, la reemplaza en vez de duplicarla.
  function putAppointment(next: Appointment): void {
    setAppointments((prev) => (prev.some((a) => a.id === next.id) ? prev.map((a) => (a.id === next.id ? next : a)) : [...prev, next]));
  }

  // Las líneas que acaba de congelar el servidor, para el reporte sin recargar.
  function planLines(plan: Parameters<typeof completeRpcArgs>[1]): ServiceProfitLine[] {
    return plan.lines.map((l) => ({
      appointment_id: plan.completed.id,
      service_id: l.service_id,
      business_id: businessId,
      profit: l.profit,
    }));
  }

  // Cobra la cita: congela su dinero Y el de cada servicio en UNA transacción
  // (`complete_appointment`, T6b). ROMPE A PROPÓSITO el patrón fire-and-forget de
  // `persist()`: si la cita quedara COMPLETED sin su reparto no habría forma de
  // arreglarlo después sin reescribir historia (INVARIANTE 2). El estado local
  // solo cambia cuando el servidor confirma; si falla, la cita sigue abierta y
  // la dueña puede reintentar. El cálculo es del dominio; el servidor solo
  // persiste lo que llega y comprueba que cuadre.
  async function complete(
    appointmentId: number,
    options: CompleteOptions = {},
    chargePayments: readonly ChargePayment[] = [],
  ): Promise<ActionResult> {
    const current = appointments.find((a) => a.id === appointmentId);
    if (!current) return { ok: false, message: 'No encontramos esa cita.' };
    let plan;
    try {
      plan = planCompletion(current, services, options);
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'No se pudo calcular el cobro.' };
    }
    const { error } = await callCompleteRpc(plan, chargePayments);
    if (error) return { ok: false, message: error.message };
    const { status, charged_price, actual_cost, profit } = plan.completed;
    setServiceLines((prev) => mergeServiceLines(prev, planLines(plan), businessId));
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, status, charged_price, actual_cost, profit } : a)));
    await syncPayments(
      appointmentId,
      chargePayments.map((p) => newPayment(appointmentId, p.amount, p.method, 'charge')),
    );
    return { ok: true };
  }

  // Registra un pago suelto: un abono (cita abierta) o un pago de crédito (cita
  // ya cobrada). Como `complete`, ESPERA al servidor, que valida estado y sobrepago;
  // el estado local solo cambia cuando confirma. NO toca el dinero congelado de la
  // cita (INVARIANTE 2): solo añade un pago. La referencia del intento la fija quien llama
  // (el servidor la deduplica por cita) para que un reintento tras un corte de red no pague dos veces.
  async function addPayment(
    appointmentId: number,
    amount: number,
    method: PaymentMethod,
    kind: Extract<PaymentKind, 'deposit' | 'credit_payment'>,
    clientRef: string = crypto.randomUUID(),
  ): Promise<ActionResult> {
    let error: WriteError | null;
    try {
      ({ error } = await supabase.rpc('add_appointment_payment', {
        p_business_id: businessId,
        p_appointment_id: appointmentId,
        p_amount: amount,
        p_method: method,
        p_kind: kind,
        p_client_ref: clientRef,
      }));
    } catch (e) {
      error = { message: e instanceof Error ? e.message : 'No se pudo conectar con el servidor.' };
    }
    if (error) return { ok: false, message: error.message };
    await syncPayments(appointmentId, [newPayment(appointmentId, amount, method, kind)]);
    return { ok: true };
  }

  function cancel(appointmentId: number): void {
    const current = appointments.find((a) => a.id === appointmentId);
    if (!current) return;
    const next = transition(current, 'CANCELED');
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? next : a)));
    persist(supabase.from('appointment').update({ status: next.status }).eq('id', appointmentId).eq('business_id', businessId));
  }

  function markNoShow(appointmentId: number): void {
    const current = appointments.find((a) => a.id === appointmentId);
    if (!current) return;
    const next = transition(current, 'NO_SHOW');
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? next : a)));
    persist(supabase.from('appointment').update({ status: next.status }).eq('id', appointmentId).eq('business_id', businessId));
  }

  // La atención de mostrador nace ya cobrada, pero pasa por el MISMO camino
  // atómico que cobrar una cita: se inserta PENDING y se completa con la RPC, que
  // escribe también sus líneas de servicio (una por servicio, T6c).
  // Se calcula ANTES de escribir, para no dejar una cita huérfana por un error
  // de cálculo. Si la RPC falla después de insertar, la cita queda PENDING (y
  // visible en la agenda) para que la dueña la cobre otra vez.
  async function registerWalkIn(input: WalkInInput): Promise<ActionResult> {
    if (input.service_ids.length === 0) return { ok: false, message: 'Elige al menos un servicio.' };
    if (input.service_ids.some((id) => !services.some((s) => s.id === id))) {
      return { ok: false, message: 'No encontramos ese servicio.' };
    }
    const pending: Appointment = {
      id: input.id ?? newId(),
      business_id: businessId,
      service_id: input.service_ids[0],
      service_ids: input.service_ids,
      client: input.client,
      datetime: input.datetime,
      status: 'PENDING',
      quoted_price: null,
      deposit: null,
      charged_price: null,
      actual_cost: null,
      profit: null,
    };
    let plan;
    try {
      plan = planCompletion(pending, services, { overridePrice: input.price, priceOverrides: input.priceOverrides });
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'No se pudo calcular el cobro.' };
    }
    // Por `schedule_appointment`: la cita y sus líneas nacen juntas.
    const insertError = await insertScheduled(pending);
    if (insertError) return { ok: false, message: insertError.message };
    putAppointment(pending);
    // Con vía, la clienta pagó TODO el cobro por ella; sin vía queda a crédito.
    const total = plan.completed.charged_price as number;
    const walkInPayments: ChargePayment[] = input.payment_method && total > 0 ? [{ amount: total, method: input.payment_method }] : [];
    const { error } = await callCompleteRpc(plan, walkInPayments);
    if (error) {
      // La cita ya existe (PENDING, visible en la agenda). Reintentar el alta la
      // duplicaría, así que se avisa que se cobre desde la agenda.
      return {
        ok: false,
        leftPending: true,
        message: `La atención quedó en la agenda sin cobrar (${error.message}). Cóbrala desde ahí.`,
      };
    }
    setServiceLines((prev) => mergeServiceLines(prev, planLines(plan), businessId));
    putAppointment({ ...pending, ...plan.completed });
    await syncPayments(
      pending.id,
      walkInPayments.map((p) => newPayment(pending.id, p.amount, p.method, 'charge')),
    );
    return { ok: true };
  }

  // Recalcula el cache supply_cost de los servicios afectados y lo persiste.
  function recomputeCaches(nextSupplies: readonly Supply[], nextLinks: readonly ServiceSupply[]): void {
    const computed = services.map((s) => {
      const ids = nextLinks.filter((l) => l.service_id === s.id).map((l) => l.supply_id);
      const cost = suppliesCost(nextSupplies.filter((x) => ids.includes(x.id)));
      return { service: s, cost };
    });
    setServices((prev) =>
      prev.map((s) => {
        const found = computed.find((c) => c.service.id === s.id);
        return found ? { ...s, supply_cost: found.cost } : s;
      }),
    );
    for (const { service, cost } of computed) {
      if (cost !== service.supply_cost) {
        persist(supabase.from('service').update({ supply_cost: cost }).eq('id', service.id).eq('business_id', businessId));
      }
    }
  }

  function addService(): number {
    const service: Service = {
      id: newId(),
      business_id: businessId,
      name: 'Nuevo servicio',
      price: 0,
      supply_cost: 0,
      cost_override: null,
      duration_min: 60,
      variable_price: false,
    };
    setServices((prev) => [...prev, service]);
    persist(supabase.from('service').insert(service));
    return service.id;
  }

  function updateService(serviceId: number, patch: ServicePatch): void {
    setServices((prev) => prev.map((s) => (s.id === serviceId ? { ...s, ...patch } : s)));
    persist(supabase.from('service').update(patch).eq('id', serviceId).eq('business_id', businessId));
  }

  function deleteService(serviceId: number): void {
    setServices((prev) => prev.filter((s) => s.id !== serviceId));
    setServiceSupplies((prev) => prev.filter((l) => l.service_id !== serviceId));
    // La FK service_supply.service_id tiene ON DELETE CASCADE → borra los enlaces.
    persist(supabase.from('service').delete().eq('id', serviceId).eq('business_id', businessId));
  }

  function setServiceCostOverride(serviceId: number, cents: number | null): void {
    setServices((prev) => prev.map((s) => (s.id === serviceId ? { ...s, cost_override: cents } : s)));
    persist(supabase.from('service').update({ cost_override: cents }).eq('id', serviceId).eq('business_id', businessId));
  }

  function addSupplyToService(serviceId: number, input: SupplyInput): void {
    const supply: Supply = { id: newId(), business_id: businessId, ...input };
    const link: ServiceSupply = { business_id: businessId, service_id: serviceId, supply_id: supply.id };
    const nextSupplies = [...supplies, supply];
    const nextLinks = [...serviceSupplies, link];
    setSupplies(nextSupplies);
    setServiceSupplies(nextLinks);
    persist(supabase.from('supply').insert(supply));
    persist(supabase.from('service_supply').insert(link));
    recomputeCaches(nextSupplies, nextLinks);
  }

  function linkExistingSupply(serviceId: number, supplyId: number): void {
    if (serviceSupplies.some((l) => l.service_id === serviceId && l.supply_id === supplyId)) return;
    const link: ServiceSupply = { business_id: businessId, service_id: serviceId, supply_id: supplyId };
    const nextLinks = [...serviceSupplies, link];
    setServiceSupplies(nextLinks);
    persist(supabase.from('service_supply').insert(link));
    recomputeCaches(supplies, nextLinks);
  }

  function unlinkSupply(serviceId: number, supplyId: number): void {
    const nextLinks = serviceSupplies.filter((l) => !(l.service_id === serviceId && l.supply_id === supplyId));
    setServiceSupplies(nextLinks);
    persist(supabase.from('service_supply').delete().eq('service_id', serviceId).eq('supply_id', supplyId).eq('business_id', businessId));
    recomputeCaches(supplies, nextLinks);
  }

  function updateSupply(supplyId: number, patch: Partial<SupplyInput>): void {
    const nextSupplies = supplies.map((su) => (su.id === supplyId ? { ...su, ...patch } : su));
    setSupplies(nextSupplies);
    persist(supabase.from('supply').update(patch).eq('id', supplyId).eq('business_id', businessId));
    recomputeCaches(nextSupplies, serviceSupplies);
  }

  function addFixedExpense(input: FixedExpenseInput): void {
    const expense: FixedExpense = {
      id: newId(),
      business_id: businessId,
      concept: input.concept,
      amount: input.amount,
      month: input.month,
      period: 'MONTHLY',
    };
    setFixedExpenses((prev) => [...prev, expense]);
    persist(supabase.from('fixed_expense').insert(expense));
  }

  function removeFixedExpense(id: number): void {
    setFixedExpenses((prev) => prev.filter((e) => e.id !== id));
    persist(supabase.from('fixed_expense').delete().eq('id', id).eq('business_id', businessId));
  }

  // Copia al mes indicado los gastos del mes anterior que aún no estén (por concepto),
  // para no re-teclear los que se repiten. Los montos se pueden ajustar luego.
  function copyPreviousMonthExpenses(month: string): void {
    const prevMonth = shiftMonthISODate(`${month}-01`, -1).slice(0, 7);
    const already = new Set(
      fixedExpenses
        .filter((e) => e.business_id === businessId && e.month === month)
        .map((e) => e.concept.trim().toLowerCase()),
    );
    const toCopy = fixedExpenses.filter(
      (e) => e.business_id === businessId && e.month === prevMonth && !already.has(e.concept.trim().toLowerCase()),
    );
    if (toCopy.length === 0) return;
    const created: FixedExpense[] = toCopy.map((e, i) => ({
      id: newId() + i, // +i evita colisión si se generan en el mismo milisegundo
      business_id: businessId,
      concept: e.concept,
      amount: e.amount,
      month,
      period: 'MONTHLY',
    }));
    setFixedExpenses((prev) => [...prev, ...created]);
    for (const e of created) persist(supabase.from('fixed_expense').insert(e));
  }

  // Añade un tramo de horario de trabajo para un día (varias filas por día
  // permiten mañana y tarde con almuerzo de por medio).
  function setBusinessHours(input: BusinessHoursInput): void {
    const row: BusinessHours = { id: newId(), business_id: businessId, ...input };
    setBusinessHoursState((prev) => [...prev, row]);
    persist(supabase.from('business_hours').insert(row));
  }

  function removeBusinessHours(id: number): void {
    setBusinessHoursState((prev) => prev.filter((h) => h.id !== id));
    persist(supabase.from('business_hours').delete().eq('id', id).eq('business_id', businessId));
  }

  // Bloquea un tramo puntual (vacaciones, un asunto personal…).
  function addTimeBlock(input: TimeBlockInput): void {
    const row: TimeBlock = { id: newId(), business_id: businessId, ...input };
    setTimeBlocksState((prev) => [...prev, row]);
    persist(supabase.from('time_block').insert(row));
  }

  function removeTimeBlock(id: number): void {
    setTimeBlocksState((prev) => prev.filter((b) => b.id !== id));
    persist(supabase.from('time_block').delete().eq('id', id).eq('business_id', businessId));
  }

  // Valores por defecto si la dueña todavía no tiene fila en booking_policy
  // (negocio recién creado, o self-booking.sql aún no aplicado).
  const DEFAULT_BOOKING_POLICY: Omit<BookingPolicyRow, 'business_id' | 'public_slug'> = {
    enabled: false,
    slot_step_min: 30,
    buffer_min: 0,
    min_notice_hours: 2,
    max_horizon_days: 30,
    max_requests_per_phone_per_day: 3,
  };

  // Crea o actualiza la política de reserva (una fila por negocio, PK = business_id).
  function updateBookingPolicy(patch: BookingPolicyPatch): void {
    if (bookingPolicy) {
      const next: BookingPolicyRow = { ...bookingPolicy, ...patch };
      setBookingPolicyState(next);
      persist(supabase.from('booking_policy').update(patch).eq('business_id', businessId));
      return;
    }
    const created: BookingPolicyRow = {
      business_id: businessId,
      public_slug: patch.public_slug ?? `negocio-${businessId}`,
      ...DEFAULT_BOOKING_POLICY,
      ...patch,
    };
    setBookingPolicyState(created);
    persist(supabase.from('booking_policy').insert(created));
  }

  // La dueña acepta la solicitud: REQUESTED → PENDING, vía transition() (INVARIANTE 7).
  function acceptRequest(appointmentId: number): void {
    const current = appointments.find((a) => a.id === appointmentId);
    if (!current) return;
    const next = transition(current, 'PENDING');
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? next : a)));
    persist(supabase.from('appointment').update({ status: next.status }).eq('id', appointmentId).eq('business_id', businessId));
  }

  // La dueña rechaza la solicitud: REQUESTED → REJECTED, vía transition() (INVARIANTE 7).
  function rejectRequest(appointmentId: number): void {
    const current = appointments.find((a) => a.id === appointmentId);
    if (!current) return;
    const next = transition(current, 'REJECTED');
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? next : a)));
    persist(supabase.from('appointment').update({ status: next.status }).eq('id', appointmentId).eq('business_id', businessId));
  }

  // Cambia el color de marca del negocio actual (T5: se puede cambiar después
  // de crearlo). Filtra por businessId (INVARIANTE 1) igual que el resto de
  // escrituras. Cero cálculos de color aquí: solo se guarda el hex tal cual;
  // `themeCssVars` (theme.ts) es quien deriva la rampa a partir de él.
  function updateBusinessTheme(hex: string): void {
    setBusiness((prev) => (prev ? { ...prev, theme_color: hex } : prev));
    persist(supabase.from('business').update({ theme_color: hex }).eq('id', businessId));
  }

  async function loadReceipt(appointmentId: number): Promise<{ result: ReceiptResult; token: string | null }> {
    let token: string | null = null;
    const fail = (message: string) => ({ result: { ok: false, message } as ReceiptResult, token });
    if (!business) return fail('No se encontró tu negocio.');
    try {
      const { data: issued, error: issueError } = await supabase.rpc('issue_receipt', {
        p_business_id: businessId,
        p_appointment_id: appointmentId,
      });
      if (issueError) return fail(issueError.message);
      const receipt = (issued as { number: number; issued_at: string; public_token: string }[] | null)?.[0];
      if (!receipt) return fail('No se pudo emitir el recibo.');
      token = receipt.public_token;

      // INVARIANTE 1: todo filtrado por negocio, además de la RLS.
      const [apt, lines, pay] = await Promise.all([
        supabase.from('appointment').select('*').eq('business_id', businessId).eq('id', appointmentId),
        supabase
          .from('appointment_service')
          .select('service_id, list_price, discount, charged_price, employee_id')
          .eq('business_id', businessId)
          .eq('appointment_id', appointmentId)
          .order('service_id', { ascending: true }),
        supabase.from('appointment_payment').select('*').eq('business_id', businessId).eq('appointment_id', appointmentId),
      ]);
      const appointment = ((apt.data ?? [])[0] ?? null) as Appointment | null;
      if (apt.error || lines.error || pay.error || !appointment) return fail('No se pudieron cargar los datos del recibo.');

      const result = buildReceiptData({
        business,
        logoUrl: businessLogoUrl,
        appointment,
        lines: (lines.data ?? []) as ReceiptLineInput[],
        services,
        employees,
        payments: (pay.data ?? []) as AppointmentPayment[],
        memberNames,
        receipt,
      });
      return { result, token };
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'No se pudo conectar con el servidor.');
    }
  }

  // Cambia la dirección pública del negocio, vía `set_public_slug` (T3,
  // odd/tasks/editable-public-slug.md). ROMPE A PROPÓSITO el patrón
  // fire-and-forget de `persist()` que usa el resto de este store: ahí el
  // servidor no tiene manera de rechazar la escritura, pero acá sí — otro
  // negocio puede ya tener esa dirección, o el formato puede ser inválido — y
  // la dueña necesita ver el motivo. Actualizar el estado local de forma
  // optimista y revertirlo si el servidor dice que no le mostraría, por un
  // instante, una dirección que nunca llegó a ser suya. Por eso se espera la
  // respuesta y el estado local solo cambia si `set_public_slug` la acepta.
  async function updatePublicSlug(
    slug: string,
  ): Promise<{ ok: true; slug: string } | { ok: false; message: string }> {
    const { data, error } = await supabase.rpc('set_public_slug', {
      p_business_id: businessId,
      p_slug: slug,
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    const newSlug = data as string;
    setBookingPolicyState((prev) => (prev ? { ...prev, public_slug: newSlug } : prev));
    return { ok: true, slug: newSlug };
  }

  // ── Datos del recibo (P4) ─────────────────────────────────────────────────
  // Dirección y teléfono: se valida en el dominio, se espera al servidor y el
  // estado local cambia solo si lo acepta (mismo criterio que `updatePublicSlug`).
  async function updateReceiptProfile(input: { address: string; phone: string }): Promise<SaveResult> {
    const address = validateAddress(input.address);
    if (!address.ok) return { ok: false, message: address.message };
    const phone = validatePhone(input.phone);
    if (!phone.ok) return { ok: false, message: phone.message };
    const { data: rows, error } = await supabase
      .from('business')
      .update({ address: address.value, phone: phone.value })
      .eq('id', businessId)
      .select('id');
    if (error) return { ok: false, message: error.message };
    // RLS descarta en silencio con 0 filas: eso también es un fallo.
    if (!rows || rows.length === 0) return { ok: false, message: 'No se pudo guardar. Intenta de nuevo.' };
    setBusiness((prev) => (prev ? { ...prev, address: address.value, phone: phone.value } : prev));
    return { ok: true };
  }

  async function setMyDisplayName(name: string): Promise<SaveResult> {
    const check = validateDisplayName(name);
    if (!check.ok) return { ok: false, message: check.message };
    const { data: saved, error } = await supabase.rpc('set_my_display_name', {
      p_business_id: businessId,
      p_name: check.value,
    });
    if (error) return { ok: false, message: error.message };
    const value = (saved as string | null) ?? null;
    setMemberNames((prev) => {
      const mine = data.currentUserId;
      if (!mine) return prev;
      const rest = prev.filter((m) => m.user_id !== mine);
      return [...rest, { user_id: mine, display_name: value }];
    });
    return { ok: true };
  }

  async function saveLogoPath(path: string | null): Promise<SaveResult> {
    const { data: rows, error } = await supabase
      .from('business')
      .update({ logo_path: path })
      .eq('id', businessId)
      .select('id');
    if (error) return { ok: false, message: error.message };
    if (!rows || rows.length === 0) return { ok: false, message: 'No se pudo guardar el logo. Intenta de nuevo.' };
    setBusiness((prev) => (prev ? { ...prev, logo_path: path } : prev));
    return { ok: true };
  }

  // Sube a una ruta NUEVA (`upsert: false`, nunca pisa) y luego apunta `logo_path`
  // a ella; el archivo anterior se borra al final, y si no se puede borrar solo
  // queda un huérfano inofensivo (el logo nuevo ya está guardado).
  async function uploadBusinessLogo(file: File): Promise<SaveResult> {
    const check = validateLogoFile(file);
    if (!check.ok) return { ok: false, message: check.message };
    const previous = business?.logo_path ?? null;
    const path = buildLogoPath(businessId, Date.now(), check.ext);
    const up = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    if (up.error) return { ok: false, message: 'No se pudo subir la imagen: ' + up.error.message };
    const saved = await saveLogoPath(path);
    if (!saved.ok) {
      await supabase.storage.from(LOGO_BUCKET).remove([path]);
      return saved;
    }
    if (previous) await supabase.storage.from(LOGO_BUCKET).remove([previous]);
    return { ok: true };
  }

  async function removeBusinessLogo(): Promise<SaveResult> {
    const previous = business?.logo_path ?? null;
    const saved = await saveLogoPath(null);
    if (!saved.ok) return saved;
    if (previous) await supabase.storage.from(LOGO_BUCKET).remove([previous]);
    return { ok: true };
  }

  const logoPath = business?.logo_path ?? null;
  const businessLogoUrl = logoPath ? supabase.storage.from(LOGO_BUCKET).getPublicUrl(logoPath).data.publicUrl : null;

  // Empleadas: mismo patrón que servicios e insumos (estado local + `persist`).
  // No se borran: se dan de baja, porque su nombre sigue en lo ya cobrado.
  function addEmployee(name: string): number {
    const employee: Employee = { id: newId(), business_id: businessId, name, active: true };
    setEmployees((prev) => [...prev, employee]);
    persist(supabase.from('employee').insert(employee));
    return employee.id;
  }

  function patchEmployee(employeeId: number, patch: Partial<Pick<Employee, 'name' | 'active'>>): void {
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, ...patch } : e)));
    persist(supabase.from('employee').update(patch).eq('id', employeeId).eq('business_id', businessId));
  }

  function renameEmployee(employeeId: number, name: string): void {
    patchEmployee(employeeId, { name });
  }

  function setEmployeeActive(employeeId: number, active: boolean): void {
    patchEmployee(employeeId, { active });
  }

  const store: Store = {
    services,
    currentUserId: data.currentUserId,
    memberNames,
    updateReceiptProfile,
    setMyDisplayName,
    uploadBusinessLogo,
    removeBusinessLogo,
    businessLogoUrl,
    employees,
    addEmployee,
    renameEmployee,
    setEmployeeActive,
    appointmentsForDay,
    projectedProfitForDay,
    dayReport,
    completionPreview,
    completionBreakdown,
    scheduleConflict,
    schedule,
    checkServicesEdit: servicesEditCheck,
    updateAppointmentServices,
    reschedule,
    complete,
    payments,
    paymentStatusOf,
    paidOf,
    serviceCredits,
    incomeByMethod: paymentsIncome,
    addPayment,
    cancel,
    markNoShow,
    registerWalkIn,
    suppliesForService,
    allSupplies,
    serviceEconomics,
    addService,
    updateService,
    deleteService,
    setServiceCostOverride,
    addSupplyToService,
    linkExistingSupply,
    unlinkSupply,
    updateSupply,
    weekReport,
    fixedExpenses,
    expensesForMonth,
    monthExpensesTotal,
    addFixedExpense,
    removeFixedExpense,
    copyPreviousMonthExpenses,
    business,
    businessHours,
    timeBlocks,
    bookingPolicy,
    pendingRequests,
    setBusinessHours,
    removeBusinessHours,
    addTimeBlock,
    removeTimeBlock,
    updateBookingPolicy,
    acceptRequest,
    rejectRequest,
    updateBusinessTheme,
    loadReceipt,
    updatePublicSlug,
  };
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error('useStore debe usarse dentro de <StoreProvider>.');
  }
  return store;
}
