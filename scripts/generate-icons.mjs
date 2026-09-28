#!/usr/bin/env node
// Genera los íconos de Citelis sin ImageMagick ni Pillow (no están instalados
// en esta máquina, ver T4 en odd/tasks/owner-push-notifications.md): dibuja un
// cuadrado sólido del color de marca por defecto (`DEFAULT_BRAND_COLOR` en
// src/lib/domain/theme.ts) con un anillo blanco centrado —geometría pura,
// nada de assets externos— y codifica el PNG a mano (chunks, CRC32 y el
// deflate de node:zlib). El anillo se queda dentro del 32% del radio, bien
// adentro de la "zona segura" que exige un ícono maskable (~40%).
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

/** RGBA de `size`x`size`: color de marca de fondo, anillo blanco en el centro. */
function renderPixels(size) {
  const center = size / 2;
  const outerR = size * 0.32;
  const innerR = size * 0.2;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const onRing = dist >= innerR && dist <= outerR;
      const color = onRing ? WHITE : BRAND_COLOR;
      const i = (y * size + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
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
