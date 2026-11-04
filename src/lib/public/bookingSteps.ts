// Pasos del portal público y su sincronía con el historial del navegador, sin
// React (INVARIANTE 5). El componente solo cablea `pushState` / `popstate`; aquí
// viven las decisiones: cuál es el paso anterior y a qué paso lleva una entrada
// del historial según lo que la clienta ya eligió.

export type BookingStep = 'service' | 'datetime' | 'details' | 'success';

const STEPS: readonly BookingStep[] = ['service', 'datetime', 'details', 'success'];

/** Lo que hay en pantalla y lo ya hecho: decide si una entrada del historial es válida. */
export interface StepContext {
  hasServices: boolean;
  hasSlot: boolean;
  /** La solicitud ya se envió (hay folio). */
  sent: boolean;
}

/** Paso al que lleva el "Atrás" de la pantalla. null: no hay a dónde volver. */
export function previousStep(step: BookingStep): BookingStep | null {
  if (step === 'details') return 'datetime';
  if (step === 'datetime') return 'service';
  return null;
}

/** Lo que se guarda en `history.state` (el paso va ahí y no en la URL). */
export function stepHistoryState(step: BookingStep): { citelisStep: BookingStep } {
  return { citelisStep: step };
}

function parseStep(state: unknown): BookingStep | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as { citelisStep?: unknown }).citelisStep;
  return STEPS.find((s) => s === value) ?? null;
}

/**
 * Paso que corresponde a una entrada del historial. Nunca devuelve un paso que
 * la clienta no pueda sostener: una recarga en un paso tardío (sin selección en
 * memoria) cae en el primero, y datos sin horario vuelven a la hora.
 *
 * Con la solicitud ya enviada solo existe el comprobante: así el atrás del
 * teléfono nunca reabre el formulario (evita enviarla dos veces). `skipBack`
 * pide retroceder una entrada más cuando la que se pisó era intermedia, para que
 * el siguiente atrás salga del portal sin pasar por entradas repetidas.
 */
export function resolveStepFromHistory(state: unknown, ctx: StepContext): { step: BookingStep; skipBack: boolean } {
  const requested = parseStep(state) ?? 'service';
  if (ctx.sent) {
    return { step: 'success', skipBack: requested === 'datetime' || requested === 'details' };
  }
  if (requested === 'success' || !ctx.hasServices) return { step: 'service', skipBack: false };
  if (requested === 'details' && !ctx.hasSlot) return { step: 'datetime', skipBack: false };
  return { step: requested, skipBack: false };
}
