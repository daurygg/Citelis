#!/usr/bin/env node
// Genera los íconos de Citelis sin ImageMagick ni Pillow (no están instalados
// en esta máquina, ver T4 en odd/tasks/owner-push-notifications.md): dibuja un
// cuadrado sólido del color de marca por defecto (`DEFAULT_BRAND_COLOR` en
// src/lib/domain/theme.ts) con el logo "Reloj-C" en blanco —una C que es un
// reloj, con sus agujas, y un punto que la cierra (la próxima cita)— por
// geometría pura (distancias a arcos, segmentos y círculos), con suavizado por
// supermuestreo 4x4, y codifica el PNG a mano (chunks, CRC32 y el deflate de
// node:zlib). Es la misma geometría que `public/icons/icon.svg`, reducida al
// 85% para que todo quede dentro del 39% del radio: la "zona segura" de un
// ícono maskable (~40%).
//
// Los tres íconos son completamente opacos (alpha = 255 en cada píxel): así
// `apple-touch-icon.png` cumple la regla de iOS de no llevar transparencia,
// sin necesitar un encoder aparte.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mismo valor que DEFAULT_BRAND_COLOR en src/lib/domain/theme.ts.
const BRAND_COLOR = { r: 0xe1, g: 0x1d, b: 0x48 };
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Tabla de CRC32 precalculada (spec PNG, Anexo D).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Geometría del logo en un lienzo de 100x100 (la misma de public/icons/icon.svg).
const GLYPH_SCALE = 0.85; // reducción alrededor del centro para la zona segura maskable
const ARC = { cx: 50, cy: 50, r: 28, half: 5.5, gapDeg: 40 }; // la C: abierta ±40° a la derecha
const ARC_ENDS = [
  { x: 71.45, y: 68 },
  { x: 71.45, y: 32 },
];
const HANDS = [
  { ax: 50, ay: 50, bx: 50, by: 35 }, // aguja larga, hacia arriba
  { ax: 50, ay: 50, bx: 60, by: 50 }, // aguja corta, hacia la derecha
];
const HAND_HALF = 3.5;
const DOT = { cx: 84, cy: 50, r: 4.5 }; // el punto que cierra la C: la próxima cita
const SUPERSAMPLE = 4;

function distToSegment(px, py, { ax, ay, bx, by }) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** ¿El punto (x, y) del lienzo 100x100 cae sobre el trazo blanco del logo? */
function onGlyph(x, y) {
  // Deshace la reducción: el logo se dibuja al 85% alrededor del centro.
  const px = 50 + (x - 50) / GLYPH_SCALE;
  const py = 50 + (y - 50) / GLYPH_SCALE;

  const dx = px - ARC.cx;
  const dy = py - ARC.cy;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (Math.abs(angle) > ARC.gapDeg && Math.abs(Math.hypot(dx, dy) - ARC.r) <= ARC.half) return true;
  if (ARC_ENDS.some((e) => Math.hypot(px - e.x, py - e.y) <= ARC.half)) return true; // puntas redondas
  if (HANDS.some((h) => distToSegment(px, py, h) <= HAND_HALF)) return true;
  return Math.hypot(px - DOT.cx, py - DOT.cy) <= DOT.r;
}

/** RGBA de `size`x`size`: color de marca de fondo y el logo Reloj-C en blanco, suavizado. */
function renderPixels(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const unit = 100 / size;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const ux = (x + (sx + 0.5) / SUPERSAMPLE) * unit;
          const uy = (y + (sy + 0.5) / SUPERSAMPLE) * unit;
          if (onGlyph(ux, uy)) hits++;
        }
      }
      const a = hits / samples; // cobertura del blanco sobre el color de marca
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(BRAND_COLOR.r + (WHITE.r - BRAND_COLOR.r) * a);
      pixels[i + 1] = Math.round(BRAND_COLOR.g + (WHITE.g - BRAND_COLOR.g) * a);
      pixels[i + 2] = Math.round(BRAND_COLOR.b + (WHITE.b - BRAND_COLOR.b) * a);
      pixels[i + 3] = 255; // opaco siempre: ningún ícono lleva transparencia
    }
  }
  return pixels;
}

function encodePng(size) {
  const raw = renderPixels(size);
  const stride = size * 4;
  // Cada scanline lleva un byte de filtro delante (0 = sin filtro).
  const withFilter = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    withFilter[y * (stride + 1)] = 0;
    raw.copy(withFilter, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const compressed = deflateSync(withFilter);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // ancho
  ihdr.writeUInt32BE(size, 4); // alto
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // color type 6 = RGBA
  ihdr[10] = 0; // método de compresión
  ihdr[11] = 0; // método de filtro
  ihdr[12] = 0; // sin entrelazado

  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, '..', 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of targets) {
  writeFileSync(join(iconsDir, file), encodePng(size));
  console.log(`✓ ${file} (${size}x${size})`);
}
