import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// DoD Slice 0: "Cero dependencias de React en esta carpeta."
// Este test escanea los .ts del dominio y falla si alguno importa react.
describe('arquitectura del dominio', () => {
  it('ningún archivo del dominio importa react', () => {
    const domainDir = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(domainDir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );

    const offenders = files.filter((f) => {
      const src = readFileSync(join(domainDir, f), 'utf8');
      return /from\s+['"]react/.test(src) || /require\(\s*['"]react/.test(src);
    });

    expect(offenders).toEqual([]);
  });
});
