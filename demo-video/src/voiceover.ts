import { staticFile, type CalculateMetadataFunction } from 'remotion';
import { ALL_FORMATS, Input, UrlSource } from 'mediabunny';
import { settings } from './config';
import { timeline } from './timing';

export type DemoProps = {
  /** Music path, or null when unset or unreadable. */
  music: string | null;
  subtitles: boolean;
};

/** Duration in seconds of a file under public/, or null if missing/unreadable. */
const audioSeconds = async (path?: string): Promise<number | null> => {
  if (!path) return null;
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(staticFile(path)) });
    const seconds = await input.computeDuration();
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    console.warn(`[music] "${path}" not found or unreadable; rendering without music.`);
    return null;
  }
};

export const defaultProps: DemoProps = { music: null, subtitles: settings.subtitles };

/** Total length comes from the voice cuts (voiceover-edits.json); only the music needs checking. */
export const calculateMetadata: CalculateMetadataFunction<DemoProps> = async ({ props }) => {
  const musicOk = (await audioSeconds(settings.music)) !== null;
  return {
    durationInFrames: timeline.total,
    props: { ...props, music: musicOk ? settings.music! : null },
  };
};
