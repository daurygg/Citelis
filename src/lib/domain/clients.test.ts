import { describe, it, expect } from 'vitest';
import { clientInitials, findClientByPhone, phoneDigits, searchClients } from './clients';
import type { Client } from './types';

function client(partial: Partial<Client> & { id: number; name: string }): Client {
  return { business_id: 1, phone: null, created_at: '2026-11-01T00:00:00Z', ...partial };
}

const ana = client({ id: 1, name: 'Ana Pérez', phone: '829-000-0001' });
const maria = client({ id: 2, name: 'María José', phone: '(809) 555 1234' });
const jose = client({ id: 3, name: 'José Luis', phone: null });
const catalog = [maria, jose, ana];

describe('phoneDigits', () => {
  it('deja solo los dígitos, igual que la columna phone_digits del servidor', () => {
    expect(phoneDigits('(829) 000-0001')).toBe('8290000001');
    expect(phoneDigits('+1 829 000 0001')).toBe('18290000001');
  });
  it('devuelve null si no hay dígitos', () => {
    expect(phoneDigits('---')).toBeNull();
    expect(phoneDigits('')).toBeNull();
    expect(phoneDigits(null)).toBeNull();
    expect(phoneDigits(undefined)).toBeNull();
  });
});

describe('searchClients', () => {
  it('sin texto devuelve todas ordenadas por nombre', () => {
    expect(searchClients(catalog, '').map((c) => c.id)).toEqual([1, 3, 2]);
  });
  it('ignora tildes y mayúsculas al buscar por nombre', () => {
    expect(searchClients(catalog, 'MARIA').map((c) => c.id)).toEqual([2]);
    expect(searchClients(catalog, 'jose').map((c) => c.id)).toEqual([3, 2]);
  });
  it('pone primero a quien el nombre EMPIEZA con lo escrito', () => {
    // "José Luis" empieza con "jos"; "María José" solo lo contiene.
    expect(searchClients(catalog, 'jos').map((c) => c.id)).toEqual([3, 2]);
  });
  it('busca por dígitos del teléfono sin importar el formato', () => {
    expect(searchClients(catalog, '555 12').map((c) => c.id)).toEqual([2]);
    expect(searchClients(catalog, '829-000').map((c) => c.id)).toEqual([1]);
  });
  it('un texto sin dígitos no busca en teléfonos', () => {
    expect(searchClients(catalog, 'zzz')).toEqual([]);
  });
  it('respeta el límite', () => {
    expect(searchClients(catalog, '', 2)).toHaveLength(2);
  });
  it('no muta la lista original', () => {
    const copy = [...catalog];
    searchClients(catalog, '');
    expect(catalog).toEqual(copy);
  });
});

describe('clientInitials', () => {
  it('toma la inicial de las dos primeras palabras', () => {
    expect(clientInitials('Ana Pérez')).toBe('AP');
    expect(clientInitials('maría josé de la cruz')).toBe('MJ');
  });
  it('con una sola palabra usa una letra', () => {
    expect(clientInitials('  ana ')).toBe('A');
  });
  it('sin nombre devuelve un signo neutro', () => {
    expect(clientInitials('   ')).toBe('?');
  });
});

describe('findClientByPhone', () => {
  it('encuentra a la clienta por dígitos aunque el formato cambie', () => {
    expect(findClientByPhone(catalog, '8290000001')?.id).toBe(1);
    expect(findClientByPhone(catalog, '(829) 000 0001')?.id).toBe(1);
  });
  it('null si el teléfono está vacío, sin dígitos o no existe', () => {
    expect(findClientByPhone(catalog, '')).toBeNull();
    expect(findClientByPhone(catalog, '---')).toBeNull();
    expect(findClientByPhone(catalog, '8091112222')).toBeNull();
  });
  it('no compara a medias: faltan dígitos no es la misma clienta', () => {
    expect(findClientByPhone(catalog, '829000')).toBeNull();
  });
});
