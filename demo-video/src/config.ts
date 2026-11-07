import edits from '../voiceover-edits.json';

export const FPS = 30;
/** Fast transitions: 9 frames (0.3 s). */
export const TRANSITION_FRAMES = 9;
/** Silence after the last kept voice segment before the scene ends. */
export const TAIL_SECONDS = 0.3;

/** Size of every capture (phone portrait, 2x of 390x844). */
export const CAPTURE_W = 780;
export const CAPTURE_H = 1688;

/** Fields shared by every scene. */
type VoiceFields = {
  /** Recording under public/, e.g. 'voiceover/01-hook.wav'. Its keep-segments live in voiceover-edits.json. */
  voiceover?: string;
  /** Line burned in at the bottom when `settings.subtitles` is true (usually the script line). */
  subtitle?: string;
};

/** One piece of what plays inside the phone screen. Layers play one after another. */
export type Layer =
  | {
      kind: 'image';
      src: string; // under public/, e.g. 'captures/agenda.png'
      seconds: number;
      /** Visible window top, in source px, at scrollFrom and scrollTo (defaults: whole layer). */
      y0?: number;
      y1?: number;
      scrollFrom?: number;
      scrollTo?: number;
    }
  | {
      kind: 'video';
      src: string;
      /** Source range in seconds, played at `rate`. */
      from: number;
      to: number;
      rate: number;
    };

/** Camera move inside the screen. x/y are % of the visible screen (the origin of the zoom). */
export type Zoom = { at: number; scale: number; x: number; y: number; dur?: number };
/** Highlight box in % of the visible screen, visible between from..to (seconds). */
export type Ring = { sfx?: 'pop' | 'ding' | 'none'; from: number; to: number; x: number; y: number; w: number; h: number; label?: string; labelSide?: 'below' | 'below-left' | 'above' | 'right' };

/** Sound effect at `at` seconds of the scene. */
export type SceneSfx = { at: number; name: SfxName; volume?: number };
export type SfxName = 'whoosh' | 'pop' | 'tap' | 'ding' | 'riser' | 'sparkle';

export type SceneConfig = VoiceFields & { sfx?: SceneSfx[] } &
  (
    | { type: 'hook'; seconds: number; lines: string[]; sub: string; subAt: number }
    | {
        type: 'phone';
        seconds: number;
        title: string;
        side: 'left' | 'right'; // landscape only: where the phone sits
        layers: Layer[];
        /** Fraction of the capture height cropped from the top (hides banners). */
        cropTop?: number;
        zooms?: Zoom[];
        rings?: Ring[];
      }
    | { type: 'outro'; seconds: number; logo: string; title: string; cta: string }
  );

export const settings: {
  /** Background track under public/, e.g. 'music/bed.mp3'. Missing file: no music. */
  music?: string;
  /** Burn the scene `subtitle` into the video. */
  subtitles: boolean;
} = {
  music: 'music/citelis-theme.wav',
  subtitles: false,
};

export const layerSeconds = (l: Layer): number => (l.kind === 'image' ? l.seconds : (l.to - l.from) / l.rate);
export const layersSeconds = (layers: Layer[]): number => layers.reduce((s, l) => s + layerSeconds(l), 0);

/** Converts a y given in capture % to visible-screen % for a scene cropped by `cropTop`. */
export const cy = (y: number, cropTop: number): number => (y - cropTop * 100) / (1 - cropTop);

// --- Voice-over clock -------------------------------------------------------------------------------------------

export type Keep = { from: number; to: number };
type EditId = keyof typeof edits;

const voiceId = (scene: SceneConfig): EditId | null => {
  const id = scene.voiceover?.replace(/^voiceover\//, '').replace(/\.\w+$/, '') as EditId | undefined;
  return id && id in edits ? id : null;
};

/** Kept segments of a scene's recording (seconds inside the file), in playback order. */
export const keepSegments = (scene: SceneConfig): Keep[] => {
  const id = voiceId(scene);
  return id ? (edits[id].keep as Keep[]) : [];
};

/** Spoken stretches of a scene (seconds, scene time), from the energy analysis; dropped fillers are excluded. */
export const speechSpans = (scene: SceneConfig): [number, number][] => {
  const id = voiceId(scene);
  if (!id) return [];
  const keeps = edits[id].keep as Keep[];
  return (edits[id].speech_segments as [number, number][])
    .filter(([a, b]) => keeps.some((k) => a >= k.from - 1e-6 && b <= k.to + 1e-6))
    .map(([a, b]) => [vt(id, a), vt(id, b)]);
};

/** Seconds of voice that actually play in the scene (after the cuts). */
export const voiceSeconds = (scene: SceneConfig): number => keepSegments(scene).reduce((s, k) => s + k.to - k.from, 0);

/**
 * Maps a time in the original recording to scene time (seconds) after the cuts.
 * Use it to pin highlights to the word that names them: `vt('08-charge', 2.3)`.
 */
export const vt = (id: EditId, fileSeconds: number): number => {
  let offset = 0;
  for (const k of edits[id].keep as Keep[]) {
    if (fileSeconds < k.from) return offset;
    if (fileSeconds <= k.to) return offset + fileSeconds - k.from;
    offset += k.to - k.from;
  }
  return offset;
};

// --- Scenes -----------------------------------------------------------------------------------------------------

const secs = (layers: Layer[]) => Math.round(layersSeconds(layers) * 100) / 100;

const SCHEDULE_CROP = 0.24; // hides the trial banner of the real app

// Rates <= 1.25 mark the key moments (taps, results); the waiting/typing stretches run up to ~2x.
const scheduleLayers: Layer[] = [
  { kind: 'video', src: 'captures/schedule.webm', from: 1.3, to: 4.8, rate: 1 },
  { kind: 'video', src: 'captures/schedule.webm', from: 4.8, to: 6.5, rate: 2.4 },
  { kind: 'video', src: 'captures/schedule.webm', from: 13.0, to: 14.8, rate: 1.2 },
  { kind: 'video', src: 'captures/schedule.webm', from: 16.0, to: 19.7, rate: 2.2 },
];

const wizardLayers: Layer[] = [
  { kind: 'video', src: 'captures/wizard.webm', from: 4.0, to: 7.0, rate: 1.85 },
  { kind: 'video', src: 'captures/wizard.webm', from: 7.5, to: 11.5, rate: 1.85 },
  { kind: 'video', src: 'captures/wizard.webm', from: 13.5, to: 17.0, rate: 1.85 },
  { kind: 'video', src: 'captures/wizard.webm', from: 22.3, to: 23.6, rate: 1.1 },
];

const serviceLayers: Layer[] = [
  { kind: 'video', src: 'captures/service-editor.webm', from: 2.6, to: 6.0, rate: 1.75 },
  { kind: 'video', src: 'captures/service-editor.webm', from: 8.6, to: 11.0, rate: 1.5 },
  { kind: 'video', src: 'captures/service-editor.webm', from: 12.8, to: 14.2, rate: 1 },
  { kind: 'video', src: 'captures/service-editor.webm', from: 16.0, to: 19.0, rate: 1 },
];

const chargeLayers: Layer[] = [
  { kind: 'video', src: 'captures/charge.webm', from: 0.4, to: 3.5, rate: 1.25 },
  { kind: 'video', src: 'captures/charge.webm', from: 3.5, to: 7.2, rate: 1.25 },
  { kind: 'video', src: 'captures/charge.webm', from: 7.2, to: 10.2, rate: 1.2 },
];

const bookingLayers: Layer[] = [
  { kind: 'image', src: 'captures/public-link.png', seconds: 1.3, y0: 0, y1: 0 },
  { kind: 'video', src: 'captures/booking.webm', from: 1.0, to: 8.6, rate: 2 },
];

// Mirrors the approved storyboard. Times in `rings`, `zooms` and `sfx` are SCENE seconds (after the voice cuts);
// pin them to a spoken word with vt(id, secondsInTheOriginalRecording).
export const scenes: SceneConfig[] = [
  {
    type: 'hook',
    seconds: 3,
    lines: ['Tu negocio,', 'en orden'],
    sub: 'Lo básico, en un minuto',
    subAt: vt('01-hook', 3.9),
    voiceover: 'voiceover/01-hook.wav',
    subtitle: 'Tu negocio, en orden',
    sfx: [
      { at: 0.05, name: 'pop' },
      { at: 0.4, name: 'pop' },
      { at: vt('01-hook', 3.9), name: 'sparkle' },
    ],
  },
  {
    type: 'phone',
    seconds: 4,
    title: 'Crea tu cuenta',
    side: 'right',
    layers: [{ kind: 'video', src: 'captures/login.webm', from: 3.2, to: 10.2, rate: 1.75 }],
    zooms: [
      { at: 0.2, scale: 1.05, x: 50, y: 30, dur: 3 },
      { at: vt('02-signup', 2.4), scale: 1.14, x: 50, y: 38, dur: 0.6 },
    ],
    voiceover: 'voiceover/02-signup.wav',
    subtitle: 'Crea tu cuenta',
    sfx: [{ at: vt('02-signup', 2.4), name: 'tap', volume: 0.6 }],
  },
  {
    type: 'phone',
    seconds: 4.75,
    title: 'Cuéntanos de ti',
    side: 'left',
    layers: [{ kind: 'video', src: 'captures/owner-profile.webm', from: 2.6, to: 10.2, rate: 1.4 }],
    rings: [{ from: vt('03-owner-profile', 4.15), to: vt('03-owner-profile', 5.6), x: 3, y: 49.5, w: 94, h: 10, label: 'Tu tipo de negocio' }],
    voiceover: 'voiceover/03-owner-profile.wav',
    subtitle: 'Cuéntanos de ti',
  },
  {
    type: 'phone',
    seconds: secs(wizardLayers),
    title: 'Listo en 4 pasos',
    side: 'right',
    layers: wizardLayers,
    zooms: [{ at: vt('04-wizard', 6.05), scale: 1.1, x: 50, y: 45, dur: 0.5 }],
    voiceover: 'voiceover/04-wizard.wav',
    subtitle: 'Listo en 4 pasos',
    sfx: [{ at: vt('04-wizard', 6.1), name: 'sparkle' }],
  },
  {
    type: 'phone',
    seconds: secs(serviceLayers),
    title: 'Sabe cuánto ganas',
    side: 'left',
    layers: serviceLayers,
    zooms: [{ at: 5.4, scale: 1.12, x: 90, y: 36, dur: 0.8 }],
    rings: [
      { from: 2.5, to: 3.5, x: 3, y: 80, w: 92, h: 10.5, label: 'Tu margen', labelSide: 'above' },
      { from: 4.0, to: 4.95, x: 3, y: 80, w: 92, h: 10.5, label: 'Tu margen', labelSide: 'above' },
      { from: vt('05-services', 6.25) - 0.3, to: 7.9, x: 59, y: 32, w: 31, h: 8 },
    ],
    voiceover: 'voiceover/05-services.wav',
    subtitle: 'Sabe cuánto ganas',
  },
  {
    type: 'phone',
    seconds: secs(scheduleLayers),
    title: 'Agenda en segundos',
    side: 'right',
    layers: scheduleLayers,
    cropTop: SCHEDULE_CROP,
    rings: [
      {
        from: vt('06-schedule', 2.6),
        to: vt('06-schedule', 3.4),
        x: 8,
        y: cy(68.2, SCHEDULE_CROP),
        w: 36,
        h: cy(72, SCHEDULE_CROP) - cy(68.2, SCHEDULE_CROP),
        label: '+ Agregar cliente',
        labelSide: 'below-left',
      },
    ],
    zooms: [{ at: vt('06-schedule', 2.6), scale: 1.12, x: 30, y: 60, dur: 0.5 }, { at: vt('06-schedule', 3.7), scale: 1, x: 50, y: 50, dur: 0.4 }],
    voiceover: 'voiceover/06-schedule.wav',
    subtitle: 'Agenda en segundos',
    sfx: [{ at: vt('06-schedule', 6.1), name: 'tap', volume: 0.6 }],
  },
  {
    type: 'phone',
    seconds: 6,
    title: 'Tu día de un vistazo',
    side: 'left',
    layers: [{ kind: 'image', src: 'captures/agenda.png', seconds: 6, y0: 0, y1: 0 }],
    zooms: [
      { at: 0.2, scale: 1.06, x: 50, y: 24, dur: 1 },
      { at: vt('07-day', 4.85), scale: 1.08, x: 50, y: 24, dur: 0.6 },
    ],
    rings: [
      { from: vt('07-day', 1.3), to: vt('07-day', 2.6), x: 6, y: 17.2, w: 44, h: 10.5 },
      { from: vt('07-day', 2.6), to: vt('07-day', 4.8), x: 56, y: 17.5, w: 38, h: 6.5 },
      { from: vt('07-day', 4.85), to: 6.3, x: 56, y: 23.3, w: 38, h: 7 },
    ],
    voiceover: 'voiceover/07-day.wav',
    subtitle: 'Tu día de un vistazo',
  },
  {
    type: 'phone',
    seconds: secs(chargeLayers),
    title: 'Cobra y listo',
    side: 'right',
    layers: chargeLayers,
    zooms: [
      { at: vt('08-charge', 1.9), scale: 1.12, x: 20, y: 60, dur: 0.5 },
      { at: vt('08-charge', 4.7), scale: 1.1, x: 50, y: 95, dur: 0.5 },
    ],
    rings: [{ sfx: 'ding', from: vt('08-charge', 5.6), to: vt('08-charge', 7.4), x: 26, y: 91.2, w: 48, h: 5, label: '¡Cobrado!', labelSide: 'above' }],
    voiceover: 'voiceover/08-charge.wav',
    subtitle: 'Cobra y listo',
    sfx: [
      { at: vt('08-charge', 2.4), name: 'tap', volume: 0.6 },
      { at: vt('08-charge', 5.3), name: 'tap', volume: 0.6 },
    ],
  },
  {
    type: 'phone',
    seconds: secs(bookingLayers),
    title: 'Que te reserven solos',
    side: 'left',
    layers: bookingLayers,
    zooms: [
      { at: 0.1, scale: 1.1, x: 50, y: 26, dur: 0.6 },
      { at: 1.3, scale: 1, x: 50, y: 26, dur: 0.3 },
    ],
    rings: [{ from: vt('09-online-booking', 1.0), to: 1.3, x: 6, y: 22.5, w: 88, h: 5.5, label: 'Tu enlace' }],
    voiceover: 'voiceover/09-online-booking.wav',
    subtitle: 'Que te reserven solos',
  },
  {
    type: 'phone',
    seconds: 7,
    title: 'Mira cómo te va',
    side: 'right',
    // Starts below the trial banner (source y 520) and scrolls down to the "¿Quién te compró?" card.
    layers: [{ kind: 'image', src: 'captures/report-full.png', seconds: 7, y0: 520, y1: 1500, scrollFrom: 0.2, scrollTo: 4.0 }],
    zooms: [{ at: vt('10-report', 5.1), scale: 1.07, x: 50, y: 67, dur: 0.6 }],
    rings: [{ from: vt('10-report', 5.1), to: 6.9, x: 4.5, y: 46.3, w: 91, h: 40.5 }],
    voiceover: 'voiceover/10-report.wav',
    subtitle: 'Mira cómo te va',
  },
  {
    type: 'outro',
    seconds: 4,
    logo: 'brand/citelis-icon.svg',
    title: 'Citelis',
    cta: 'tu agenda que hace cuentas',
    voiceover: 'voiceover/11-outro.wav',
    subtitle: 'Citelis · tu agenda que hace cuentas',
    sfx: [{ at: 0.35, name: 'sparkle' }],
  },
];

/** Scene length in frames: voice after the cuts plus a short tail (or `seconds` when there is no recording). */
export const sceneFrames = (scene: SceneConfig): number =>
  Math.round((scene.voiceover && voiceSeconds(scene) > 0 ? voiceSeconds(scene) + TAIL_SECONDS : scene.seconds) * FPS);
