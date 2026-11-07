// Genera voiceover-edits.json: tramos a conservar de cada toma (no destructivo; los WAV originales no se tocan).
// Uso: npx tsx scripts/plan-voice-edits.ts <segments.json> <transcript.json> <out.json>
//   segments.json: salida de scripts/audio-segments.ts · transcript.json: salida de scripts/transcribe.ts
import { readFileSync, writeFileSync } from 'node:fs';

const [segFile, trFile, out] = process.argv.slice(2);
const segs = JSON.parse(readFileSync(segFile, 'utf8')) as Record<string, { duration: number; segs: [number, number][] }>;
const tr = JSON.parse(readFileSync(trFile, 'utf8')) as Record<string, { text: string }>;

const LEAD = 0.1; // silencio conservado antes de la primera palabra
const TRAIL = 0.12; // y después de la última
const LONG_GAP = 0.6; // pausas más largas que esto se comprimen
const KEPT_GAP = 0.35; // ...a esto

/** Decisiones por toma: cuántos tramos iniciales se descartan y por qué. */
const overrides: Record<string, { dropLeading?: number; note: string }> = {
  '01-hook': { dropLeading: 2, note: 'Se quitaron un soplido inicial y un "Ok" alargado (0.7 s) antes de "¿Empiezas con Citelis?"; la toma empieza en la frase buena.' },
  '02-signup': { note: 'Toma limpia, una sola pasada. Solo se recortó el silencio del inicio y el final.' },
  '03-owner-profile': { note: 'Toma limpia, una sola pasada. Solo se recortó el silencio del inicio y el final.' },
  '04-wizard': { note: 'Toma limpia. Se recortó el silencio; la pausa antes de "¡Listo!" se conserva porque es el énfasis.' },
  '05-services': { note: 'Toma limpia. Se recortó el silencio del inicio y el final.' },
  '06-schedule': { note: 'Toma limpia. Se recortó el silencio del inicio y el final.' },
  '07-day': { dropLeading: 1, note: 'Se quitó el primer intento cortado ("Cada día ves lo ga…"); queda la segunda toma completa, confirmada por el usuario.' },
  '08-charge': { note: 'Toma limpia. Se recortó el silencio del inicio y el final.' },
  '09-online-booking': { note: 'Toma limpia. Se recortó 0.45 s de silencio al final.' },
  '10-report': { note: 'Toma limpia. Se recortó el silencio del inicio y el final.' },
  '11-outro': { dropLeading: 1, note: 'Se quitó un "Y" suelto antes de "Eso es todo" (0.2 s); el resto igual.' },
};

const r = (n: number) => Math.round(n * 1000) / 1000;
const result: Record<string, unknown> = {};
for (const [file, info] of Object.entries(segs)) {
  const id = file.replace('.wav', '');
  const o = overrides[id];
  const speech = info.segs.slice(o?.dropLeading ?? 0);
  const keep: { from: number; to: number }[] = [];
  let from = Math.max(0, speech[0][0] - LEAD);
  speech.forEach(([, end], i) => {
    const next = speech[i + 1];
    if (!next) return keep.push({ from: r(from), to: r(Math.min(info.duration, end + TRAIL)) });
    if (next[0] - end > LONG_GAP) {
      keep.push({ from: r(from), to: r(end + KEPT_GAP / 2) });
      from = next[0] - KEPT_GAP / 2;
    }
  });
  const kept = keep.reduce((s, k) => s + k.to - k.from, 0);
  result[id] = {
    file: `voiceover/${file}`,
    original_seconds: r(info.duration),
    kept_seconds: r(kept),
    transcript: tr[file]?.text ?? '',
    speech_segments: info.segs,
    keep,
    note: o?.note ?? '',
  };
  console.log(id, info.duration.toFixed(2), '->', kept.toFixed(2), JSON.stringify(keep));
}
writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
