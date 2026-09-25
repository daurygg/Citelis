// Contrato de datos — fuente de verdad (PLAN.md §3.1, traducido a inglés).
// No inventar otras formas. El dinero SIEMPRE en centavos enteros.

// NO_SHOW: la clienta no llegó. Se distingue de CANCELED para reportes
// (cancelar es una decisión; no presentarse es un incumplimiento).
// REQUESTED: la clienta pidió el horario desde el portal público y la dueña
// todavía no respondió. REJECTED: la dueña rechazó la solicitud. Se distingue
// de CANCELED porque "cuántas solicitudes rechacé" y "cuántas citas canceló
// la clienta" son hechos de negocio distintos (Slice B de self-booking, D1).
export type AppointmentStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELED'
  | 'NO_SHOW'
  | 'REQUESTED'
  | 'REJECTED';

export interface Business {
  id: number; // el tenant. MVP: siempre 1
  name: string;
  plan: string;
  // Color de marca en hex (decisión T5, odd/tasks/business-theming.md). Opcional
  // porque los negocios creados antes de este slice todavía no traen la columna.
  theme_color?: string;
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

// De dónde salió la cita: la registró la dueña, o la pidió la clienta sola desde
// el portal público.
export type AppointmentSource = 'OWNER' | 'SELF';

export interface Appointment {
  id: number;
  business_id: number; // INVARIANTE 1
  service_id: number;
  client: string;
  // Solo en citas nacidas del portal público. Opcionales porque las citas que la
  // dueña registró antes de esta función no los traen.
  client_phone?: string | null;
  source?: AppointmentSource;
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

// Horario de atención del negocio, por día de la semana. Puede haber varias
// filas para el mismo weekday (ej. mañana y tarde, separadas por almuerzo).
export interface BusinessHours {
  id: number;
  business_id: number; // INVARIANTE 1
  weekday: number; // 0 = domingo … 6 = sábado (igual que Date.getDay())
  opens_at: string; // 'HH:MM' hora local del negocio
  closes_at: string; // 'HH:MM'
}

// Tramo puntual en el que el negocio NO atiende (vacaciones, almuerzo, asunto personal).
export interface TimeBlock {
  id: number;
  business_id: number; // INVARIANTE 1
  starts_at: string; // ISO local 'YYYY-MM-DDTHH:MM'
  ends_at: string; // ISO local 'YYYY-MM-DDTHH:MM'
  reason: string;
}

// Reglas de reserva pública del negocio (INVARIANTE 1: una por negocio).
export interface BookingPolicy {
  business_id: number; // INVARIANTE 1
  slot_step_min: number; // granularidad de las horas ofrecidas
  buffer_min: number; // descanso obligatorio a ambos lados de cada cita
  min_notice_hours: number; // anticipación mínima para reservar
  max_horizon_days: number; // hasta cuántos días en el futuro se puede reservar
}

// Hueco de tiempo ofrecido a la clienta para reservar (dominio puro, sin id: no persiste).
// Fila completa de `booking_policy`. `BookingPolicy` son las reglas que necesita el
// cálculo puro de slots; estos tres campos son administración del portal (dónde vive,
// si está abierto, cuánto spam se tolera) y no entran en la matemática de
// disponibilidad, por eso viven en un tipo aparte.
export interface BookingPolicyRow extends BookingPolicy {
  public_slug: string;
  enabled: boolean;
  max_requests_per_phone_per_day: number;
}

export interface Slot {
  start: string; // ISO local 'YYYY-MM-DDTHH:MM'
  end: string; // ISO local 'YYYY-MM-DDTHH:MM'
}
