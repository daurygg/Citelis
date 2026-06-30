// Datos semilla para las Fases 1-3 (en memoria). En el Slice 4 esto lo reemplaza
// la base de datos. Dinero SIEMPRE en centavos enteros.
import type { Appointment, Service } from '../domain/types';

// El tenant del MVP. INVARIANTE 1: la columna/el filtro existen desde el día uno,
// aunque hoy siempre valga 1.
export const CURRENT_BUSINESS_ID = 1;

// Servicios semilla con costo fijo (la calculadora "por tandas" llega en el Slice 2).
// `cost_override: null` → se usa el cache `supply_cost`.
export const SEED_SERVICES: readonly Service[] = [
  {
    id: 1,
    business_id: CURRENT_BUSINESS_ID,
    name: 'Micropigmentación de cejas',
    price: 350000, // $3,500.00
    supply_cost: 90000, // $900.00
    cost_override: null,
    duration_min: 120,
  },
  {
    id: 2,
    business_id: CURRENT_BUSINESS_ID,
    name: 'Trenzas',
    price: 120000, // $1,200.00
    supply_cost: 25000, // $250.00
    cost_override: null,
    duration_min: 90,
  },
  {
    id: 3,
    business_id: CURRENT_BUSINESS_ID,
    name: 'Pestañas',
    price: 90000, // $900.00
    supply_cost: 30000, // $300.00
    cost_override: null,
    duration_min: 75,
  },
];

// Agenda inicial vacía: la dueña agenda desde la UI.
export const SEED_APPOINTMENTS: readonly Appointment[] = [];
