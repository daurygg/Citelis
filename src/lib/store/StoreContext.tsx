// Store en memoria (Fases 1-3) expuesto como Context de React.
// Es el equivalente a un service inyectable de Angular: una sola instancia que
// varias pantallas comparten. La UI llama a estas funciones y NUNCA toca el array.
// En el Slice 4 cambiamos el cuerpo de estas funciones por llamadas a Supabase
// sin tocar la UI (la fachada `Store` se mantiene igual).
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Appointment, Service, Supply } from '../domain/types';
import { completeAppointment as completeAppointmentDomain } from '../domain/appointments';
import { effectiveCost, profit, suppliesCost } from '../domain/costs';
import { weekSummary, type WeekSummary } from '../domain/reports';
import { CURRENT_BUSINESS_ID, SEED_APPOINTMENTS, SEED_SERVICES, SEED_SUPPLIES } from './seed';

// Lo que la UI necesita para agendar. Sin dinero: la cita nace PENDING (INVARIANTE 2).
export interface ScheduleInput {
  service_id: number;
  client: string;
  datetime: string; // ISO 8601
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
}

// Números en vivo de la calculadora: costo y margen de un servicio.
export interface ServiceEconomics {
  supply_cost: number; // cache: suma de insumos (centavos)
  effective_cost: number; // override ?? supply_cost (centavos)
  margin: number; // price − effective_cost (centavos)
}

// La fachada del store: el contrato que consume la UI. Lo permanente del diseño.
export interface Store {
  services: readonly Service[];
  appointmentsForDay: (isoDate: string) => Appointment[];
  projectedProfitForDay: (isoDate: string) => number;
  completionPreview: (appointmentId: number, overridePrice?: number) => CompletionPreview | null;
  schedule: (input: ScheduleInput) => void;
  complete: (appointmentId: number, overridePrice?: number) => void;
  // --- Slice 2: calculadora "por tandas" ---
  suppliesForService: (serviceId: number) => Supply[];
  serviceEconomics: (serviceId: number) => ServiceEconomics | null;
  addService: () => number; // crea un servicio vacío y devuelve su id (para editarlo)
  addSupply: (serviceId: number, input: SupplyInput) => void;
  updateSupply: (supplyId: number, patch: Partial<SupplyInput>) => void;
  removeSupply: (supplyId: number) => void;
  updateService: (serviceId: number, patch: ServicePatch) => void;
  deleteService: (serviceId: number) => void;
  setServiceCostOverride: (serviceId: number, cents: number | null) => void;
  // --- Slice 3: reporte de ganancias ---
  weekReport: (from: string, to: string) => WeekSummary;
}

// El "token de inyección": empieza en null para detectar el uso fuera del Provider.
const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const businessId = CURRENT_BUSINESS_ID;
  const [services, setServices] = useState<readonly Service[]>(SEED_SERVICES);
  const [supplies, setSupplies] = useState<readonly Supply[]>(SEED_SUPPLIES);
  const [appointments, setAppointments] = useState<readonly Appointment[]>(SEED_APPOINTMENTS);

  // Citas de un día, ya filtradas por tenant (INVARIANTE 1) y ordenadas por hora.
  function appointmentsForDay(isoDate: string): Appointment[] {
    const dayKey = isoDate.slice(0, 10); // 'YYYY-MM-DD'
    return appointments
      .filter((a) => a.business_id === businessId)
      .filter((a) => a.datetime.slice(0, 10) === dayKey)
      .sort((a, b) => a.datetime.localeCompare(b.datetime));
  }

  // Ganancia PROYECTADA del día: suma de la ganancia potencial de las citas aún
  // abiertas (PENDING/IN_PROGRESS). No es dinero realizado; las completadas no cuentan
  // aquí (esas ya están congeladas y van al reporte real del Slice 3).
  // La fórmula de dinero (profit/effectiveCost) vive en el dominio (INVARIANTE 5).
  function projectedProfitForDay(isoDate: string): number {
    return appointmentsForDay(isoDate)
      .filter((a) => a.status === 'PENDING' || a.status === 'IN_PROGRESS')
      .reduce((sum: number, a) => {
        const service = services.find((s) => s.id === a.service_id);
        if (!service) return sum;
        return sum + profit(service.price, effectiveCost(service));
      }, 0);
  }

  // Vista previa del cobro de una cita SIN mutarla: calcula lo que se congelaría
  // si se completara ahora (con un override opcional de precio). Delega en el dominio.
  function completionPreview(appointmentId: number, overridePrice?: number): CompletionPreview | null {
    const appointment = appointments.find((a: Appointment) => a.id === appointmentId);
    if (!appointment) return null;
    const service = services.find((s: Service) => s.id === appointment.service_id);
    if (!service) return null;
    const charged_price = overridePrice ?? service.price;
    const actual_cost = effectiveCost(service);
    return { charged_price, actual_cost, profit: profit(charged_price, actual_cost) };
  }

  // Crea una cita PENDING. Los tres campos de dinero nacen en null (INVARIANTE 2).
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

  // Completa una cita delegando en el dominio puro, que congela el dinero.
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

  // --- Slice 2: calculadora "por tandas" ---

  // Insumos de un servicio (INVARIANTE 1: solo del tenant, vía el servicio).
  function suppliesForService(serviceId: number): Supply[] {
    return supplies.filter((su: Supply) => su.service_id === serviceId);
  }

  // Costo y margen en vivo. Reusa el dominio: margin = profit(price, effectiveCost).
  function serviceEconomics(serviceId: number): ServiceEconomics | null {
    const service = services.find((s: Service) => s.id === serviceId);
    if (!service) return null;
    const effective_cost = effectiveCost(service);
    return {
      supply_cost: service.supply_cost,
      effective_cost,
      margin: profit(service.price, effective_cost),
    };
  }

  // Recalcula y GUARDA el cache supply_cost de un servicio (INVARIANTE 6).
  // Se llama SOLO al tocar un insumo, nunca en cada render.
  function recomputeServiceCache(serviceId: number, nextSupplies: readonly Supply[]): void {
    const cost = suppliesCost(nextSupplies.filter((su: Supply) => su.service_id === serviceId));
    setServices((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, supply_cost: cost } : s)),
    );
  }

  function addSupply(serviceId: number, input: SupplyInput): void {
    const nextId = supplies.reduce((max: number, su: Supply) => Math.max(max, su.id), 0) + 1;
    const next: readonly Supply[] = [...supplies, { id: nextId, service_id: serviceId, ...input }];
    setSupplies(next);
    recomputeServiceCache(serviceId, next);
  }

  function updateSupply(supplyId: number, patch: Partial<SupplyInput>): void {
    const next = supplies.map((su) => (su.id === supplyId ? { ...su, ...patch } : su));
    setSupplies(next);
    const target = next.find((su) => su.id === supplyId);
    if (target) recomputeServiceCache(target.service_id, next);
  }

  function removeSupply(supplyId: number): void {
    const target = supplies.find((su: Supply) => su.id === supplyId);
    const next = supplies.filter((su) => su.id !== supplyId);
    setSupplies(next);
    if (target) recomputeServiceCache(target.service_id, next);
  }

  function updateService(serviceId: number, patch: ServicePatch): void {
    setServices((prev) => prev.map((s) => (s.id === serviceId ? { ...s, ...patch } : s)));
  }

  // Crea un servicio vacío (sin insumos) y devuelve su id para abrirlo en el editor.
  function addService(): number {
    const nextId = services.reduce((max: number, s: Service) => Math.max(max, s.id), 0) + 1;
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
  
  function deleteService(serviceId: number): void {
    setServices((prev) => prev.filter((s) => s.id !== serviceId));
    setSupplies((prev) => prev.filter((s) => s.service_id !== serviceId));
  }

  // El override manual gana sobre el cache (INVARIANTE 6). null = volver al cache.
  function setServiceCostOverride(serviceId: number, cents: number | null): void {
    setServices((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, cost_override: cents } : s)),
    );
  }

  // --- Slice 3: reporte de ganancias ---

  // Resumen del periodo [from, to). Solo lectura: agrega valores ya congelados de
  // citas COMPLETED. El business_id sale del store (INVARIANTE 1), no de la UI.
  function weekReport(from: string, to: string): WeekSummary {
    return weekSummary(appointments, businessId, from, to);
  }

  const store: Store = {
    services,
    appointmentsForDay,
    projectedProfitForDay,
    completionPreview,
    schedule,
    complete,
    suppliesForService,
    serviceEconomics,
    addService,
    addSupply,
    updateSupply,
    removeSupply,
    updateService,
    deleteService,
    setServiceCostOverride,
    weekReport,
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
