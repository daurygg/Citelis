import { describe, it, expect } from 'vitest';
import {
  parseHexColor,
  brandRamp,
  readableForeground,
  themeCssVars,
  DEFAULT_BRAND_COLOR,
  type Oklch,
  type BrandStep,
} from './theme';

// Tolerancia para comparar floats: la conversión sRGB→OKLCH pasa por raíces
// cúbicas y trigonometría, así que comparar con === sería frágil.
function approx(actual: number, expected: number, epsilon = 0.005): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(epsilon);
}

// Extrae los tres números de un string 'oklch(l c h)' generado por brandRamp.
function parseOklchString(css: string): [number, number, number] {
  const match = /^oklch\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)$/.exec(css);
  if (!match) throw new Error(`no es un oklch() válido: ${css}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

const STEPS: BrandStep[] = [50, 100, 500, 600, 700];

describe('parseHexColor', () => {
  it('convierte blanco puro (#ffffff) a L≈1, C≈0', () => {
    const oklch = parseHexColor('#ffffff');
    expect(oklch).not.toBeNull();
    approx(oklch!.l, 1, 0.01);
    approx(oklch!.c, 0, 0.01);
  });

  it('convierte negro puro (#000000) a L≈0', () => {
    const oklch = parseHexColor('#000000');
    expect(oklch).not.toBeNull();
    approx(oklch!.l, 0, 0.01);
  });

  it('convierte rojo puro (#ff0000) contra valores OKLCH conocidos', () => {
    const oklch = parseHexColor('#ff0000');
    expect(oklch).not.toBeNull();
    approx(oklch!.l, 0.6279, 0.01);
    approx(oklch!.c, 0.2577, 0.01);
    approx(oklch!.h, 29.23, 0.5);
  });

  it('la notación corta #RGB equivale a su expansión #RRGGBB', () => {
    const short = parseHexColor('#0f3');
    const full = parseHexColor('#00ff33');
    expect(short).not.toBeNull();
    expect(full).not.toBeNull();
    approx(short!.l, full!.l);
    approx(short!.c, full!.c);
    approx(short!.h, full!.h);
  });

  it('ignora mayúsculas/minúsculas', () => {
    const lower = parseHexColor('#e11d48');
    const upper = parseHexColor('#E11D48');
    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
    approx(lower!.l, upper!.l);
    approx(lower!.c, upper!.c);
    approx(lower!.h, upper!.h);
  });

  it('rechaza sin # inicial', () => {
    expect(parseHexColor('e11d48')).toBeNull();
  });

  it('rechaza longitud incorrecta', () => {
    expect(parseHexColor('#e11d4')).toBeNull();
    expect(parseHexColor('#e11d489')).toBeNull();
  });

  it('rechaza caracteres no hexadecimales', () => {
    expect(parseHexColor('#gggggg')).toBeNull();
  });

  it('rechaza el string vacío', () => {
    expect(parseHexColor('')).toBeNull();
  });

  it('rechaza espacios en blanco', () => {
    expect(parseHexColor('   ')).toBeNull();
    expect(parseHexColor(' #e11d48 ')).toBeNull();
  });

  it('nunca lanza, incluso ante entradas inesperadas', () => {
    // @ts-expect-error -- se fuerza a propósito un tipo no-string para probar el fallo en seguro.
    expect(() => parseHexColor(null)).not.toThrow();
    // @ts-expect-error -- idem, undefined.
    expect(() => parseHexColor(undefined)).not.toThrow();
  });

  it('un gris puro no produce NaN: el tono se fija en 0 en vez de heredar la mentira de atan2(0,0)', () => {
    for (const gray of ['#808080', '#ffffff', '#000000']) {
      const oklch = parseHexColor(gray);
      expect(oklch).not.toBeNull();
      expect(Number.isNaN(oklch!.l)).toBe(false);
      expect(Number.isNaN(oklch!.c)).toBe(false);
      expect(Number.isNaN(oklch!.h)).toBe(false);
      expect(oklch!.h).toBe(0);
    }
  });

  it('es puro: no muta nada y con la misma entrada devuelve el mismo resultado', () => {
    const first = parseHexColor('#e11d48');
    const second = parseHexColor('#e11d48');
    expect(first).toEqual(second);
  });
});

describe('brandRamp', () => {
  it('mantiene el tono (hue) del color base en los cinco escalones', () => {
    const base = parseHexColor('#e11d48')!;
    const ramp = brandRamp(base);
    for (const step of STEPS) {
      const [, , h] = parseOklchString(ramp[step]);
      approx(h, base.h, 0.5);
    }
  });

  it('usa la luminosidad fijada por el sistema en los escalones 50, 100, 500 y 700', () => {
    const base = parseHexColor('#e11d48')!;
    const ramp = brandRamp(base);
    const expectedL: Record<50 | 100 | 500 | 700, number> = {
      50: 0.971,
      100: 0.936,
      500: 0.645,
      700: 0.514,
    };
    for (const step of [50, 100, 500, 700] as const) {
      const [l] = parseOklchString(ramp[step]);
      approx(l, expectedL[step], 0.001);
    }
  });

  it('preserva la L del usuario en el escalón 600 cuando cae dentro de la banda usable [0.45, 0.72]', () => {
    // #e11d48 tiene L≈0.55 (dentro de la banda): debe conservarse verbatim, no 0.586.
    const base = parseHexColor('#e11d48')!;
    expect(base.l).toBeGreaterThanOrEqual(0.45);
    expect(base.l).toBeLessThanOrEqual(0.72);

    const ramp = brandRamp(base);
    const [l600] = parseOklchString(ramp[600]);
    approx(l600, base.l, 0.001);
  });

  it('recorta a la banda usable en el escalón 600 cuando la L del usuario cae fuera, conservando tono y croma', () => {
    // Amarillo casi puro: L muy alta, fuera de la banda [0.45, 0.72].
    const base = parseHexColor('#ffff00')!;
    expect(base.l).toBeGreaterThan(0.72);

    const ramp = brandRamp(base);
    const [l600, c600, h600] = parseOklchString(ramp[600]);

    approx(l600, 0.72, 0.001);
    approx(c600, base.c, 0.001); // el croma del escalón 600 usa factor 1.00 → igual al base.
    approx(h600, base.h, 0.5);
  });

  it('recorta hacia arriba en el escalón 600 cuando la L del usuario cae por debajo de la banda', () => {
    // Azul muy oscuro: L baja, fuera de la banda por abajo.
    const base: Oklch = { l: 0.2, c: 0.15, h: 260 };
    const ramp = brandRamp(base);
    const [l600] = parseOklchString(ramp[600]);
    approx(l600, 0.45, 0.001);
  });

  it('los escalones claros (50 y 100) llevan menos croma que el escalón 600', () => {
    const base = parseHexColor('#e11d48')!;
    const ramp = brandRamp(base);
    const [, c50] = parseOklchString(ramp[50]);
    const [, c100] = parseOklchString(ramp[100]);
    const [, c600] = parseOklchString(ramp[600]);
    expect(c50).toBeLessThan(c600);
    expect(c100).toBeLessThan(c600);
  });

  it('un gris puro (croma 0) no produce NaN en ningún escalón de la rampa', () => {
    const gray: Oklch = { l: 0.5, c: 0, h: 0 };
    const ramp = brandRamp(gray);
    for (const step of STEPS) {
      const [l, c, h] = parseOklchString(ramp[step]);
      expect(Number.isNaN(l)).toBe(false);
      expect(Number.isNaN(c)).toBe(false);
      expect(Number.isNaN(h)).toBe(false);
    }
  });

  it('es puro: no muta el objeto de entrada', () => {
    const base: Oklch = { l: 0.55, c: 0.2, h: 20 };
    const copy = { ...base };
    brandRamp(base);
    expect(base).toEqual(copy);
  });

  it('con la misma entrada devuelve el mismo resultado', () => {
    const base = parseHexColor('#e11d48')!;
    expect(brandRamp(base)).toEqual(brandRamp(base));
  });
});

describe('readableForeground', () => {
  it('devuelve texto oscuro cuando la luminosidad supera el umbral 0.62', () => {
    expect(readableForeground(0.9)).toBe('oklch(0.22 0 0)');
    expect(readableForeground(0.621)).toBe('oklch(0.22 0 0)');
  });

  it('devuelve blanco cuando la luminosidad está en el umbral o por debajo', () => {
    expect(readableForeground(0.62)).toBe('oklch(1 0 0)');
    expect(readableForeground(0.3)).toBe('oklch(1 0 0)');
    expect(readableForeground(0)).toBe('oklch(1 0 0)');
  });
});

describe('themeCssVars', () => {
  it('genera las seis variables CSS esperadas a partir de un hex válido', () => {
    const vars = themeCssVars('#e11d48');
    expect(Object.keys(vars).sort()).toEqual(
      [
        '--color-brand-50',
        '--color-brand-100',
        '--color-brand-500',
        '--color-brand-600',
        '--color-brand-700',
        '--color-brand-fg',
      ].sort(),
    );
  });

  it('cae al color por defecto ante null', () => {
    expect(themeCssVars(null)).toEqual(themeCssVars(DEFAULT_BRAND_COLOR));
  });

  it('cae al color por defecto ante undefined', () => {
    expect(themeCssVars(undefined)).toEqual(themeCssVars(DEFAULT_BRAND_COLOR));
  });

  it('cae al color por defecto ante el string vacío', () => {
    expect(themeCssVars('')).toEqual(themeCssVars(DEFAULT_BRAND_COLOR));
  });

  it('cae al color por defecto ante basura no reconocible como hex', () => {
    expect(themeCssVars('no-soy-un-color')).toEqual(themeCssVars(DEFAULT_BRAND_COLOR));
  });

  it('el foreground corresponde a la luminosidad efectiva del escalón 600, no a la del color base', () => {
    // Amarillo: L base fuera de banda, se recorta a 0.72 en el 600 → debe pedir texto oscuro.
    const vars = themeCssVars('#ffff00');
    expect(vars['--color-brand-fg']).toBe('oklch(0.22 0 0)');
  });

  it('nunca lanza sin importar la entrada', () => {
    expect(() => themeCssVars(null)).not.toThrow();
    expect(() => themeCssVars(undefined)).not.toThrow();
    expect(() => themeCssVars('')).not.toThrow();
    expect(() => themeCssVars('   ')).not.toThrow();
    expect(() => themeCssVars('#zzzzzz')).not.toThrow();
    // @ts-expect-error -- entrada de tipo incorrecto a propósito.
    expect(() => themeCssVars(12345)).not.toThrow();
  });
});
