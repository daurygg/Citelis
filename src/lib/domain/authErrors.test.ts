import { describe, it, expect } from 'vitest';
import { friendlyAuthError, GENERIC_AUTH_ERROR } from './authErrors';

describe('friendlyAuthError', () => {
  it('traduce credenciales incorrectas', () => {
    expect(friendlyAuthError('Invalid login credentials')).toMatch(/correo o la contraseña/);
  });

  it('avisa que el correo ya tiene cuenta y sugiere iniciar sesión', () => {
    const msg = friendlyAuthError('User already registered');
    expect(msg).toMatch(/ya tiene una cuenta/);
    expect(msg).toMatch(/iniciar sesión/);
  });

  it('pide revisar la bandeja cuando falta confirmar el correo', () => {
    expect(friendlyAuthError('Email not confirmed')).toMatch(/bandeja/);
  });

  it('explica la regla de la contraseña', () => {
    expect(friendlyAuthError('Password should be at least 6 characters')).toMatch(/8 caracteres/);
    // Débil no siempre es corta: no prometemos que 8 caracteres basten.
    expect(friendlyAuthError('Password is too weak')).not.toMatch(/8 caracteres/);
    expect(friendlyAuthError('Password is too weak')).toMatch(/más segura/);
    expect(friendlyAuthError('weak_password')).toMatch(/más segura/);
  });

  it('pide esperar ante demasiados intentos', () => {
    expect(friendlyAuthError('email rate limit exceeded')).toMatch(/momento/);
    expect(friendlyAuthError('Too many requests')).toMatch(/momento/);
  });

  it('pide revisar la conexión ante un fallo de red', () => {
    expect(friendlyAuthError('Failed to fetch')).toMatch(/conexión/);
    expect(friendlyAuthError(new TypeError('NetworkError when attempting to fetch resource.'))).toMatch(/conexión/);
  });

  it('deja pasar los mensajes que ya vienen en español de la base', () => {
    const own = 'Tu cuenta ya creó un negocio. Cada cuenta puede crear uno solo.';
    expect(friendlyAuthError(own)).toBe(own);
    expect(friendlyAuthError({ message: 'Código inválido' })).toBe('Código inválido');
    expect(friendlyAuthError(new Error('No perteneces a ningún negocio'))).toBe('No perteneces a ningún negocio');
  });

  it('acepta Error, objeto con message o texto', () => {
    expect(friendlyAuthError(new Error('Invalid login credentials'))).toMatch(/correo o la contraseña/);
    expect(friendlyAuthError({ message: 'Email not confirmed' })).toMatch(/bandeja/);
  });

  it('nunca filtra el texto crudo en inglés', () => {
    const msg = friendlyAuthError('duplicate key value violates unique constraint "x"');
    expect(msg).toBe(GENERIC_AUTH_ERROR);
    expect(msg).not.toMatch(/duplicate/);
  });

  it('usa el mensaje genérico con entradas vacías o desconocidas', () => {
    expect(friendlyAuthError(undefined)).toBe(GENERIC_AUTH_ERROR);
    expect(friendlyAuthError(null)).toBe(GENERIC_AUTH_ERROR);
    expect(friendlyAuthError(42)).toBe(GENERIC_AUTH_ERROR);
    expect(friendlyAuthError('')).toBe(GENERIC_AUTH_ERROR);
  });
});
