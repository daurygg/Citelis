import { FPS, TRANSITION_FRAMES, keepSegments, sceneFrames, scenes, type SfxName } from './config';

export type VoicePlacement = { scene: number; start: number; duration: number; trimBefore: number };
export type SfxPlacement = { start: number; name: SfxName; volume: number };

/** Default level per effect (the WAVs peak around -12 dBFS; these keep them well under the voice). */
const SFX_LEVEL: Record<SfxName, number> = { whoosh: 0.5, pop: 0.55, tap: 0.7, ding: 0.75, riser: 0.4, sparkle: 0.5 };
const RISER_FRAMES = Math.round(1.3 * FPS);

/** Everything on the timeline in absolute frames, derived once from the config. */
const build = () => {
  const frames = scenes.map((s) => sceneFrames(s));
  const starts: number[] = [];
  let cursor = 0;
  frames.forEach((f, i) => {
    starts.push(cursor);
    cursor += f - TRANSITION_FRAMES;
  });
  const total = frames.reduce((s, f) => s + f, 0) - TRANSITION_FRAMES * (frames.length - 1);

  const voice: VoicePlacement[] = [];
  const sfx: SfxPlacement[] = [];
  scenes.forEach((scene, i) => {
    // Back-to-back keep segments; cumulative rounding so cuts never drift.
    let played = 0;
    for (const k of keepSegments(scene)) {
      const start = starts[i] + Math.round(played * FPS);
      played += k.to - k.from;
      voice.push({ scene: i, start, duration: starts[i] + Math.round(played * FPS) - start, trimBefore: Math.round(k.from * FPS) });
    }
    if (i > 0) sfx.push({ start: starts[i] - 2, name: 'whoosh', volume: SFX_LEVEL.whoosh });
    if (scene.type === 'phone') {
      for (const r of scene.rings ?? []) {
        if (r.sfx === 'none') continue;
        const name = r.sfx ?? 'pop';
        sfx.push({ start: starts[i] + Math.round(r.from * FPS), name, volume: SFX_LEVEL[name] });
      }
    }
    for (const e of scene.sfx ?? []) sfx.push({ start: starts[i] + Math.round(e.at * FPS), name: e.name, volume: e.volume ?? SFX_LEVEL[e.name] });
  });
  // Soft riser that lands on the outro.
  const outro = starts[starts.length - 1];
  sfx.push({ start: Math.max(0, outro - RISER_FRAMES + 3), name: 'riser', volume: SFX_LEVEL.riser });

  return { frames, starts, total, voice, sfx };
};

export const timeline = build();

/** Merged [start, end) windows where any voice segment plays, for music ducking. */
export const voiceWindows = (): [number, number][] => {
  const w: [number, number][] = [];
  for (const v of timeline.voice) {
    const last = w[w.length - 1];
    if (last && v.start <= last[1]) last[1] = Math.max(last[1], v.start + v.duration);
    else w.push([v.start, v.start + v.duration]);
  }
  return w;
};
