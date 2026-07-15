// Contrato de datos — fuente de verdad (PLAN.md §3.1, traducido a inglés).
// No inventar otras formas. El dinero SIEMPRE en centavos enteros.

// NO_SHOW: la clienta no llegó. Se distingue de CANCELED para reportes
// (cancelar es una decisión; no presentarse es un incumplimiento).
export type AppointmentStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';

export interface Business {
  id: number; // el tenant. MVP: siempre 1
  name: string;
  plan: string;
}

// Insumo GLOBAL del negocio (INVARIANTE 1). Un mismo insumo (wipes, pegamento…)
// puede usarse en varios servicios → la relación vive en ServiceSupply (N↔N).
export interface Supply {
  id: number;
  business_id: number;
  name: string;
  purchase_price: number; // centavos. Lo que la dueña pagó por la "tanda"
  servings: number; // para cuántas clientas alcanza esa tanda (>0)
}

// Relación N↔N entre servicios e insumos. Editar un insumo compartido recalcula
// el cache supply_cost de TODOS los servicios que lo usan (INVARIANTE 6).
export interface ServiceSupply {
  business_id: number; // INVARIANTE 1
  service_id: number;
  supply_id: number;
}

export interface Service {
  id: number;
  business_id: number; // INVARIANTE 1
  name: string;
  price: number; // centavos. Precio de venta (0 o referencia si variable_price)
  supply_cost: number; // centavos. CACHE: suma de costos unitarios (INVARIANTE 6)
  cost_override: number | null; // si no es null, reemplaza a supply_cost
  duration_min: number;
  // Si true, el precio no es fijo (trenzas, maquillaje…): la UI PIDE el precio en
  // la cita en vez de heredarlo del servicio. El dinero igual se congela al COMPLETAR.
  variable_price: boolean;
}

export interface Appointment {
  id: number;
  business_id: number; // INVARIANTE 1
  service_id: number;
  client: string;
  datetime: string; // ISO 8601
  status: AppointmentStatus;
  // Datos operativos capturados al AGENDAR (no son el resultado congelado):
  quoted_price: number | null; // precio acordado (útil en servicios de precio variable)
  deposit: number | null; // abono/adelanto pagado por la clienta al reservar
  // CONGELADOS al completar (INVARIANTE 2). null mientras no esté COMPLETED:
  charged_price: number | null;
  actual_cost: number | null;
  profit: number | null;
}

// Gasto fijo del negocio (luz, agua, transporte…) NO atribuible a una cita.
// Se resta a nivel de REPORTE para pasar de ganancia bruta a neta (no toca la
// inmutabilidad por cita, INVARIANTE 2).
export type ExpensePeriod = 'MONTHLY';

export interface FixedExpense {
  id: number;
  business_id: number; // INVARIANTE 1
  concept: string;
  amount: number; // centavos
  month: string; // 'YYYY-MM' al que corresponde (permite montos distintos por mes)
  period: ExpensePeriod;
}
