import { describe, expect, it } from 'vitest';
import { previousStep, resolveStepFromHistory, stepHistoryState } from './bookingSteps';

const full = { hasServices: true, hasSlot: true, sent: false };

describe('previousStep', () => {
  it('cada paso vuelve al anterior', () => {
    expect(previousStep('details')).toBe('datetime');
    expect(previousStep('datetime')).toBe('service');
  });

  it('el primer paso y el éxito no tienen anterior', () => {
    expect(previousStep('service')).toBeNull();
    expect(previousStep('success')).toBeNull();
  });
});

describe('stepHistoryState', () => {
  it('guarda el paso de forma que resolveStepFromHistory lo lee', () => {
    expect(resolveStepFromHistory(stepHistoryState('datetime'), full)).toEqual({ step: 'datetime', skipBack: false });
  });
});

describe('resolveStepFromHistory', () => {
  it('sin estado válido cae en el primer paso', () => {
    for (const state of [null, undefined, {}, 'details', { citelisStep: 'nope' }, { citelisStep: 3 }]) {
      expect(resolveStepFromHistory(state, full)).toEqual({ step: 'service', skipBack: false });
    }
  });

  it('un paso tardío sin servicios elegidos (recarga) cae en el primer paso', () => {
    const ctx = { hasServices: false, hasSlot: false, sent: false };
    expect(resolveStepFromHistory(stepHistoryState('details'), ctx).step).toBe('service');
    expect(resolveStepFromHistory(stepHistoryState('datetime'), ctx).step).toBe('service');
  });

  it('datos sin horario elegido se queda en la hora', () => {
    const ctx = { hasServices: true, hasSlot: false, sent: false };
    expect(resolveStepFromHistory(stepHistoryState('details'), ctx).step).toBe('datetime');
  });

  it('el éxito sin solicitud enviada no se puede reabrir', () => {
    expect(resolveStepFromHistory(stepHistoryState('success'), full).step).toBe('service');
  });

  it('con la solicitud enviada siempre muestra el comprobante, nunca el formulario', () => {
    const sent = { ...full, sent: true };
    expect(resolveStepFromHistory(stepHistoryState('service'), sent)).toEqual({ step: 'success', skipBack: false });
    expect(resolveStepFromHistory(stepHistoryState('success'), sent)).toEqual({ step: 'success', skipBack: false });
  });

  it('con la solicitud enviada, las entradas intermedias se saltan hacia atrás', () => {
    const sent = { ...full, sent: true };
    expect(resolveStepFromHistory(stepHistoryState('datetime'), sent)).toEqual({ step: 'success', skipBack: true });
    expect(resolveStepFromHistory(stepHistoryState('details'), sent)).toEqual({ step: 'success', skipBack: true });
  });
});
