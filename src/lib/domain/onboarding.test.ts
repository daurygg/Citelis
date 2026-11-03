import { describe, it, expect } from 'vitest';
import {
  validateSignUp,
  validateBusinessName,
  ONBOARDING_STEPS,
  nextStep,
  prevStep,
  isSkippable,
  stepProgress,
  PASSWORD_MIN_LENGTH,
} from './onboarding';

describe('validateSignUp', () => {
  const ok = { email: 'ana@correo.com', password: 'clave1234', confirm: 'clave1234' };

  it('devuelve un mapa vacío cuando todo está bien', () => {
    expect(validateSignUp(ok)).toEqual({});
  });

  it('exige un correo con forma válida', () => {
    expect(validateSignUp({ ...ok, email: '' }).email).toBeDefined();
    expect(validateSignUp({ ...ok, email: 'ana@' }).email).toBeDefined();
    expect(validateSignUp({ ...ok, email: 'ana correo.com' }).email).toBeDefined();
    expect(validateSignUp({ ...ok, email: '  ana@correo.com  ' }).email).toBeUndefined();
  });

  it('exige al menos 8 caracteres de contraseña', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(validateSignUp({ ...ok, password: '1234567', confirm: '1234567' }).password).toBeDefined();
    expect(validateSignUp({ ...ok, password: '12345678', confirm: '12345678' }).password).toBeUndefined();
  });

  it('exige que la confirmación coincida', () => {
    expect(validateSignUp({ ...ok, confirm: 'otra-clave' }).confirm).toBeDefined();
  });

  it('no regaña por la confirmación si la contraseña ya es inválida y está vacía', () => {
    const errors = validateSignUp({ email: 'ana@correo.com', password: '', confirm: '' });
    expect(errors.password).toBeDefined();
    expect(errors.confirm).toBeUndefined();
  });
});

describe('validateBusinessName', () => {
  it('acepta de 2 a 60 caracteres tras recortar', () => {
    expect(validateBusinessName('Ro')).toBeNull();
    expect(validateBusinessName('  Estética Roelis  ')).toBeNull();
    expect(validateBusinessName('a'.repeat(60))).toBeNull();
  });

  it('rechaza vacío, muy corto o muy largo', () => {
    expect(validateBusinessName('')).not.toBeNull();
    expect(validateBusinessName('   ')).not.toBeNull();
    expect(validateBusinessName('a')).not.toBeNull();
    expect(validateBusinessName('a'.repeat(61))).not.toBeNull();
  });
});

describe('pasos del asistente', () => {
  it('declara el orden de los pasos', () => {
    expect(ONBOARDING_STEPS).toEqual(['business', 'hours', 'service', 'done']);
  });

  it('avanza y retrocede, con topes en los extremos', () => {
    expect(nextStep('business')).toBe('hours');
    expect(nextStep('hours')).toBe('service');
    expect(nextStep('service')).toBe('done');
    expect(nextStep('done')).toBe('done');
    expect(prevStep('done')).toBe('service');
    expect(prevStep('service')).toBe('hours');
    expect(prevStep('hours')).toBe('business');
    expect(prevStep('business')).toBe('business');
  });

  it('solo horarios y servicio se pueden saltar', () => {
    expect(isSkippable('business')).toBe(false);
    expect(isSkippable('hours')).toBe(true);
    expect(isSkippable('service')).toBe(true);
    expect(isSkippable('done')).toBe(false);
  });

  it('calcula el progreso sobre los pasos visibles', () => {
    expect(stepProgress('business')).toEqual({ current: 1, total: 3 });
    expect(stepProgress('hours')).toEqual({ current: 2, total: 3 });
    expect(stepProgress('service')).toEqual({ current: 3, total: 3 });
    expect(stepProgress('done')).toEqual({ current: 3, total: 3 });
  });
});
