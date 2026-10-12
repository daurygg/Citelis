// La selección de servicios del formulario de agendar, sin React (INVARIANTE 5).
// CERO dependencias de React. La UI solo llama a estas funciones y pinta.

import type { PaymentMethod, Service } from './types';
import { priceForServices } from './costs';

/** Marca o desmarca un servicio. Conserva el orden en que la dueña los fue eligiendo. */
export function toggleServiceId(selected: readonly number[], id: number): number[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

export interface SelectionSummary {
  /** Servicios elegidos que existen en el catálogo, sin repetir, en orden de elección. */
  service_ids: number[];
  /** El primero elegido: es el `service_id` de la cita. null si no hay selección. */
  primary: number | null;
  /** Duración de la visita: la suma de cada servicio, en minutos. */
  duration_min: number;
  estimate: {
    /** Suma de los servicios de precio fijo. Los variables NO se cuentan como cero: ver hasVariable. */
    total: number;
    /** true si algún servicio es de precio variable: el precio está "a convenir". */
    hasVariable: boolean;
  };
  /** ¿Se puede agendar? Hay al menos un servicio y todos tienen duración positiva. */
  ready: boolean;
}

/**
 * Resume lo elegido. Ids que ya no estén en el catálogo se descartan en silencio
 * (el servidor volvería a comprobarlos de todos modos).
 */
export function summarizeSelection(catalog: readonly Service[], selected: readonly number[]): SelectionSummary {
  const services: Service[] = [];
  for (const id of selected) {
    const found = catalog.find((s) => s.id === id);
    if (found && !services.some((s) => s.id === id)) services.push(found);
  }
  // Sin precios puestos: el variable cae en `needsPrice` en vez de contar como 0.
  const quote = priceForServices(services);
  return {
    service_ids: services.map((s) => s.id),
    primary: services[0]?.id ?? null,
    duration_min: services.reduce((sum, s) => sum + s.duration_min, 0),
    estimate: { total: quote.total, hasVariable: quote.needsPrice.length > 0 },
    ready: services.length > 0 && services.every((s) => s.duration_min > 0),
  };
}

/** Lo que hace falta para agendar: la cita con SUS servicios (el primero es el principal). */
export interface ScheduleDraft {
  id: number;
  client: string;
  datetime: string;
  service_ids: readonly number[];
  quoted_price?: number | null;
  deposit?: number | null;
  /** Cómo pagó el abono. Con abono, el pago nace en la misma transacción que la cita. */
  deposit_method?: PaymentMethod | null;
}

/** Argumentos de la RPC `schedule_appointment`. El negocio va explícito (INVARIANTE 1). */
export function scheduleRpcArgs(businessId: number, draft: ScheduleDraft) {
  return {
    p_business_id: businessId,
    p_appointment_id: draft.id,
    p_client: draft.client,
    p_datetime: draft.datetime,
    p_quoted_price: draft.quoted_price ?? null,
    p_deposit: draft.deposit ?? null,
    p_service_ids: [...draft.service_ids],
    p_deposit_method: draft.deposit_method ?? null,
  };
}
