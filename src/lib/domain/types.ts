// Contrato de datos — fuente de verdad (PLAN.md §3.1, traducido a inglés).
// No inventar otras formas. El dinero SIEMPRE en centavos enteros.

export type AppointmentStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';

export interface Business {
  id: number; // el tenant. MVP: siempre 1
  name: string;
  plan: string;
}

export interface Supply {
  id: number;
  service_id: number;
  name: string;
  purchase_price: number; // centavos. Lo que la dueña pagó por la "tanda"
  servings: number; // para cuántas clientas alcanza esa tanda (>0)
}

export interface Service {
  id: number;
  business_id: number; // INVARIANTE 1
  name: string;
  price: number; // centavos. Precio de venta al cliente
  supply_cost: number; // centavos. CACHE: suma de costos unitarios (INVARIANTE 6)
  cost_override: number | null; // si no es null, reemplaza a supply_cost
  duration_min: number;
}

export interface Appointment {
  id: number;
  business_id: number; // INVARIANTE 1
  service_id: number;
  client: string;
  datetime: string; // ISO 8601
  status: AppointmentStatus;
  // CONGELADOS al completar (INVARIANTE 2). null mientras no esté COMPLETED:
  charged_price: number | null;
  actual_cost: number | null;
  profit: number | null;
}
