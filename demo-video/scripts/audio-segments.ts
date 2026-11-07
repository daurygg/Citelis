// Detecta tramos de voz por energía (RMS en ventanas de 10 ms) en cada WAV.
// Uso: npx tsx scripts/audio-segments.ts <dir> <out.json>
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [dir, out] = process.argv.slice(2);
const SR = 16000;
const WIN = SR / 100;

const decode = (file: string): Int16Array => {
  const tmp = join(tmpdir(), `seg-${process.pid}.wav`);
  execFileSync('npx', ['remotion', 'ffmpeg', '-y', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_s16le', tmp]);
  const b = readFileSync(tmp);
  const at = b.indexOf('data') + 8;
  return new Int16Array(b.buffer.slice(b.byteOffset + at, b.byteOffset + b.length - ((b.length - at) % 2)));
};

const result: Record<string, unknown> = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.wav')).sort()) {
  const pcm = decode(join(dir, f));
  const rms: number[] = [];
  for (let i = 0; i + WIN <= pcm.length; i += WIN) {
    let s = 0;
    for (let j = 0; j < WIN; j++) s += (pcm[i + j] / 32768) ** 2;
    rms.push(Math.sqrt(s / WIN));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const peak = sorted[Math.floor(sorted.length * 0.98)];
  const thr = Math.max(floor * 3, peak * 0.06);
  // Tramos de voz; huecos < 120 ms se funden.
  const segs: [number, number][] = [];
  let start = -1;
  let last = -1;
  rms.forEach((v, i) => {
    if (v > thr) {
      if (start < 0) start = i;
      else if (i - last > 12) {
        segs.push([start, last]);
        start = i;
      }
      last = i;
    }
  });
  if (start >= 0) segs.push([start, last]);
  result[f] = { duration: pcm.length / SR, floor, peak, thr, segs: segs.map(([a, b]) => [+(a / 100).toFixed(2), +((b + 1) / 100).toFixed(2)]) };
  console.log(f, 'dur', (pcm.length / SR).toFixed(2), 'thr', thr.toFixed(4), JSON.stringify((result[f] as any).segs));
}
writeFileSync(out, JSON.stringify(result, null, 1));
