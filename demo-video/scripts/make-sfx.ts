// Sintetiza los efectos de sonido (sin descargas). Uso: npx tsx scripts/make-sfx.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SR = 44100;
const OUT = join(import.meta.dirname, '..', 'public', 'sfx');
mkdirSync(OUT, { recursive: true });

// Ruido determinista para que los renders sean reproducibles.
let seed = 1234567;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

const PEAK = 0.25; // ~ -12 dBFS

const write = (name: string, samples: Float32Array) => {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  const gain = max > 0 ? PEAK / max : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), 44 + i * 2));
  writeFileSync(join(OUT, `${name}.wav`), buf);
  console.log(name, (samples.length / SR).toFixed(2) + 's');
};

const make = (seconds: number, f: (t: number, i: number) => number) => {
  const a = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < a.length; i++) a[i] = f(i / SR, i);
  return a;
};

/** Paso bajo/paso banda de un polo para ruido filtrado con frecuencia variable. */
const swept = (seconds: number, freq: (t: number) => number, env: (t: number) => number) => {
  let lp = 0;
  let bp = 0;
  return make(seconds, (t) => {
    const k = Math.min(0.99, (2 * Math.PI * freq(t)) / SR);
    const x = rnd();
    lp += k * (x - lp);
    bp += k * (lp - bp);
    return (lp - bp) * 4 * env(t);
  });
};

const sine = (f: number, t: number) => Math.sin(2 * Math.PI * f * t);
const expEnv = (decay: number) => (t: number) => Math.exp(-t * decay);

// whoosh: ruido con barrido ascendente-descendente, ataque suave.
write('whoosh', swept(0.38, (t) => 500 + 3500 * Math.sin(Math.PI * Math.min(1, t / 0.38)), (t) => Math.sin(Math.PI * Math.min(1, t / 0.38)) ** 1.5));

// pop: seno con caída rápida de tono (burbuja).
write('pop', make(0.16, (t) => sine(380 + 700 * Math.exp(-t * 40), t) * Math.exp(-t * 28) * Math.min(1, t * 800)));

// tap: clic corto y sordo.
write('tap', make(0.09, (t) => (sine(180 * Math.exp(-t * 30) + 90, t) * 0.8 + rnd() * 0.25 * Math.exp(-t * 120)) * Math.exp(-t * 45) * Math.min(1, t * 1500)));

// ding: dos notas (E6 -> A6) con armónico brillante, estilo "cobro".
const note = (f: number, t: number, decay: number) => (sine(f, t) + 0.35 * sine(f * 2.01, t) + 0.15 * sine(f * 3.02, t)) * Math.exp(-t * decay) * Math.min(1, t * 1000);
write('ding', make(0.9, (t) => note(1318.5, t, 7) * 0.8 + (t > 0.11 ? note(1760, t - 0.11, 6) : 0)));

// riser: ruido filtrado que sube y crece hacia el final.
write('riser', swept(1.3, (t) => 300 + 5000 * (t / 1.3) ** 2, (t) => (t / 1.3) ** 2 * Math.min(1, (1.3 - t) * 25)));

// sparkle: tintineo suave para textos que aparecen.
write('sparkle', make(0.35, (t) => (sine(2093, t) * Math.exp(-t * 14) + 0.6 * sine(2637, t - 0.06) * (t > 0.06 ? Math.exp(-(t - 0.06) * 14) : 0)) * Math.min(1, t * 1000)));
