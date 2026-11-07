// Muestra duración de cada escena y cuánto se acelera/frena su captura. Uso: npx tsx scripts/pacing-report.ts
import { scenes, layersSeconds, voiceSeconds } from '../src/config';
import { timeline } from '../src/timing';

scenes.forEach((s, i) => {
  const dur = timeline.frames[i] / 30;
  const nat = s.type === 'phone' ? layersSeconds(s.layers) : 0;
  console.log(String(i + 1).padStart(2), s.type.padEnd(6), 'scene', dur.toFixed(2), 'voice', voiceSeconds(s).toFixed(2), nat ? `layers ${nat.toFixed(2)} stretch x${(dur / nat).toFixed(2)}` : '');
});
console.log('total', (timeline.total / 30).toFixed(2), 's', timeline.total, 'frames');
