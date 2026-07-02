// Store en memoria (Fases 1-3) expuesto como Context de React.
// Es el equivalente a un service inyectable de Angular: una sola instancia que
// varias pantallas comparten. La UI llama a estas funciones y NUNCA toca el array.
// En el Slice 4 cambiamos el cuerpo de estas funciones por llamadas a Supabase
// sin tocar la UI (la fachada `Store` se mantiene igual).
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Appointment, FixedExpense, Service, ServiceSupply, Supply } from '../domain/types';
import { completeAppointment as completeAppointmentDomain, transition } from '../domain/appointments';
import { effectiveCost, profit, suppliesCost } from '../domain/costs';
import { sumFixedExpenses, weekSummary, type WeekSummary } from '../domain/reports';
import { dayRange } from '../format';
import {
  CURRENT_BUSINESS_ID,
  SEED_APPOINTMENTS,
  SEED_FIXED_EXPENSES,
  SEED_SERVICES,
  SEED_SERVICE_SUPPLIES,
  SEED_SUPPLIES,
} from './seed';

// Lo que la UI necesita para agendar. Sin dinero: la cita nace PENDING (INVARIANTE 2).
export interface ScheduleInput {
  service_id: number;
  client: string;
  datetime: string; // ISO 8601
}

// Walk-in: atención al paso que se registra YA completada (crear + completar).
export interface WalkInInput {
  service_id: number;
  client: string;
  datetime: string;
  price?: number; // requerido en la práctica para servicios de precio variable
}

// Vista previa del cobro ANTES de completar (no muta nada): lo que la dueña verá.
export interface CompletionPreview {
  charged_price: number; // centavos
  actual_cost: number; // centavos
  profit: number; // centavos
}

// Datos de un insumo en lenguaje de la dueña (INVARIANTE 4): cuánto pagó por la
// tanda y para cuántas clientas alcanza. Nunca ml/gramos.
export interface SupplyInput {
  name: string;
  purchase_price: number; // centavos
  servings: number; // > 0
}

// Campos editables de un servicio desde la pantalla de configuración.
export interface ServicePatch {
  name?: string;
  price?: number; // centavos
  duration_min?: number;
  variable_price?: boolean;
}

// Números en vivo de la calculadora: costo y margen de un servicio.
export interface ServiceEconomics {
  supply_cost: number; // cache: suma de insumos (centavos)
  effective_cost: number; // override ?? supply_cost (centavos)
  margin: number; // price − effective_cost (centavos)
}

export interface FixedExpenseInput {
  concept: string;
  amount: number; // centavos
}

// La fachada del store: el contrato que consume la UI. Lo permanente del diseño.
export interface Store {
  services: readonly Service[];
  // --- Agenda / citas ---
  appointmentsForDay: (isoDate: string) => Appointment[];
  projectedProfitForDay: (isoDate: string) => number;
  dayReport: (isoDate: string) => WeekSummary;
  completionPreview: (appointmentId: number, overridePrice?: number) => CompletionPreview | null;
  schedule: (input: ScheduleInput) => void;
  complete: (appointmentId: number, overridePrice?: number) => void;
  cancel: (appointmentId: number) => void;
  markNoShow: (appointmentId: number) => void;
  registerWalkIn: (input: WalkInInput) => void;
  // --- Servicios y calculadora ---
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
  // --- Reporte y gastos fijos ---
  weekReport: (from: string, to: string) => WeekSummary;
  fixedExpenses: readonly FixedExpense[];
  fixedExpensesTotal: () => number;
  addFixedExpense: (input: FixedExpenseInput) => void;
  removeFixedExpense: (id: number) => void;
}

// El "token de inyección": empieza en null para detectar el uso fuera del Provider.
const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const businessId = CURRENT_BUSINESS_ID;
  const [services, setServices] = useState<readonly Service[]>(SEED_SERVICES);
  const [supplies, setSupplies] = useState<readonly Supply[]>(SEED_SUPPLIES);
  const [serviceSupplies, setServiceSupplies] = useState<readonly ServiceSupply[]>(SEED_SERVICE_SUPPLIES);
  const [appointments, setAppointments] = useState<readonly Appointment[]>(SEED_APPOINTMENTS);
  const [fixedExpenses, setFixedExpenses] = useState<readonly FixedExpense[]>(SEED_FIXED_EXPENSES);

  // ---------------- Agenda / citas ----------------

  // Citas de un día, ya filtradas por tenant (INVARIANTE 1) y ordenadas por hora.
  function appointmentsForDay(isoDate: string): Appointment[] {
    const dayKey = isoDate.slice(0, 10);
    return appointments
      .filter((a) => a.business_id === businessId)
      .filter((a) => a.datetime.slice(0, 10) === dayKey)
      .sort((a, b) => a.datetime.localeCompare(b.datetime));
  }

  // Ganancia PROYECTADA del día: ganancia potencial de las citas aún abiertas.
  // No es dinero realizado (eso lo da dayReport). La fórmula vive en el dominio.
  function projectedProfitForDay(isoDate: string): number {
    return appointmentsForDay(isoDate)
      .filter((a) => a.status === 'PENDING' || a.status === 'IN_PROGRESS')
      .reduce((sum: number, a) => {
        const service = services.find((s) => s.id === a.service_id);
        if (!service) return sum;
        return sum + profit(service.price, effectiveCost(service));
      }, 0);
  }

  // Resumen REALIZADO de un día (citas ya COMPLETED). Reusa el dominio.
  function dayReport(isoDate: string): WeekSummary {
    const { from, to } = dayRange(isoDate);
    return weekSummary(appointments, businessId, from, to);
  }

  function completionPreview(appointmentId: number, overridePrice?: number): CompletionPreview | null {
    const appointment = appointments.find((a) => a.id === appointmentId);
    if (!appointment) return null;
    const service = services.find((s) => s.id === appointment.service_id);
    if (!service) return null;
    const charged_price = overridePrice ?? service.price;
    const actual_cost = effectiveCost(service);
    return { charged_price, actual_cost, profit: profit(charged_price, actual_cost) };
  }

  function schedule(input: ScheduleInput): void {
    setAppointments((prev) => {
      const nextId = prev.reduce((max, a) => Math.max(max, a.id), 0) + 1;
      const appointment: Appointment = {
        id: nextId,
        business_id: businessId,
        service_id: input.service_id,
        client: input.client,
        datetime: input.datetime,
        status: 'PENDING',
        charged_price: null,
        actual_cost: null,
        profit: null,
      };
      return [...prev, appointment];
    });
  }

  function complete(appointmentId: number, overridePrice?: number): void {
    setAppointments((prev) =>
      prev.map((a) => {
        if (a.id !== appointmentId) return a;
        const service = services.find((s) => s.id === a.service_id);
        if (!service) throw new Error(`Servicio ${a.service_id} no encontrado.`);
        return completeAppointmentDomain(a, service, overridePrice);
      }),
    );
  }

  function cancel(appointmentId: number): void {
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? transition(a, 'CANCELED') : a)));
  }

  function markNoShow(appointmentId: number): void {
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? transition(a, 'NO_SHOW') : a)));
  }

  // Atención al paso: crea la cita y la completa en el acto (congela el dinero).
  function registerWalkIn(input: WalkInInput): void {
    const service = services.find((s) => s.id === input.service_id);
    if (!service) throw new Error(`Servicio ${input.service_id} no encontrado.`);
    setAppointments((prev) => {
      const nextId = prev.reduce((max, a) => Math.max(max, a.id), 0) + 1;
      const pending: Appointment = {
        id: nextId,
        business_id: businessId,
        service_id: input.service_id,
        client: input.client,
        datetime: input.datetime,
        status: 'PENDING',
        charged_price: null,
        actual_cost: null,
        profit: null,
      };
      return [...prev, completeAppointmentDomain(pending, service, input.price)];
    });
  }

  // ---------------- Servicios y calculadora ----------------

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
    return {
      supply_cost: service.supply_cost,
      effective_cost,
      margin: profit(service.price, effective_cost),
    };
  }

  // Recalcula y GUARDA el cache supply_cost de TODOS los servicios a partir de los
  // insumos y enlaces dados (INVARIANTE 6). Se llama solo al tocar insumos/enlaces.
  function recomputeCaches(nextSupplies: readonly Supply[], nextLinks: readonly ServiceSupply[]): void {
    setServices((prev) =>
      prev.map((s) => {
        const linkedIds = nextLinks.filter((l) => l.service_id === s.id).map((l) => l.supply_id);
        const linked = nextSupplies.filter((x) => linkedIds.includes(x.id));
        return { ...s, supply_cost: suppliesCost(linked) };
      }),
    );
  }

  function addService(): number {
    const nextId = services.reduce((max, s) => Math.max(max, s.id), 0) + 1;
    const service: Service = {
      id: nextId,
      business_id: businessId,
      name: 'Nuevo servicio',
      price: 0,
      supply_cost: 0,
      cost_override: null,
      duration_min: 60,
      variable_price: false,
    };
    setServices((prev) => [...prev, service]);
    return nextId;
  }

  function updateService(serviceId: number, patch: ServicePatch): void {
    setServices((prev) => prev.map((s) => (s.id === serviceId ? { ...s, ...patch } : s)));
  }

  // Borra el servicio y sus enlaces a insumos (NO borra los insumos globales,
  // que pueden estar en uso por otros servicios).
  function deleteService(serviceId: number): void {
    setServices((prev) => prev.filter((s) => s.id !== serviceId));
    setServiceSupplies((prev) => prev.filter((l) => l.service_id !== serviceId));
  }

  function setServiceCostOverride(serviceId: number, cents: number | null): void {
    setServices((prev) => prev.map((s) => (s.id === serviceId ? { ...s, cost_override: cents } : s)));
  }

  // Crea un insumo nuevo y lo enlaza al servicio (caso común de la UI).
  function addSupplyToService(serviceId: number, input: SupplyInput): void {
    const nextId = supplies.reduce((max, su) => Math.max(max, su.id), 0) + 1;
    const nextSupplies: readonly Supply[] = [...supplies, { id: nextId, business_id: businessId, ...input }];
    const nextLinks: readonly ServiceSupply[] = [
      ...serviceSupplies,
      { business_id: businessId, service_id: serviceId, supply_id: nextId },
    ];
    setSupplies(nextSupplies);
    setServiceSupplies(nextLinks);
    recomputeCaches(nextSupplies, nextLinks);
  }

  // Enlaza un insumo YA existente a otro servicio (insumo compartido).
  function linkExistingSupply(serviceId: number, supplyId: number): void {
    const exists = serviceSupplies.some((l) => l.service_id === serviceId && l.supply_id === supplyId);
    if (exists) return;
    const nextLinks: readonly ServiceSupply[] = [
      ...serviceSupplies,
      { business_id: businessId, service_id: serviceId, supply_id: supplyId },
    ];
    setServiceSupplies(nextLinks);
    recomputeCaches(supplies, nextLinks);
  }

  // Quita el insumo de ESTE servicio (no lo borra globalmente).
  function unlinkSupply(serviceId: number, supplyId: number): void {
    const nextLinks = serviceSupplies.filter((l) => !(l.service_id === serviceId && l.supply_id === supplyId));
    setServiceSupplies(nextLinks);
    recomputeCaches(supplies, nextLinks);
  }

  // Edita un insumo. Recalcula el cache de TODOS los servicios que lo usan.
  function updateSupply(supplyId: number, patch: Partial<SupplyInput>): void {
    const nextSupplies = supplies.map((su) => (su.id === supplyId ? { ...su, ...patch } : su));
    setSupplies(nextSupplies);
    recomputeCaches(nextSupplies, serviceSupplies);
  }

  // ---------------- Reporte y gastos fijos ----------------

  function weekReport(from: string, to: string): WeekSummary {
    return weekSummary(appointments, businessId, from, to);
  }

  function fixedExpensesTotal(): number {
    return sumFixedExpenses(fixedExpenses, businessId);
  }

  function addFixedExpense(input: FixedExpenseInput): void {
    setFixedExpenses((prev) => {
      const nextId = prev.reduce((max, e) => Math.max(max, e.id), 0) + 1;
      return [...prev, { id: nextId, business_id: businessId, concept: input.concept, amount: input.amount, period: 'MONTHLY' }];
    });
  }

  function removeFixedExpense(id: number): void {
    setFixedExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  const store: Store = {
    services,
    appointmentsForDay,
    projectedProfitForDay,
    dayReport,
    completionPreview,
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

// El "constructor(private store: StoreService)" de React: cómo una pantalla pide el store.
export function useStore(): Store {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error('useStore debe usarse dentro de <StoreProvider>.');
  }
  return store;
}
