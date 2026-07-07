// Store respaldado por Supabase (Slice 4), con la MISMA fachada síncrona que
// usaban las Fases 1-3 (para no reescribir la UI). Al montar carga los datos del
// negocio; cada cambio actualiza el estado local (optimista) y se persiste por
// detrás (write-through). Los cálculos siguen en el dominio puro (INVARIANTE 5).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Appointment, FixedExpense, Service, ServiceSupply, Supply } from '../domain/types';
import { completeAppointment as completeAppointmentDomain, transition } from '../domain/appointments';
import { findScheduleConflict } from '../domain/scheduling';
import { effectiveCost, profit, suppliesCost } from '../domain/costs';
import { expectedProfit, sumFixedExpenses, weekSummary, type WeekSummary } from '../domain/reports';
import { dayRange } from '../format';
import { supabase } from '../supabase/client';
import { useAuth } from '../auth/AuthContext';
import { Onboarding } from '../../components/Onboarding';

// ── Tipos de la fachada (idénticos a las fases en memoria) ──────────────────
export interface ScheduleInput {
  service_id: number;
  client: string;
  datetime: string;
  quoted_price?: number; // precio acordado (servicios variables), opcional
  deposit?: number; // abono/adelanto pagado al reservar, opcional
}
export interface WalkInInput {
  service_id: number;
  client: string;
  datetime: string;
  price?: number;
}
export interface CompletionPreview {
  charged_price: number;
  actual_cost: number;
  profit: number;
}
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
}

export interface Store {
  services: readonly Service[];
  appointmentsForDay: (isoDate: string) => Appointment[];
  projectedProfitForDay: (isoDate: string) => number;
  dayReport: (isoDate: string) => WeekSummary;
  completionPreview: (appointmentId: number, overridePrice?: number) => CompletionPreview | null;
  scheduleConflict: (datetime: string, serviceId: number) => Appointment | null;
  schedule: (input: ScheduleInput) => void;
  complete: (appointmentId: number, overridePrice?: number) => void;
  cancel: (appointmentId: number) => void;
  markNoShow: (appointmentId: number) => void;
  registerWalkIn: (input: WalkInInput) => void;
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
  fixedExpensesTotal: () => number;
  addFixedExpense: (input: FixedExpenseInput) => void;
  removeFixedExpense: (id: number) => void;
}

const StoreContext = createContext<Store | null>(null);

// Id numérico único generado en el cliente (conserva la fachada síncrona).
function newId(): number {
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
  services: Service[];
  supplies: Supply[];
  serviceSupplies: ServiceSupply[];
  appointments: Appointment[];
  fixedExpenses: FixedExpense[];
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
      const { data: members, error: mErr } = await supabase
        .from('business_member')
        .select('business_id')
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
      const [svc, sup, ss, apt, fx] = await Promise.all([
        supabase.from('service').select('*'),
        supabase.from('supply').select('*'),
        supabase.from('service_supply').select('*'),
        supabase.from('appointment').select('*'),
        supabase.from('fixed_expense').select('*'),
      ]);
      if (!active) return;
      setData({
        businessId,
        services: (svc.data ?? []) as Service[],
        supplies: (sup.data ?? []) as Supply[],
        serviceSupplies: (ss.data ?? []) as ServiceSupply[],
        appointments: (apt.data ?? []) as Appointment[],
        fixedExpenses: (fx.data ?? []) as FixedExpense[],
      });
    })();
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-50 px-6 text-center">
        <div>
          <p className="mb-4 text-neutral-700">{error}</p>
          <button type="button" className="text-sm text-rose-700 hover:underline" onClick={() => signOut()}>
            Salir
          </button>
        </div>
      </div>
    );
  }
  if (noBusiness) return <Onboarding />;
  if (!data) {
    return <div className="grid min-h-screen place-items-center bg-neutral-50 text-neutral-500">Cargando tus datos…</div>;
  }
  return <StoreReady data={data}>{children}</StoreReady>;
}

function StoreReady({ data, children }: { data: LoadedData; children: ReactNode }) {
  const businessId = data.businessId;
  const [services, setServices] = useState<readonly Service[]>(data.services);
  const [supplies, setSupplies] = useState<readonly Supply[]>(data.supplies);
  const [serviceSupplies, setServiceSupplies] = useState<readonly ServiceSupply[]>(data.serviceSupplies);
  const [appointments, setAppointments] = useState<readonly Appointment[]>(data.appointments);
  const [fixedExpenses, setFixedExpenses] = useState<readonly FixedExpense[]>(data.fixedExpenses);

  // ── Lecturas (puras, sobre el estado ya cargado) ──────────────────────────
  function appointmentsForDay(isoDate: string): Appointment[] {
    const dayKey = isoDate.slice(0, 10);
    return appointments
      .filter((a) => a.business_id === businessId)
      .filter((a) => a.datetime.slice(0, 10) === dayKey)
      .sort((a, b) => a.datetime.localeCompare(b.datetime));
  }

  function projectedProfitForDay(isoDate: string): number {
    return appointmentsForDay(isoDate)
      .filter((a) => a.status === 'PENDING' || a.status === 'IN_PROGRESS')
      .reduce((sum: number, a) => {
        const service = services.find((s) => s.id === a.service_id);
        if (!service) return sum;
        // Usa el precio acordado si lo hay; ignora precios desconocidos (null).
        const expected = expectedProfit(a, service);
        return expected === null ? sum : sum + expected;
      }, 0);
  }

  function dayReport(isoDate: string): WeekSummary {
    const { from, to } = dayRange(isoDate);
    return weekSummary(appointments, businessId, from, to);
  }

  function completionPreview(appointmentId: number, overridePrice?: number): CompletionPreview | null {
    const appointment = appointments.find((a) => a.id === appointmentId);
    if (!appointment) return null;
    const service = services.find((s) => s.id === appointment.service_id);
    if (!service) return null;
    const charged_price = overridePrice ?? appointment.quoted_price ?? service.price;
    const actual_cost = effectiveCost(service);
    return { charged_price, actual_cost, profit: profit(charged_price, actual_cost) };
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
    return weekSummary(appointments, businessId, from, to);
  }

  function fixedExpensesTotal(): number {
    return sumFixedExpenses(fixedExpenses, businessId);
  }

  // ── Escrituras (estado local + persistencia) ──────────────────────────────
  // Devuelve una cita que choca con el horario propuesto, o null si está libre.
  function scheduleConflict(datetime: string, serviceId: number): Appointment | null {
    const scoped = appointments.filter((a) => a.business_id === businessId);
    return findScheduleConflict({ datetime, service_id: serviceId }, scoped, services);
  }

  function schedule(input: ScheduleInput): void {
    const appointment: Appointment = {
      id: newId(),
      business_id: businessId,
      service_id: input.service_id,
      client: input.client,
      datetime: input.datetime,
      status: 'PENDING',
      quoted_price: input.quoted_price ?? null,
      deposit: input.deposit ?? null,
      charged_price: null,
      actual_cost: null,
      profit: null,
    };
    setAppointments((prev) => [...prev, appointment]);
    persist(supabase.from('appointment').insert(appointment));
  }

  function complete(appointmentId: number, overridePrice?: number): void {
    const current = appointments.find((a) => a.id === appointmentId);
    if (!current) return;
    const service = services.find((s) => s.id === current.service_id);
    if (!service) throw new Error(`Servicio ${current.service_id} no encontrado.`);
    const done = completeAppointmentDomain(current, service, overridePrice);
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? done : a)));
    persist(
      supabase
        .from('appointment')
        .update({ status: done.status, charged_price: done.charged_price, actual_cost: done.actual_cost, profit: done.profit })
        .eq('id', appointmentId),
    );
  }

  function cancel(appointmentId: number): void {
    const current = appointments.find((a) => a.id === appointmentId);
    if (!current) return;
    const next = transition(current, 'CANCELED');
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? next : a)));
    persist(supabase.from('appointment').update({ status: next.status }).eq('id', appointmentId));
  }

  function markNoShow(appointmentId: number): void {
    const current = appointments.find((a) => a.id === appointmentId);
    if (!current) return;
    const next = transition(current, 'NO_SHOW');
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? next : a)));
    persist(supabase.from('appointment').update({ status: next.status }).eq('id', appointmentId));
  }

  function registerWalkIn(input: WalkInInput): void {
    const service = services.find((s) => s.id === input.service_id);
    if (!service) throw new Error(`Servicio ${input.service_id} no encontrado.`);
    const pending: Appointment = {
      id: newId(),
      business_id: businessId,
      service_id: input.service_id,
      client: input.client,
      datetime: input.datetime,
      status: 'PENDING',
      quoted_price: null,
      deposit: null,
      charged_price: null,
      actual_cost: null,
      profit: null,
    };
    const done = completeAppointmentDomain(pending, service, input.price);
    setAppointments((prev) => [...prev, done]);
    persist(supabase.from('appointment').insert(done));
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
        persist(supabase.from('service').update({ supply_cost: cost }).eq('id', service.id));
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
    persist(supabase.from('service').update(patch).eq('id', serviceId));
  }

  function deleteService(serviceId: number): void {
    setServices((prev) => prev.filter((s) => s.id !== serviceId));
    setServiceSupplies((prev) => prev.filter((l) => l.service_id !== serviceId));
    // La FK service_supply.service_id tiene ON DELETE CASCADE → borra los enlaces.
    persist(supabase.from('service').delete().eq('id', serviceId));
  }

  function setServiceCostOverride(serviceId: number, cents: number | null): void {
    setServices((prev) => prev.map((s) => (s.id === serviceId ? { ...s, cost_override: cents } : s)));
    persist(supabase.from('service').update({ cost_override: cents }).eq('id', serviceId));
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
    persist(supabase.from('service_supply').delete().eq('service_id', serviceId).eq('supply_id', supplyId));
    recomputeCaches(supplies, nextLinks);
  }

  function updateSupply(supplyId: number, patch: Partial<SupplyInput>): void {
    const nextSupplies = supplies.map((su) => (su.id === supplyId ? { ...su, ...patch } : su));
    setSupplies(nextSupplies);
    persist(supabase.from('supply').update(patch).eq('id', supplyId));
    recomputeCaches(nextSupplies, serviceSupplies);
  }

  function addFixedExpense(input: FixedExpenseInput): void {
    const expense: FixedExpense = { id: newId(), business_id: businessId, concept: input.concept, amount: input.amount, period: 'MONTHLY' };
    setFixedExpenses((prev) => [...prev, expense]);
    persist(supabase.from('fixed_expense').insert(expense));
  }

  function removeFixedExpense(id: number): void {
    setFixedExpenses((prev) => prev.filter((e) => e.id !== id));
    persist(supabase.from('fixed_expense').delete().eq('id', id));
  }

  const store: Store = {
    services,
    appointmentsForDay,
    projectedProfitForDay,
    dayReport,
    completionPreview,
    scheduleConflict,
    schedule,
    complete,
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
    fixedExpensesTotal,
    addFixedExpense,
    removeFixedExpense,
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
