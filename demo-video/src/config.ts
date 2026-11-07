export const FPS = 30;
export const TRANSITION_FRAMES = 15;
/** Silence kept after each voice-over so the scene does not cut the last word. */
export const VOICE_PADDING_SECONDS = 0.5;

/** Size of every capture (phone portrait, 2x of 390x844). */
export const CAPTURE_W = 780;
export const CAPTURE_H = 1688;

/** Fields shared by every scene. */
type VoiceFields = {
  /** Recording under public/, e.g. 'voiceover/01-hook.mp3'. Missing file: scene uses `seconds`. */
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
export type Ring = { from: number; to: number; x: number; y: number; w: number; h: number; label?: string; labelSide?: 'below' | 'above' | 'right' };

export type SceneConfig = VoiceFields &
  (
    | { type: 'hook'; seconds: number; lines: string[] }
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
  // music: 'music/bed.mp3',
  subtitles: false,
};

export const layerSeconds = (l: Layer): number => (l.kind === 'image' ? l.seconds : (l.to - l.from) / l.rate);
export const layersSeconds = (layers: Layer[]): number => layers.reduce((s, l) => s + layerSeconds(l), 0);

/** Converts a y given in capture % to visible-screen % for a scene cropped by `cropTop`. */
export const cy = (y: number, cropTop: number): number => (y - cropTop * 100) / (1 - cropTop);

const SCHEDULE_CROP = 0.24; // hides the trial banner of the real app
const scheduleLayers: Layer[] = [
  { kind: 'video', src: 'captures/schedule.webm', from: 2.8, to: 4.6, rate: 1 },
  { kind: 'video', src: 'captures/schedule.webm', from: 4.6, to: 8.0, rate: 1.7 },
  { kind: 'video', src: 'captures/schedule.webm', from: 10.5, to: 13.5, rate: 1.7 },
  { kind: 'video', src: 'captures/schedule.webm', from: 15.5, to: 19.7, rate: 1.75 },
];

const wizardLayers: Layer[] = [
  { kind: 'video', src: 'captures/wizard.webm', from: 4.0, to: 7.0, rate: 1.5 },
  { kind: 'video', src: 'captures/wizard.webm', from: 7.5, to: 11.5, rate: 1.5 },
  { kind: 'video', src: 'captures/wizard.webm', from: 13.5, to: 17.0, rate: 1.5 },
  { kind: 'video', src: 'captures/wizard.webm', from: 22.3, to: 23.6, rate: 1.5 },
];

const serviceLayers: Layer[] = [
  { kind: 'video', src: 'captures/service-editor.webm', from: 2.6, to: 6.0, rate: 1.75 },
  { kind: 'video', src: 'captures/service-editor.webm', from: 8.6, to: 11.0, rate: 1.5 },
  { kind: 'video', src: 'captures/service-editor.webm', from: 12.8, to: 14.2, rate: 1 },
  { kind: 'video', src: 'captures/service-editor.webm', from: 16.0, to: 19.0, rate: 1 },
];

const bookingLayers: Layer[] = [
  { kind: 'image', src: 'captures/public-link.png', seconds: 2.2, y0: 0, y1: 0 },
  { kind: 'video', src: 'captures/booking.webm', from: 1.0, to: 9.4, rate: 1.75 },
];

const secs = (layers: Layer[]) => Math.round(layersSeconds(layers) * 100) / 100;

// Mirrors the approved storyboard. Every scene keeps moving.
// Voice-over: the files do not exist yet; scenes fall back to `seconds` until they are dropped in public/voiceover/.
export const scenes: SceneConfig[] = [
  {
    type: 'hook',
    seconds: 3,
    lines: ['Tu negocio,', 'en orden'],
    voiceover: 'voiceover/01-hook.wav',
    subtitle: 'Tu negocio, en orden',
  },
  {
    type: 'phone',
    seconds: 4,
    title: 'Crea tu cuenta',
    side: 'right',
    layers: [{ kind: 'video', src: 'captures/login.webm', from: 3.2, to: 10.2, rate: 1.75 }],
    zooms: [{ at: 0.2, scale: 1.06, x: 50, y: 30, dur: 3 }],
    voiceover: 'voiceover/02-signup.wav',
    subtitle: 'Crea tu cuenta',
  },
  {
    type: 'phone',
    seconds: 4.75,
    title: 'Cuéntanos de ti',
    side: 'left',
    layers: [{ kind: 'video', src: 'captures/owner-profile.webm', from: 2.6, to: 10.2, rate: 1.6 }],
    rings: [{ from: 3.0, to: 4.7, x: 3, y: 49.5, w: 94, h: 10, label: 'Tu tipo de negocio' }],
    voiceover: 'voiceover/03-owner-profile.wav',
    subtitle: 'Cuéntanos de ti',
  },
  {
    type: 'phone',
    seconds: secs(wizardLayers),
    title: 'Listo en 4 pasos',
    side: 'right',
    layers: wizardLayers,
    voiceover: 'voiceover/04-wizard.wav',
    subtitle: 'Listo en 4 pasos',
  },
  {
    type: 'phone',
    seconds: secs(serviceLayers),
    title: 'Sabe cuánto ganas',
    side: 'left',
    layers: serviceLayers,
    zooms: [
      { at: 5.4, scale: 1.12, x: 90, y: 36, dur: 0.8 },
    ],
    rings: [
      { from: 2.5, to: 3.5, x: 3, y: 80, w: 92, h: 10.5, label: 'Tu margen', labelSide: 'above' },
      { from: 4.0, to: 4.95, x: 3, y: 80, w: 92, h: 10.5, label: 'Tu margen', labelSide: 'above' },
      { from: 5.9, to: 7.9, x: 59, y: 32, w: 31, h: 8 },
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
        from: 0.4,
        to: 1.7,
        x: 8,
        y: cy(68.2, SCHEDULE_CROP),
        w: 36,
        h: cy(72, SCHEDULE_CROP) - cy(68.2, SCHEDULE_CROP),
        label: '+ Agregar cliente',
        labelSide: 'right',
      },
    ],
    voiceover: 'voiceover/06-schedule.wav',
    subtitle: 'Agenda en segundos',
  },
  {
    type: 'phone',
    seconds: 6,
    title: 'Tu día de un vistazo',
    side: 'left',
    layers: [{ kind: 'image', src: 'captures/agenda.png', seconds: 6, y0: 0, y1: 0 }],
    zooms: [{ at: 0.2, scale: 1.06, x: 50, y: 24, dur: 1 }],
    rings: [
      { from: 1.0, to: 2.6, x: 6, y: 17.2, w: 44, h: 10.5 },
      { from: 2.6, to: 4.2, x: 56, y: 17.5, w: 38, h: 6.5 },
      { from: 4.2, to: 5.9, x: 56, y: 23.3, w: 38, h: 7 },
    ],
    voiceover: 'voiceover/07-day.wav',
    subtitle: 'Tu día de un vistazo',
  },
  {
    type: 'phone',
    seconds: 8,
    title: 'Cobra y listo',
    side: 'right',
    layers: [{ kind: 'video', src: 'captures/charge.webm', from: 1.6, to: 10.3, rate: 1.09 }],
    zooms: [{ at: 5.0, scale: 1.08, x: 50, y: 95, dur: 0.7 }],
    rings: [{ from: 5.2, to: 7.4, x: 26, y: 91.2, w: 48, h: 5, label: '¡Cobrado!', labelSide: 'above' }],
    voiceover: 'voiceover/08-charge.wav',
    subtitle: 'Cobra y listo',
  },
  {
    type: 'phone',
    seconds: secs(bookingLayers),
    title: 'Que te reserven solos',
    side: 'left',
    layers: bookingLayers,
    zooms: [
      { at: 0.2, scale: 1.1, x: 50, y: 26, dur: 1 },
      { at: 2.2, scale: 1, x: 50, y: 26, dur: 0.4 },
    ],
    rings: [{ from: 0.8, to: 2.2, x: 6, y: 22.5, w: 88, h: 5.5, label: 'Tu enlace' }],
    voiceover: 'voiceover/09-online-booking.wav',
    subtitle: 'Que te reserven solos',
  },
  {
    type: 'phone',
    seconds: 7,
    title: 'Mira cómo te va',
    side: 'right',
    // Starts below the trial banner (source y 520) and scrolls down to the "¿Quién te compró?" card.
    layers: [{ kind: 'image', src: 'captures/report-full.png', seconds: 7, y0: 520, y1: 1500, scrollFrom: 0.2, scrollTo: 4.2 }],
    zooms: [{ at: 4.3, scale: 1.06, x: 50, y: 67, dur: 0.8 }],
    rings: [{ from: 4.2, to: 7, x: 4.5, y: 46.3, w: 91, h: 40.5 }],
    voiceover: 'voiceover/10-report.wav',
    subtitle: 'Mira cómo te va',
  },
  {
    type: 'outro',
    seconds: 4,
    logo: 'captures/icon-512.png',
    title: 'Citelis',
    cta: 'tu agenda que hace cuentas',
    voiceover: 'voiceover/11-outro.wav',
    subtitle: 'Citelis · tu agenda que hace cuentas',
  },
];

/** Scene length in frames: the longer of `seconds` and voice length + padding. */
export const sceneFrames = (scene: SceneConfig, voiceSeconds: number | null): number =>
  Math.max(
    Math.round(scene.seconds * FPS),
    voiceSeconds === null ? 0 : Math.ceil((voiceSeconds + VOICE_PADDING_SECONDS) * FPS),
  );

/** Total frames: scene frames minus overlap of each transition. */
export const totalFrames = (frames: number[]): number =>
  frames.reduce((sum, f) => sum + f, 0) - TRANSITION_FRAMES * (frames.length - 1);
