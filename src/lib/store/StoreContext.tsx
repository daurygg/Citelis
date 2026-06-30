// Store en memoria (Fases 1-3) expuesto como Context de React.
// Es el equivalente a un service inyectable de Angular: una sola instancia que
// varias pantallas comparten. La UI llama a estas funciones y NUNCA toca el array.
// En el Slice 4 cambiamos el cuerpo de estas funciones por llamadas a Supabase
// sin tocar la UI (la fachada `Store` se mantiene igual).
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Appointment, Service } from '../domain/types';
import { completeAppointment as completeAppointmentDomain } from '../domain/appointments';
import { effectiveCost, profit } from '../domain/costs';
import { CURRENT_BUSINESS_ID, SEED_APPOINTMENTS, SEED_SERVICES } from './seed';

// Lo que la UI necesita para agendar. Sin dinero: la cita nace PENDING (INVARIANTE 2).
export interface ScheduleInput {
  service_id: number;
  client: string;
  datetime: string; // ISO 8601
}

// La fachada del store: el contrato que consume la UI. Lo permanente del diseño.
export interface Store {
  services: readonly Service[];
  appointmentsForDay: (isoDate: string) => Appointment[];
  projectedProfitForDay: (isoDate: string) => number;
  schedule: (input: ScheduleInput) => void;
  complete: (appointmentId: number, overridePrice?: number) => void;
}

// El "token de inyección": empieza en null para detectar el uso fuera del Provider.
const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const businessId = CURRENT_BUSINESS_ID;
  const [services] = useState<readonly Service[]>(SEED_SERVICES);
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

  const store: Store = { services, appointmentsForDay, projectedProfitForDay, schedule, complete };
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
