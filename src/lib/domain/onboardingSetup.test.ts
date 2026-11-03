import { describe, it, expect } from 'vitest';
import {
  HOURS_PRESETS,
  buildHoursFromPreset,
  validateHoursRange,
  validateFirstService,
  buildSetupSummary,
  pendingSetupSteps,
} from './onboardingSetup';

describe('buildHoursFromPreset', () => {
  it('arma un tramo por día, de lunes a viernes', () => {
    const rows = buildHoursFromPreset('weekdays', '09:00', '18:00');
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.every((r) => r.opens_at === '09:00' && r.closes_at === '18:00')).toBe(true);
  });

  it('incluye el sábado en el preset de lunes a sábado', () => {
    expect(buildHoursFromPreset('weekdays_saturday', '10:00', '19:00').map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('expone los presets con su etiqueta en lenguaje de la dueña', () => {
    expect(HOURS_PRESETS.map((p) => p.id)).toEqual(['weekdays', 'weekdays_saturday']);
    expect(HOURS_PRESETS[0].label).toBe('Lunes a viernes');
  });
});

describe('validateHoursRange', () => {
  it('acepta un cierre posterior a la apertura', () => {
    expect(validateHoursRange('09:00', '18:00')).toBeNull();
  });
  it('rechaza horas vacías o un cierre que no es posterior', () => {
    expect(validateHoursRange('', '18:00')).not.toBeNull();
    expect(validateHoursRange('09:00', '')).not.toBeNull();
    expect(validateHoursRange('18:00', '09:00')).toBe('La hora de cierre debe ser después de la de apertura.');
    expect(validateHoursRange('09:00', '09:00')).not.toBeNull();
  });
});

describe('validateFirstService', () => {
  it('devuelve el servicio con el precio en centavos enteros', () => {
    const r = validateFirstService({ name: '  Manicure ', priceText: '350.50', durationText: '45' });
    expect(r.errors).toEqual({});
    expect(r.value).toEqual({ name: 'Manicure', price: 35050, duration_min: 45 });
  });

  it('pide el nombre, el precio y una duración mayor que cero', () => {
    const r = validateFirstService({ name: ' ', priceText: '', durationText: '0' });
    expect(r.value).toBeNull();
    expect(r.errors.name).toBeDefined();
    expect(r.errors.price).toBeDefined();
    expect(r.errors.duration).toBeDefined();
  });

  it('rechaza una duración con decimales o no numérica', () => {
    expect(validateFirstService({ name: 'A', priceText: '10', durationText: '4.5' }).errors.duration).toBeDefined();
    expect(validateFirstService({ name: 'A', priceText: '10', durationText: 'x' }).errors.duration).toBeDefined();
  });

  it('acepta precio cero (servicio gratis)', () => {
    expect(validateFirstService({ name: 'Prueba', priceText: '0', durationText: '30' }).value?.price).toBe(0);
  });
});

describe('buildSetupSummary', () => {
  it('marca lo configurado y lo que quedó para después', () => {
    const items = buildSetupSummary({ businessName: 'Rosa', hoursDays: 5, serviceName: 'Manicure' });
    expect(items).toEqual([
      { label: 'Negocio creado: Rosa', done: true },
      { label: 'Horarios: 5 días a la semana', done: true },
      { label: 'Primer servicio: Manicure', done: true },
    ]);
  });

  it('indica dónde completar lo que se saltó', () => {
    const items = buildSetupSummary({ businessName: 'Rosa', hoursDays: 0, serviceName: null });
    expect(items[1]).toEqual({ label: 'Horarios: lo haces después en Mi negocio', done: false });
    expect(items[2]).toEqual({ label: 'Primer servicio: lo agregas después en Servicios', done: false });
  });

  it('usa singular para un solo día', () => {
    expect(buildSetupSummary({ businessName: 'R', hoursDays: 1, serviceName: null })[1].label).toBe('Horarios: 1 día a la semana');
  });
});

describe('pendingSetupSteps', () => {
  const ready = { serviceCount: 2, hoursDays: 5, bookingOpen: true };

  it('devuelve vacío cuando todo está listo', () => {
    expect(pendingSetupSteps(ready)).toEqual([]);
  });

  it('pide el primer servicio cuando no hay ninguno', () => {
    const steps = pendingSetupSteps({ ...ready, serviceCount: 0 });
    expect(steps.map((s) => s.id)).toEqual(['add_service']);
    expect(steps[0].label).toBe('Agrega tu primer servicio');
  });

  it('pide los horarios cuando no hay ninguno', () => {
    const steps = pendingSetupSteps({ ...ready, hoursDays: 0 });
    expect(steps.map((s) => s.id)).toEqual(['set_hours']);
    expect(steps[0].label).toBe('Pon tus horarios');
  });

  it('pide abrir las reservas en línea cuando el portal está cerrado', () => {
    const steps = pendingSetupSteps({ ...ready, bookingOpen: false });
    expect(steps.map((s) => s.id)).toEqual(['open_booking']);
    expect(steps[0].label).toBe('Abre tus reservas en línea');
  });

  it('lista todo lo que falta en orden: servicio, horarios, reservas', () => {
    const steps = pendingSetupSteps({ serviceCount: 0, hoursDays: 0, bookingOpen: false });
    expect(steps.map((s) => s.id)).toEqual(['add_service', 'set_hours', 'open_booking']);
  });
});
