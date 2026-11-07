// Sintetiza la música de fondo (pop luminoso / future bass suave) sin descargas ni servicios externos.
// Uso: npx tsx scripts/make-music.ts  ->  public/music/citelis-theme.wav (44.1 kHz, 16-bit estéreo, pico ~ -3 dBFS)
// Determinista: RNG con semilla, dos corridas dan el mismo archivo. Las secciones se alinean con las escenas del video.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { timeline } from '../src/timing';
import { FPS } from '../src/config';

const SR = 44100;
const OUTRO_START = timeline.starts[timeline.starts.length - 1] / FPS; // segundos
const BARS_TO_OUTRO = 27; // el golpe final cae exactamente al inicio de la escena 11
const BAR = OUTRO_START / BARS_TO_OUTRO; // ~2.17 s -> ~110.6 BPM
const BEAT = BAR / 4;
const BPM = 60 / BEAT;
const TOTAL_BARS = 29; // 27 + 2 de cola
const LEN = Math.ceil((TOTAL_BARS * BAR + 2.5) * SR); // + cola de reverb

let s = 20261106;
const rnd = () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
};

const buf = () => new Float32Array(LEN);
const kickB = buf(), clapB = buf(), hatB = buf(), bassB = buf(), padL = buf(), padR = buf(), arpL = buf(), arpR = buf(), leadB = buf(), fxB = buf();
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const at = (sec: number) => Math.round(sec * SR);
const bt = (bar: number, beat: number) => bar * BAR + beat * BEAT;

// --- Estructura (en compases) ---
const INTRO_END = 2; // el groove entra con la escena 2
const BREAK = [12, 16]; // escenas 6-7: sin batería ni bajo
const BUILD = 26; // redoble hacia la escena 11
const isBreak = (b: number) => b >= BREAK[0] && b < BREAK[1];

// Progresión I-V-vi-IV en Do mayor; intro = vi-IV para caer en Do al entrar el groove.
const CHORDS = [
  { root: 36, bass: 36, pad: [60, 64, 67], tones: [72, 76, 79, 84], lead: [76, 79, 84, 79] }, // C
  { root: 43, bass: 43, pad: [59, 62, 67], tones: [71, 74, 79, 83], lead: [74, 79, 83, 79] }, // G
  { root: 33, bass: 33, pad: [57, 60, 64], tones: [69, 72, 76, 81], lead: [72, 76, 81, 76] }, // Am
  { root: 41, bass: 41, pad: [57, 60, 65], tones: [69, 72, 77, 81], lead: [72, 77, 81, 77] }, // F
];
const chordAt = (bar: number) => {
  if (bar < INTRO_END) return CHORDS[2 + bar]; // Am, F
  if (bar === BUILD) return CHORDS[1]; // G antes del golpe
  if (bar >= 27) return CHORDS[[0, 3, 0][bar - 27]]; // C, F, C (cola que termina en la tónica)
  return CHORDS[(bar - 2) % 4];
};

// --- Instrumentos ---
const kick = (t0: number, vel = 1) => {
  const n = at(0.4);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (48 + 100 * Math.exp(-t * 28))) / SR;
    kickB[at(t0) + i] += Math.sin(ph) * Math.exp(-t * 9) * vel * Math.min(1, t * 400);
  }
};
const clap = (t0: number, vel = 1) => {
  let lp = 0, bp = 0;
  const n = at(0.25);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const k = 0.35;
    lp += k * (rnd() - lp);
    bp += 0.5 * (lp - bp);
    const burst = Math.exp(-((t % 0.011) * 150)) * (t < 0.033 ? 1 : 0); // tres golpes rápidos
    const env = burst * 0.6 + Math.exp(-t * 18);
    clapB[at(t0) + i] += (lp - bp) * 3 * env * vel * 0.8;
  }
};
const hat = (t0: number, vel: number) => {
  const n = at(0.06);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const x = rnd();
    const hp = x - prev; // paso alto suave
    prev = x;
    hatB[at(t0) + i] += hp * 0.5 * Math.exp((-i / SR) * 70) * vel;
  }
};
const bass = (t0: number, dur: number, m: number, vel = 1) => {
  const n = at(dur);
  const f = hz(m);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t * 200) * Math.min(1, (dur - t) * 60) * (0.6 + 0.4 * Math.exp(-t * 6));
    const v = Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 5);
    bassB[at(t0) + i] += v * env * vel * 0.8;
  }
};
const pad = (t0: number, dur: number, m: number, vel = 1) => {
  const n = at(dur) + at(0.4);
  const f = hz(m);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.35) * (t < dur ? 1 : Math.exp(-(t - dur) * 8));
    let l = 0, r = 0;
    for (const [det, pan] of [[-0.12, -0.6], [0, 0], [0.12, 0.6]] as const) {
      const ff = f * 2 ** (det / 12);
      const saw = 2 * ((ff * t) % 1) - 1;
      const tri = Math.abs(4 * ((ff * t + 0.25) % 1) - 2) - 1;
      const v = (0.6 * saw + 0.4 * tri) * 0.16;
      l += v * (1 - pan) * 0.5 + v * 0.5;
      r += v * (1 + pan) * 0.5 + v * 0.5;
    }
    padL[at(t0) + i] += l * env * vel;
    padR[at(t0) + i] += r * env * vel;
  }
};
const pluck = (t0: number, m: number, vel: number, pan: number, decay = 9) => {
  const n = at(0.5);
  const f = hz(m);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const saw = 2 * ((f * t) % 1) - 1;
    const tri = Math.abs(4 * ((f * t + 0.25) % 1) - 2) - 1;
    const cut = 0.05 + 0.4 * Math.exp(-t * 14); // el brillo cae rápido: no es áspero
    lp += cut * ((0.5 * saw + 0.5 * tri) - lp);
    const v = lp * Math.exp(-t * decay) * Math.min(1, t * 600) * vel * 0.5;
    arpL[at(t0) + i] += v * (1 - pan) * 0.5 + v * 0.3;
    arpR[at(t0) + i] += v * (1 + pan) * 0.5 + v * 0.3;
  }
};
const lead = (t0: number, dur: number, m: number, vel: number) => {
  const n = at(dur + 0.2);
  const f = hz(m);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = 1 + 0.003 * Math.sin(2 * Math.PI * 5 * t) * Math.min(1, t * 3);
    const env = Math.min(1, t * 80) * (t < dur ? 1 : Math.exp(-(t - dur) * 12)) * (0.7 + 0.3 * Math.exp(-t * 3));
    const v = Math.sin(2 * Math.PI * f * vib * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 4);
    leadB[at(t0) + i] += v * env * vel * 0.22;
  }
};
const noiseRiser = (t0: number, dur: number, vel: number) => {
  const n = at(dur);
  let lp = 0, bp = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const k = Math.min(0.9, (2 * Math.PI * (400 + 5000 * p * p)) / SR);
    lp += k * (rnd() - lp);
    bp += k * (lp - bp);
    fxB[at(t0) + i] += (lp - bp) * 4 * p * p * vel;
  }
};
const crash = (t0: number, vel: number) => {
  const n = at(1.8);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const x = rnd();
    const hp = x - prev * 0.9;
    prev = x;
    fxB[at(t0) + i] += hp * 0.25 * Math.exp((-i / SR) * 2.6) * vel;
  }
};

// --- Partitura ---
const kickTimes: number[] = []; // para el bombeo (sidechain)
for (let bar = 0; bar < TOTAL_BARS; bar++) {
  const c = chordAt(bar);
  const intro = bar < INTRO_END;
  const brk = isBreak(bar);
  const build = bar === BUILD;
  const outro = bar >= 27;
  const final = bar === TOTAL_BARS - 1;
  const groove = !intro && !brk && !build && !final;

  // Pad: acorde sostenido todo el compás (ligeramente recortado para respirar).
  const padVel = intro ? 0.7 : brk ? 1.1 : 0.9;
  for (const m of c.pad) pad(bt(bar, 0), final ? BAR * 1.2 : BAR * 0.98, m, padVel);

  // Batería
  if (groove || (outro && !final)) {
    for (let b = 0; b < 4; b++) {
      kick(bt(bar, b), 1);
      kickTimes.push(bt(bar, b));
    }
    clap(bt(bar, 1), 0.9);
    clap(bt(bar, 3), 0.9);
  }
  if (bar === 27) {
    // golpe sobre la escena 11
    kick(bt(27, 0), 1.1);
    crash(bt(27, 0), 1);
  }
  if (final) {
    kick(bt(bar, 0), 1.1);
    kickTimes.push(bt(bar, 0));
    crash(bt(bar, 0), 0.6);
  }
  if (build) {
    // medio compás de bombo y luego redoble de corcheas/semicorcheas con velocidad creciente
    kick(bt(bar, 0), 1);
    kickTimes.push(bt(bar, 0));
    kick(bt(bar, 1), 1);
    kickTimes.push(bt(bar, 1));
    for (let i = 0; i < 12; i++) clap(bt(bar, 2) + (i * BEAT) / 6, 0.35 + (i / 12) * 0.6);
    noiseRiser(bt(bar, 0), BAR, 0.35);
  }
  // Hi-hats con swing y velocidad variable
  if (!final && (bar >= 1)) {
    const soft = intro || brk ? 0.45 : 1;
    for (let i = 0; i < 8; i++) {
      const swing = i % 2 ? BEAT * 0.5 * 0.14 : 0;
      const accent = i % 2 ? 0.85 : 0.6;
      hat(bt(bar, i * 0.5) + swing, (0.5 + 0.4 * Math.abs(rnd())) * accent * soft);
    }
    if (groove || outro) hat(bt(bar, 3.75), 0.35); // semicorchea de relleno
  }

  // Bajo: raíces con síncopa
  if (groove || (outro && !final)) {
    bass(bt(bar, 0), BEAT * 0.9, c.bass, 1);
    bass(bt(bar, 1.5), BEAT * 0.45, c.bass, 0.8);
    bass(bt(bar, 2.5), BEAT * 0.45, c.bass + 12, 0.7);
    bass(bt(bar, 3), BEAT * 0.9, c.bass, 0.85);
  }
  if (final) bass(bt(bar, 0), BAR * 1.1, c.bass, 1);

  // Arpegio pluck con máscara sincopada
  if (bar >= 1 && !final) {
    const pattern = [0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 3, 2, 1, 0, 1];
    const mask = [1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0];
    const arpVel = intro ? 0.3 : brk ? 0.8 : 0.65;
    for (let i = 0; i < 16; i++) {
      if (!mask[i]) continue;
      const swing = i % 2 ? BEAT * 0.25 * 0.12 : 0;
      pluck(bt(bar, i * 0.25) + swing, c.tones[pattern[i]], arpVel * (0.7 + 0.3 * ((i + 1) % 4 === 1 ? 1 : 0.6)), Math.sin(i * 1.3) * 0.5);
    }
  }
  if (final) pluck(bt(bar, 0), c.tones[0], 0.8, 0, 3);

  // Melodía (pluck suave) en la segunda mitad del primer bloque y en el último
  const melodyOn = (bar >= 6 && bar < 12) || (bar >= 16 && bar < 26) || bar === 27 || bar === 28;
  if (melodyOn) {
    const beats = [0, 1.5, 2, 3];
    c.lead.forEach((m, i) => lead(bt(bar, beats[i]), i === 3 ? BEAT * 0.9 : BEAT * 0.45, m, 0.8));
  }
  if (final) lead(bt(bar, 0), BAR * 0.9, 84, 0.7);
}
noiseRiser(bt(BUILD, 0), BAR, 0.0); // (el riser real va en el compás de build, arriba)

// --- Mezcla ---
// Bombeo: los instrumentos tonales bajan con cada bombo y vuelven en ~0.25 s.
const pump = new Float32Array(LEN).fill(1);
for (const t0 of kickTimes) {
  const a = at(t0);
  for (let i = 0; i < at(0.35) && a + i < LEN; i++) pump[a + i] = Math.min(pump[a + i], 1 - 0.55 * Math.exp((-i / SR) * 11));
}

// Filtro paso bajo del pad con apertura progresiva (intro cerrado -> abierto).
const cutoffAt = (t: number) => {
  const bar = t / BAR;
  if (bar < INTRO_END) return 350 + (bar / INTRO_END) * 900;
  if (bar < BREAK[0]) return 2200;
  if (bar < BREAK[1]) return 1600;
  return 2400;
};
let fl = 0, fr = 0;
for (let i = 0; i < LEN; i++) {
  const k = 1 - Math.exp((-2 * Math.PI * cutoffAt(i / SR)) / SR);
  fl += k * (padL[i] - fl);
  fr += k * (padR[i] - fr);
  padL[i] = fl;
  padR[i] = fr;
}

// Delay ping-pong (3/8 de tiempo) y reverb (peines + pasa-todo) para el arpegio, la melodía y el clap.
const dly = at(BEAT * 0.75);
const dL = buf(), dR = buf();
for (let i = 0; i < LEN; i++) {
  const inL = arpL[i] + leadB[i] * 0.5;
  const inR = arpR[i] + leadB[i] * 0.5;
  const fbL = i >= dly ? dR[i - dly] * 0.38 : 0;
  const fbR = i >= dly ? dL[i - dly] * 0.38 : 0;
  dL[i] = inL * 0.5 + fbL;
  dR[i] = inR * 0.5 + fbR;
}
const reverb = (src: Float32Array, offset: number) => {
  const combs = [1557, 1617, 1491, 1422].map((d) => d + offset);
  const outB = buf();
  for (const d of combs) {
    const line = new Float32Array(LEN);
    let lpf = 0;
    for (let i = 0; i < LEN; i++) {
      const fb = i >= d ? line[i - d] : 0;
      lpf += 0.4 * (fb - lpf); // amortigua los agudos de la cola
      line[i] = src[i] + lpf * 0.8;
      outB[i] += line[i] * 0.25;
    }
  }
  for (const d of [225 + offset, 556 + offset]) {
    const line = new Float32Array(LEN);
    const o = new Float32Array(LEN);
    for (let i = 0; i < LEN; i++) {
      const x = outB[i];
      const dl = i >= d ? line[i - d] : 0;
      const y = -x + dl;
      line[i] = x + dl * 0.5;
      o[i] = y;
    }
    outB.set(o);
  }
  return outB;
};
const sendL = buf(), sendR = buf();
for (let i = 0; i < LEN; i++) {
  const m = arpL[i] * 0.5 + arpR[i] * 0.5 + leadB[i] * 0.6 + clapB[i] * 0.5 + fxB[i] * 0.3;
  sendL[i] = m;
  sendR[i] = m;
}
const revL = reverb(sendL, 0), revR = reverb(sendR, 23);

const L = buf(), R = buf();
for (let i = 0; i < LEN; i++) {
  const center = kickB[i] * 0.95 + clapB[i] * 0.55 + hatB[i] * 0.35 + bassB[i] * 0.85 * pump[i] + leadB[i] * 0.55 + fxB[i] * 0.5;
  L[i] = center + padL[i] * pump[i] * 1.0 + arpL[i] * 0.55 + dL[i] * 0.45 + revL[i] * 0.5;
  R[i] = center + padR[i] * pump[i] * 1.0 + arpR[i] * 0.55 + dR[i] * 0.45 + revR[i] * 0.5;
}

// Master: paso alto 30 Hz, paso bajo suave ~11 kHz, saturación suave y normalizado a -3 dBFS.
let hl = 0, hr = 0, ll = 0, lr = 0;
const kHp = 1 - Math.exp((-2 * Math.PI * 30) / SR);
const kLp = 1 - Math.exp((-2 * Math.PI * 11000) / SR);
let peak = 0;
for (let i = 0; i < LEN; i++) {
  hl += kHp * (L[i] - hl);
  hr += kHp * (R[i] - hr);
  ll += kLp * (L[i] - hl - ll);
  lr += kLp * (R[i] - hr - lr);
  L[i] = Math.tanh(ll * 0.9);
  R[i] = Math.tanh(lr * 0.9);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = 10 ** (-3 / 20) / peak;
const fadeOut = at(0.5);
const data = Buffer.alloc(44 + LEN * 4);
data.write('RIFF', 0);
data.writeUInt32LE(36 + LEN * 4, 4);
data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(2, 22);
data.writeUInt32LE(SR, 24);
data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  const f = Math.min(1, (LEN - i) / fadeOut); // los últimos 0.5 s se apagan a cero
  data.writeInt16LE(Math.round(L[i] * gain * f * 32767), 44 + i * 4);
  data.writeInt16LE(Math.round(R[i] * gain * f * 32767), 46 + i * 4);
}
const dir = join(import.meta.dirname, '..', 'public', 'music');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'citelis-theme.wav'), data);
console.log(`citelis-theme.wav ${(LEN / SR).toFixed(1)}s, ${BPM.toFixed(1)} BPM, bar ${BAR.toFixed(3)}s, outro hit at ${OUTRO_START.toFixed(2)}s, pre-gain peak ${peak.toFixed(2)}`);
