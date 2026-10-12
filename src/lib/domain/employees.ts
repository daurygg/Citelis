// Empleadas del negocio, sin React (INVARIANTE 5). No son usuarias de la app: solo
// sirven para saber quién hizo cada servicio. Se dan de baja, no se borran: su
// nombre sigue en el historial ya cobrado.

import type { Employee } from './types';

export type EmployeeNameCheck = { ok: true; name: string } | { ok: false; message: string };

/** Valida el nombre tecleado; lo devuelve sin espacios sobrantes en los bordes. */
export function validateEmployeeName(raw: string): EmployeeNameCheck {
  const name = raw.trim();
  if (name === '') return { ok: false, message: 'Escribe el nombre de la empleada.' };
  return { ok: true, name };
}

/** Las que se pueden asignar hoy al cobrar: las activas, en su orden. */
export function activeEmployees(employees: readonly Employee[]): Employee[] {
  return employees.filter((e) => e.active);
}

/** Nombre para mostrar, también el de una dada de baja. null si no hay o no se conoce. */
export function employeeName(employees: readonly Employee[], id: number | null | undefined): string | null {
  if (id == null) return null;
  return employees.find((e) => e.id === id)?.name ?? null;
}
