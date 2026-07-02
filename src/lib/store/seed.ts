// Datos semilla para las Fases 1-3 (en memoria). En el Slice 4 esto lo reemplaza
// la base de datos. Dinero SIEMPRE en centavos enteros (montos reales ×100).
// Basado en docs/respuesta-duena.md (datos reales de Roelis).
import type { Appointment, FixedExpense, Service, ServiceSupply, Supply } from '../domain/types';
import { suppliesCost } from '../domain/costs';

// El tenant del MVP. INVARIANTE 1: la columna/el filtro existen desde el día uno.
export const CURRENT_BUSINESS_ID = 1;
const B = CURRENT_BUSINESS_ID;

// Insumos GLOBALES del negocio. Algunos se comparten entre servicios (wipes,
// pegamento, envases). Rendimientos marcados con ⚠️ en el doc están por confirmar.
export const SEED_SUPPLIES: readonly Supply[] = [
  { id: 1, business_id: B, name: 'Pigmento de cejas', purchase_price: 195000, servings: 10 },
  { id: 2, business_id: B, name: 'Agujas', purchase_price: 120000, servings: 20 },
  { id: 3, business_id: B, name: 'Anestesia', purchase_price: 195000, servings: 20 },
  { id: 4, business_id: B, name: 'Anestesia TKTX', purchase_price: 90000, servings: 15 },
  { id: 5, business_id: B, name: 'Guantes', purchase_price: 40000, servings: 50 },
  { id: 6, business_id: B, name: 'Wipes', purchase_price: 8000, servings: 40 }, // compartido
  { id: 7, business_id: B, name: 'Cepillitos', purchase_price: 15000, servings: 20 },
  { id: 8, business_id: B, name: 'Envases', purchase_price: 10000, servings: 125 }, // compartido
  { id: 9, business_id: B, name: 'Tinte', purchase_price: 60000, servings: 45 },
  { id: 10, business_id: B, name: 'Gillette', purchase_price: 5000, servings: 10 },
  { id: 11, business_id: B, name: 'Pestañas por grupito', purchase_price: 50000, servings: 17 },
  { id: 12, business_id: B, name: 'Pestañas corridas', purchase_price: 4200, servings: 1 },
  { id: 13, business_id: B, name: 'Pegamento', purchase_price: 22500, servings: 7 }, // compartido
  { id: 14, business_id: B, name: 'Espuma', purchase_price: 14000, servings: 10 },
  { id: 15, business_id: B, name: 'Cera', purchase_price: 350000, servings: 25 },
  { id: 16, business_id: B, name: 'Spray fijador', purchase_price: 30000, servings: 15 },
  { id: 17, business_id: B, name: 'Base de maquillaje', purchase_price: 100000, servings: 30 },
  { id: 18, business_id: B, name: 'Fijador', purchase_price: 80000, servings: 50 },
  { id: 19, business_id: B, name: 'Pelo', purchase_price: 7500, servings: 1 },
];

// Enlaces servicio↔insumo (N↔N). Los insumos 6/8/13 aparecen en varios servicios.
export const SEED_SERVICE_SUPPLIES: readonly ServiceSupply[] = [
  // 1 Micropigmentación de cejas
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((supply_id) => ({ business_id: B, service_id: 1, supply_id })),
  // 2 Micropigmentación de labios
  ...[2, 3, 4, 5, 6, 8].map((supply_id) => ({ business_id: B, service_id: 2, supply_id })),
  // 3 Combo cejas + labios (usa los insumos de ambos procedimientos)
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((supply_id) => ({ business_id: B, service_id: 3, supply_id })),
  // 4 Maquillaje
  ...[17, 18, 16].map((supply_id) => ({ business_id: B, service_id: 4, supply_id })),
  // 5 Trenzas
  ...[19, 14].map((supply_id) => ({ business_id: B, service_id: 5, supply_id })),
  // 6 Colas
  ...[19].map((supply_id) => ({ business_id: B, service_id: 6, supply_id })),
  // 7 Ondas
  ...[14, 16].map((supply_id) => ({ business_id: B, service_id: 7, supply_id })),
  // 8 Tintado
  ...[9, 5, 6].map((supply_id) => ({ business_id: B, service_id: 8, supply_id })),
  // 9 Cejas con gel
  ...[15, 7].map((supply_id) => ({ business_id: B, service_id: 9, supply_id })),
  // 10 Pestañas por grupito
  ...[11, 13, 6].map((supply_id) => ({ business_id: B, service_id: 10, supply_id })),
  // 11 Pestañas corridas
  ...[12, 13].map((supply_id) => ({ business_id: B, service_id: 11, supply_id })),
];

// Cache supply_cost de un servicio = Σ costo unitario de sus insumos enlazados.
function cacheFor(serviceId: number): number {
  const ids = SEED_SERVICE_SUPPLIES.filter((l) => l.service_id === serviceId).map((l) => l.supply_id);
  return suppliesCost(SEED_SUPPLIES.filter((s) => ids.includes(s.id)));
}

// Servicios reales. Los de precio variable (maquillaje, trenzas, colas) nacen con
// price 0: la UI pedirá el precio en cada cita.
export const SEED_SERVICES: readonly Service[] = [
  { id: 1, business_id: B, name: 'Micropigmentación de cejas', price: 600000, supply_cost: cacheFor(1), cost_override: null, duration_min: 120, variable_price: false },
  { id: 2, business_id: B, name: 'Micropigmentación de labios', price: 550000, supply_cost: cacheFor(2), cost_override: null, duration_min: 120, variable_price: false },
  { id: 3, business_id: B, name: 'Combo cejas + labios', price: 1000000, supply_cost: cacheFor(3), cost_override: null, duration_min: 240, variable_price: false },
  { id: 4, business_id: B, name: 'Maquillaje', price: 0, supply_cost: cacheFor(4), cost_override: null, duration_min: 120, variable_price: true },
  { id: 5, business_id: B, name: 'Trenzas', price: 0, supply_cost: cacheFor(5), cost_override: null, duration_min: 120, variable_price: true },
  { id: 6, business_id: B, name: 'Colas', price: 0, supply_cost: cacheFor(6), cost_override: null, duration_min: 60, variable_price: true },
  { id: 7, business_id: B, name: 'Ondas', price: 40000, supply_cost: cacheFor(7), cost_override: null, duration_min: 30, variable_price: false },
  { id: 8, business_id: B, name: 'Tintado', price: 40000, supply_cost: cacheFor(8), cost_override: null, duration_min: 10, variable_price: false },
  { id: 9, business_id: B, name: 'Cejas con gel', price: 20000, supply_cost: cacheFor(9), cost_override: null, duration_min: 15, variable_price: false },
  { id: 10, business_id: B, name: 'Pestañas por grupito', price: 60000, supply_cost: cacheFor(10), cost_override: null, duration_min: 25, variable_price: false },
  { id: 11, business_id: B, name: 'Pestañas corridas', price: 35000, supply_cost: cacheFor(11), cost_override: null, duration_min: 10, variable_price: false },
];

// Agenda inicial vacía: la dueña agenda desde la UI.
export const SEED_APPOINTMENTS: readonly Appointment[] = [];

// Gastos fijos mensuales (luz, agua, transporte). Montos de ejemplo ×100.
export const SEED_FIXED_EXPENSES: readonly FixedExpense[] = [
  { id: 1, business_id: B, concept: 'Luz', amount: 150000, period: 'MONTHLY' },
  { id: 2, business_id: B, concept: 'Agua', amount: 50000, period: 'MONTHLY' },
  { id: 3, business_id: B, concept: 'Transporte', amount: 200000, period: 'MONTHLY' },
];
