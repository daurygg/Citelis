import { describe, it, expect } from 'vitest';
import { buildICS, googleCalendarUrl } from './calendar';
import type { Appointment, Business, Service } from './types';

function business(partial: Partial<Business> = {}): Business {
  return {
    id: 1,
    name: 'Bella Spa',
    plan: 'free',
    ...partial,
  };
}

function service(partial: Partial<Service> = {}): Service {
  return {
    id: 1,
    business_id: 1,
    name: 'Corte',
    price: 50000,
    supply_cost: 1000,
    cost_override: null,
    duration_min: 60,
    variable_price: false,
    ...partial,
  };
}

function appointment(partial: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    business_id: 1,
    service_id: 1,
    client: 'Ana',
    datetime: '2026-09-21T14:30',
    status: 'PENDING',
    quoted_price: null,
    deposit: null,
    charged_price: null,
    actual_cost: null,
    profit: null,
    ...partial,
  };
}

/** Deshace el "folding" de RFC 5545 (CRLF + un espacio) para poder leer las propiedades. */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '');
}

/** Devuelve el valor de una propiedad (ej. 'DTSTART') ya desdoblada. */
function propertyValue(ics: string, name: string): string | undefined {
  const unfolded = unfold(ics);
  const line = unfolded.split('\r\n').find((l) => l.startsWith(`${name}:`));
  return line?.slice(name.length + 1);
}

describe('buildICS', () => {
  it('usa saltos de línea CRLF en todo el archivo (Apple Calendar rechaza LF suelto)', () => {
    const ics = buildICS({
      appointment: appointment(),
      service: service(),
      business: business(),
      uid: 'appt-1@citelis',
      sequence: 0,
      now: new Date('2026-09-17T10:00:00Z'),
    });

    // Sin CRLF no debería quedar ningún \r ni \n suelto.
    const withoutCrlf = ics.split('\r\n').join('');
    expect(withoutCrlf.includes('\n')).toBe(false);
    expect(withoutCrlf.includes('\r')).toBe(false);
    expect(ics.includes('\r\n')).toBe(true);
  });

  it('incluye todas las propiedades requeridas por RFC 5545', () => {
    const ics = buildICS({
      appointment: appointment(),
      service: service(),
      business: business(),
      uid: 'appt-1@citelis',
      sequence: 0,
      now: new Date('2026-09-17T10:00:00Z'),
    });

    for (const required of [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:',
      'BEGIN:VEVENT',
      'UID:',
      'DTSTAMP:',
      'DTSTART:',
      'DTEND:',
      'SUMMARY:',
      'END:VEVENT',
      'END:VCALENDAR',
    ]) {
      expect(unfold(ics)).toContain(required);
    }
  });

  it('el UID es estable y viene del llamador, sin importar el SEQUENCE', () => {
    const base = {
      appointment: appointment(),
      service: service(),
      business: business(),
      now: new Date('2026-09-17T10:00:00Z'),
    };
    const first = buildICS({ ...base, uid: 'appt-42@citelis', sequence: 0 });
    const updated = buildICS({ ...base, uid: 'appt-42@citelis', sequence: 1 });

    expect(propertyValue(first, 'UID')).toBe('appt-42@citelis');
    expect(propertyValue(updated, 'UID')).toBe('appt-42@citelis');
  });

  it('el SEQUENCE aumenta cuando la cita cambia, para que iOS/Google actualicen en vez de duplicar', () => {
    const base = {
      appointment: appointment(),
      service: service(),
      business: business(),
      uid: 'appt-42@citelis',
      now: new Date('2026-09-17T10:00:00Z'),
    };
    const first = buildICS({ ...base, sequence: 0 });
    const updated = buildICS({ ...base, sequence: 1 });

    expect(propertyValue(first, 'SEQUENCE')).toBe('0');
    expect(propertyValue(updated, 'SEQUENCE')).toBe('1');
    // Mismo UID, distinto SEQUENCE: así el cliente reemplaza el evento existente.
    expect(propertyValue(first, 'UID')).toBe(propertyValue(updated, 'UID'));
  });

  it('DTSTART y DTEND se emiten como hora local flotante, sin Z y sin desplazar horas', () => {
    const ics = buildICS({
      appointment: appointment({ datetime: '2026-09-21T14:30' }),
      service: service({ duration_min: 45 }),
      business: business(),
      uid: 'appt-1@citelis',
      sequence: 0,
      now: new Date('2026-09-17T10:00:00Z'),
    });

    expect(propertyValue(ics, 'DTSTART')).toBe('20260921T143000');
    expect(propertyValue(ics, 'DTEND')).toBe('20260921T151500');
    // Ninguno de los dos lleva sufijo Z: es hora flotante, no UTC.
    expect(propertyValue(ics, 'DTSTART')?.endsWith('Z')).toBe(false);
    expect(propertyValue(ics, 'DTEND')?.endsWith('Z')).toBe(false);
  });

  it('DTEND cruza la medianoche correctamente cuando el servicio se extiende más allá del cierre del día', () => {
    const ics = buildICS({
      appointment: appointment({ datetime: '2026-09-21T23:30' }),
      service: service({ duration_min: 90 }),
      business: business(),
      uid: 'appt-1@citelis',
      sequence: 0,
      now: new Date('2026-09-17T10:00:00Z'),
    });

    expect(propertyValue(ics, 'DTSTART')).toBe('20260921T233000');
    expect(propertyValue(ics, 'DTEND')).toBe('20260922T010000');
  });

  it('DTSTAMP es un instante UTC real derivado de `now`, con sufijo Z (a diferencia de DTSTART/DTEND)', () => {
    const ics = buildICS({
      appointment: appointment(),
      service: service(),
      business: business(),
      uid: 'appt-1@citelis',
      sequence: 0,
      now: new Date('2026-09-17T10:05:07Z'),
    });

    expect(propertyValue(ics, 'DTSTAMP')).toBe('20260917T100507Z');
  });

  it('escapa backslash, punto y coma, coma y salto de línea en SUMMARY/DESCRIPTION', () => {
    const ics = buildICS({
      appointment: appointment({ client: 'Ana;Reyes\\Torres, con nota\nespecial' }),
      service: service({ name: 'Corte; especial' }),
      business: business({ name: 'Bella, Spa' }),
      uid: 'appt-1@citelis',
      sequence: 0,
      now: new Date('2026-09-17T10:00:00Z'),
    });

    const summary = propertyValue(ics, 'SUMMARY');
    expect(summary).toContain('Corte\\; especial');
    expect(summary).toContain('Bella\\, Spa');

    const description = propertyValue(ics, 'DESCRIPTION');
    expect(description).toContain('Ana\\;Reyes\\\\Torres\\, con nota\\nespecial');
  });

  it('dobla (fold) líneas de más de 75 octetos con CRLF + un espacio, sin cortar caracteres multibyte', () => {
    const ics = buildICS({
      appointment: appointment(),
      service: service({
        name: 'Peinado de novia con extensiones, trenzas y tratamiento capilar profundo Añañuca',
      }),
      business: business({ name: 'Peluquería Añañuca' }),
      uid: 'appt-1@citelis',
      sequence: 0,
      now: new Date('2026-09-17T10:00:00Z'),
    });

    const rawLines = ics.split('\r\n');
    // Debe existir al menos una línea de continuación (empieza con un solo espacio).
    expect(rawLines.some((l) => l.startsWith(' '))).toBe(true);

    // Ninguna línea física debe superar 75 octetos (excluyendo el propio CRLF).
    const encoder = new TextEncoder();
    for (const line of rawLines) {
      if (line === '') continue;
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }

    // Al desdoblar, el contenido íntegro (con los caracteres multibyte intactos) debe reaparecer.
    const summary = propertyValue(ics, 'SUMMARY');
    expect(summary).toContain('Añañuca');
    expect(summary).toContain('Peinado de novia con extensiones\\, trenzas y tratamiento capilar profundo Añañuca');
  });

  it('es una presentación de solo lectura: el resultado no cambia si los campos de dinero congelados cambian', () => {
    const withoutMoney = buildICS({
      appointment: appointment({ charged_price: null, actual_cost: null, profit: null }),
      service: service(),
      business: business(),
      uid: 'appt-1@citelis',
      sequence: 0,
      now: new Date('2026-09-17T10:00:00Z'),
    });
    const withMoney = buildICS({
      appointment: appointment({ charged_price: 50000, actual_cost: 12000, profit: 38000 }),
      service: service(),
      business: business(),
      uid: 'appt-1@citelis',
      sequence: 0,
      now: new Date('2026-09-17T10:00:00Z'),
    });

    expect(withMoney).toBe(withoutMoney);
  });

  it('no muta ninguna de sus entradas', () => {
    const appt = appointment();
    const svc = service();
    const biz = business();
    const apptCopy = { ...appt };
    const svcCopy = { ...svc };
    const bizCopy = { ...biz };

    buildICS({
      appointment: appt,
      service: svc,
      business: biz,
      uid: 'appt-1@citelis',
      sequence: 0,
      now: new Date('2026-09-17T10:00:00Z'),
    });

    expect(appt).toEqual(apptCopy);
    expect(svc).toEqual(svcCopy);
    expect(biz).toEqual(bizCopy);
  });
});

describe('googleCalendarUrl', () => {
  it('genera un link de plantilla de Google Calendar con texto, fechas y detalles', () => {
    const url = googleCalendarUrl({
      appointment: appointment({ datetime: '2026-09-21T14:30' }),
      service: service({ name: 'Corte', duration_min: 45 }),
      business: business({ name: 'Bella Spa' }),
    });

    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
    expect(url).toContain('action=TEMPLATE');

    const parsed = new URL(url);
    expect(parsed.searchParams.get('dates')).toBe('20260921T143000/20260921T151500');
    expect(parsed.searchParams.get('text')).toBe('Corte — Bella Spa');
  });

  it('escapa correctamente valores con caracteres especiales de URL (coma, &, espacios)', () => {
    const url = googleCalendarUrl({
      appointment: appointment({ client: 'Ana & Luz' }),
      service: service({ name: 'Corte' }),
      business: business({ name: 'Bella, Spa & Uñas' }),
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('text')).toBe('Corte — Bella, Spa & Uñas');
    expect(url).not.toContain('Bella, Spa & Uñas');
  });
});
