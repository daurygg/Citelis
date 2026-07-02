// Datos semilla para las Fases 1-3 (en memoria). En el Slice 4 esto lo reemplaza
// la base de datos. Dinero SIEMPRE en centavos enteros.
import type { Appointment, Service, Supply } from '../domain/types';

// El tenant del MVP. INVARIANTE 1: la columna/el filtro existen desde el día uno,
// aunque hoy siempre valga 1.
export const CURRENT_BUSINESS_ID = 1;

// Servicios semilla. `supply_cost` es el CACHE: suma de los costos unitarios de
// sus insumos (ver SEED_SUPPLIES). `cost_override: null` → se usa ese cache.
export const SEED_SERVICES: readonly Service[] = [
  {
    id: 1,
    business_id: CURRENT_BUSINESS_ID,
    name: 'Micropigmentación de cejas',
    price: 350000, // $3,500.00
    supply_cost: 11000, // $110.00 = 6000 + 5000 (ver insumos 1 y 2)
    cost_override: null,
    duration_min: 120,
    variable_price: false,
  },
  {
    id: 2,
    business_id: CURRENT_BUSINESS_ID,
    name: 'Trenzas',
    price: 120000, // $1,200.00
    supply_cost: 10000, // $100.00 = 60000 / 6 (ver insumo 3)
    cost_override: null,
    duration_min: 90,
    variable_price: false,
  },
  {
    id: 3,
    business_id: CURRENT_BUSINESS_ID,
    name: 'Pestañas',
    price: 90000, // $900.00
    supply_cost: 17000, // $170.00 = 15000 + 2000 (ver insumos 4 y 5)
    cost_override: null,
    duration_min: 75,
    variable_price: false,
  },
];

// Insumos semilla. Cada uno: lo que pagó la dueña por la "tanda" (purchase_price)
// y para cuántas clientas alcanza (servings). costo_unitario = purchase_price / servings.
export const SEED_SUPPLIES: readonly Supply[] = [
  { id: 1, service_id: 1, name: 'Pigmento', purchase_price: 120000, servings: 20 }, // 6000 c/u
  { id: 2, service_id: 1, name: 'Set de agujas', purchase_price: 80000, servings: 16 }, // 5000 c/u
  { id: 3, service_id: 2, name: 'Extensiones de cabello', purchase_price: 60000, servings: 6 }, // 10000 c/u
  { id: 4, service_id: 3, name: 'Bandeja de pestañas', purchase_price: 90000, servings: 6 }, // 15000 c/u
  { id: 5, service_id: 3, name: 'Pegamento', purchase_price: 50000, servings: 25 }, // 2000 c/u
];

// Agenda inicial vacía: la dueña agenda desde la UI.
export const SEED_APPOINTMENTS: readonly Appointment[] = [];
