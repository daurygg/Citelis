// Tema de marca por negocio (Slice G1 del feature de theming, INVARIANTE 5).
// Función pura: sin React, sin DOM, sin I/O. Convierte el hex que elige la dueña
// (decisión T1: selector libre, sin paletas predefinidas) a una rampa de color
// OKLCH lista para Tailwind v4. Ver `odd/tasks/business-theming.md` para las
// decisiones T1–T6 que justifican cada regla de este módulo.

/** Escalones de la rampa de marca que consume el resto de la app. */
export type BrandStep = 50 | 100 | 500 | 600 | 700;

/** Color en el espacio OKLCH: luminosidad [0,1], croma [0,~0.4], tono en grados [0,360). */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** El rosa actual de la app, usado cuando el negocio no tiene color propio o el guardado es inválido. */
export const DEFAULT_BRAND_COLOR = '#e11d48';

const HEX_FULL_RE = /^#([0-9a-f]{6})$/i;
const HEX_SHORT_RE = /^#([0-9a-f]{3})$/i;

/** Expande '#RGB' a 'RRGGBB' (sin '#'); para '#RRGGBB' solo quita el '#'. null si no matchea ninguno. */
function expandHex(hex: string): string | null {
  const short = HEX_SHORT_RE.exec(hex);
  if (short) {
    const [r, g, b] = short[1];
    return `${r}${r}${g}${g}${b}${b}`;
  }
  const full = HEX_FULL_RE.exec(hex);
  return full ? full[1] : null;
}

/** sRGB→lineal (IEC 61966-2-1). Canal en [0,1]. */
function linearize(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Grados normalizados a [0, 360). */
function normalizeHue(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

// Por debajo de este croma el color es, a efectos prácticos, gris: el tono ya
// no significa nada y no vale la pena tratarlo como señal.
const CHROMA_EPSILON = 1e-4;

/**
 * Convierte un hex ('#RRGGBB' o '#RGB', case-insensitive) a OKLCH usando las
 * matrices de Björn Ottosson (sRGB→LMS→OKLab→OKLCH). Cualquier otra cosa
 * (falta el '#', longitud incorrecta, caracteres no hex, vacío, espacios,
 * o directamente un valor que no es string) devuelve null. Nunca lanza: un
 * hex corrupto en la fila de un negocio no puede tirar abajo el render.
 */
export function parseHexColor(hex: string): Oklch | null {
  if (typeof hex !== 'string') return null;
  const expanded = expandHex(hex);
  if (expanded === null) return null;

  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;

  const rl = linearize(r);
  const gl = linearize(g);
  const bl = linearize(b);

  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  const c = Math.sqrt(A * A + B * B);
  // Gris puro (croma ~0): el tono es matemáticamente indefinido y atan2(0,0)
  // devolvería 0 como si fuera un dato real. Se fija explícito en 0 para que
  // quede claro que es un valor por convención, no una medición, y para que
  // nada aguas abajo (rampa, CSS) reciba un NaN.
  const h = c < CHROMA_EPSILON ? 0 : normalizeHue((Math.atan2(B, A) * 180) / Math.PI);

  return { l: L, c, h };
}

// Luminosidad fija por escalón (decisión T2): la marca de la dueña aporta
// tono y croma, pero la legibilidad de cada escalón la garantiza el sistema.
const STEP_LIGHTNESS: Record<Exclude<BrandStep, 600>, number> = {
  50: 0.971,
  100: 0.936,
  500: 0.645,
  700: 0.514,
};

// Factor de croma por escalón, relativo al croma del color base.
const STEP_CHROMA_FACTOR: Record<BrandStep, number> = {
  50: 0.08,
  100: 0.18,
  500: 0.95,
  600: 1.0,
  700: 0.92,
};

// Banda de luminosidad donde el escalón 600 es legible tanto con texto claro
// como con texto oscuro encima. Fuera de esta banda el escalón 600 se recorta
// hacia el extremo más cercano, conservando el tono y el croma del usuario.
const USABLE_BAND_MIN = 0.45;
const USABLE_BAND_MAX = 0.72;

/** Luminosidad efectiva del escalón 600: la del usuario si cae en la banda usable, si no, la recorta (T2). */
function step600Lightness(baseLightness: number): number {
  return Math.min(USABLE_BAND_MAX, Math.max(USABLE_BAND_MIN, baseLightness));
}

/** Redondea a 4 decimales y quita ceros sobrantes, para que el CSS generado quede legible. */
function formatChannel(n: number): string {
  return Number(n.toFixed(4)).toString();
}

/**
 * Genera la rampa de marca a partir de un color base en OKLCH: conserva su
 * tono en los cinco escalones, fija la luminosidad de cada uno según el
 * sistema (excepto el 600 dentro de la banda usable, ver T2) y escala el
 * croma por escalón. El croma se reduce en los escalones claros (50, 100) a
 * propósito: mantener un croma alto con luminosidad alta se sale del gamut
 * sRGB, y el navegador lo recorta de forma impredecible — el resultado es un
 * pastel apagado y fuera de marca en vez del tono real de la dueña.
 * Pura: no muta `base` y con la misma entrada da siempre el mismo resultado.
 */
export function brandRamp(base: Oklch): Record<BrandStep, string> {
  const steps: BrandStep[] = [50, 100, 500, 600, 700];
  const ramp = {} as Record<BrandStep, string>;

  for (const step of steps) {
    const l = step === 600 ? step600Lightness(base.l) : STEP_LIGHTNESS[step];
    const c = base.c * STEP_CHROMA_FACTOR[step];
    ramp[step] = `oklch(${formatChannel(l)} ${formatChannel(c)} ${formatChannel(base.h)})`;
  }

  return ramp;
}

const FOREGROUND_LIGHTNESS_THRESHOLD = 0.62;
const DARK_FOREGROUND = 'oklch(0.22 0 0)';
const LIGHT_FOREGROUND = 'oklch(1 0 0)';

/**
 * Decide qué color de texto poner sobre un fondo de luminosidad dada
 * (decisión T4: se calcula, nunca se le pide a la dueña que lo elija).
 * Por encima del umbral el fondo es claro → texto oscuro; en el umbral o
 * por debajo, texto blanco.
 */
export function readableForeground(lightness: number): string {
  return lightness > FOREGROUND_LIGHTNESS_THRESHOLD ? DARK_FOREGROUND : LIGHT_FOREGROUND;
}

// Color base por defecto, precalculado una sola vez: es un hex fijo y válido
// que controlamos nosotros, así que el parseo nunca falla en la práctica.
const DEFAULT_OKLCH = parseHexColor(DEFAULT_BRAND_COLOR) as Oklch;

/**
 * Convierte el hex guardado en `business.theme_color` a las variables CSS
 * que consume `@theme` (T6). Ante cualquier entrada inválida, vacía, null o
 * undefined cae al color por defecto: un dato corrupto en la fila de un
 * negocio no puede dejar a toda la app sin estilos. Nunca lanza.
 */
export function themeCssVars(hex: string | null | undefined): Record<string, string> {
  const base = (typeof hex === 'string' ? parseHexColor(hex) : null) ?? DEFAULT_OKLCH;
  const ramp = brandRamp(base);
  const fgLightness = step600Lightness(base.l);

  return {
    '--color-brand-50': ramp[50],
    '--color-brand-100': ramp[100],
    '--color-brand-500': ramp[500],
    '--color-brand-600': ramp[600],
    '--color-brand-700': ramp[700],
    '--color-brand-fg': readableForeground(fgLightness),
  };
}
