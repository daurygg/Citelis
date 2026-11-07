import { staticFile, type CalculateMetadataFunction } from 'remotion';
import { ALL_FORMATS, Input, UrlSource } from 'mediabunny';
import { FPS, scenes, sceneFrames, settings, totalFrames } from './config';

export type DemoProps = {
  /** Frames per scene, voice-fitted. */
  sceneFrames: number[];
  /** Voice-over length in frames per scene, or null when the scene has no readable file. */
  voiceFrames: (number | null)[];
  /** Music path, or null when unset or unreadable. */
  music: string | null;
  subtitles: boolean;
};

/** Duration in seconds of a file under public/, or null if missing/unreadable. */
export const audioSeconds = async (path?: string): Promise<number | null> => {
  if (!path) return null;
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(staticFile(path)) });
    const seconds = await input.computeDuration();
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    console.warn(`[voiceover] "${path}" not found or unreadable; using fallback.`);
    return null;
  }
};

const fitFrames = async (): Promise<Pick<DemoProps, 'sceneFrames' | 'voiceFrames'>> => {
  const voice = await Promise.all(scenes.map((s) => audioSeconds(s.voiceover)));
  return {
    sceneFrames: scenes.map((s, i) => sceneFrames(s, voice[i])),
    voiceFrames: voice.map((v) => (v === null ? null : Math.ceil(v * FPS))),
  };
};

/** Props used before the studio measures any audio (silent fallback). */
export const defaultProps: DemoProps = {
  sceneFrames: scenes.map((s) => sceneFrames(s, null)),
  voiceFrames: scenes.map(() => null),
  music: null,
  subtitles: settings.subtitles,
};

export const calculateMetadata: CalculateMetadataFunction<DemoProps> = async ({ props }) => {
  const fitted = await fitFrames();
  const musicOk = (await audioSeconds(settings.music)) !== null;
  return {
    durationInFrames: totalFrames(fitted.sceneFrames),
    props: { ...props, ...fitted, music: musicOk ? settings.music! : null },
  };
};
