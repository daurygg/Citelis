import { describe, it, expect } from 'vitest';
import { parseRememberedClient, serializeRememberedClient } from './rememberedClient';

describe('parseRememberedClient', () => {
  it('devuelve el nombre y el teléfono que guardó el portal', () => {
    expect(parseRememberedClient('{"name":"Rosa Pérez","phone":"8294576475"}')).toEqual({
      name: 'Rosa Pérez',
      phone: '8294576475',
    });
  });

  it('sobrevive al viaje de ida y vuelta', () => {
    const guardado = serializeRememberedClient({ name: 'Rosa Pérez', phone: '8294576475' });
    expect(parseRememberedClient(guardado)).toEqual({ name: 'Rosa Pérez', phone: '8294576475' });
  });

  it('no devuelve nada cuando no hay nada guardado', () => {
    expect(parseRememberedClient(null)).toBeNull();
    expect(parseRememberedClient('')).toBeNull();
  });

  it('aguanta basura sin lanzar', () => {
    // Esto sale del dispositivo de la clienta: puede estar a medias por una
    // pestaña cerrada a destiempo, o manipulado. Nunca debe tumbar el portal.
    expect(parseRememberedClient('no es json')).toBeNull();
    expect(parseRememberedClient('{"name":')).toBeNull();
    expect(parseRememberedClient('[]')).toBeNull();
    expect(parseRememberedClient('null')).toBeNull();
    expect(parseRememberedClient('42')).toBeNull();
  });

  it('exige que los dos campos sean texto con contenido', () => {
    expect(parseRememberedClient('{"name":"Rosa"}')).toBeNull();
    expect(parseRememberedClient('{"phone":"8294576475"}')).toBeNull();
    expect(parseRememberedClient('{"name":"Rosa","phone":123}')).toBeNull();
    expect(parseRememberedClient('{"name":"","phone":"8294576475"}')).toBeNull();
    expect(parseRememberedClient('{"name":"   ","phone":"8294576475"}')).toBeNull();
  });

  it('rechaza valores absurdamente largos en vez de rellenar con ellos', () => {
    // Si no lo escribió el portal, no se usa: un campo con 10.000 caracteres
    // pegados es más probable que sea un destrozo que el nombre de alguien.
    const largo = JSON.stringify({ name: 'x'.repeat(5000), phone: '8294576475' });
    expect(parseRememberedClient(largo)).toBeNull();
  });

  it('recorta los espacios de los extremos', () => {
    expect(parseRememberedClient('{"name":"  Rosa  ","phone":" 8294576475 "}')).toEqual({
      name: 'Rosa',
      phone: '8294576475',
    });
  });

  it('ignora los campos que no conoce', () => {
    expect(parseRememberedClient('{"name":"Rosa","phone":"829","otro":"x"}')).toEqual({
      name: 'Rosa',
      phone: '829',
    });
  });
});
