// Transcribe con Whisper local (transformers.js + onnxruntime), con marcas de tiempo por palabra.
// Uso: npx tsx scripts/transcribe.ts <in.wav|dir> <out.json> [modelo]
import { pipeline, env } from '@huggingface/transformers';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

env.cacheDir = join(import.meta.dirname, '..', '.cache', 'models');

const [input, output, model = 'Xenova/whisper-small'] = process.argv.slice(2);

// El ffmpeg de Remotion no tiene muxer f32le: se decodifica a un wav temporal PCM 16-bit mono 16 kHz.
const decode = (file: string): Float32Array => {
  const tmp = join(tmpdir(), `whisper-${process.pid}.wav`);
  execFileSync('npx', ['remotion', 'ffmpeg', '-y', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', tmp]);
  const b = readFileSync(tmp);
  const at = b.indexOf('data') + 8; // salta chunks LIST/INFO
  const pcm = new Int16Array(b.buffer.slice(b.byteOffset + at, b.byteOffset + b.length - ((b.length - at) % 2)));
  return Float32Array.from(pcm, (v) => v / 32768);
};

const files = statSync(input).isDirectory()
  ? readdirSync(input).filter((f) => f.endsWith('.wav')).sort().map((f) => join(input, f))
  : [input];

const asr = await pipeline('automatic-speech-recognition', model);
const out: Record<string, unknown> = {};
for (const f of files) {
  const r: any = await asr(decode(f), { language: 'spanish', task: 'transcribe', return_timestamps: 'word', chunk_length_s: 30 });
  out[f.split('/').pop()!] = { text: r.text.trim(), words: r.chunks.map((c: any) => ({ w: c.text.trim(), s: c.timestamp[0], e: c.timestamp[1] })) };
  console.log(f.split('/').pop(), '|', r.text.trim());
}
writeFileSync(output, JSON.stringify(out, null, 1));
