import React from 'react';
import { AbsoluteFill, Easing, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import type { TransitionPresentation } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { FPS, TRANSITION_FRAMES, scenes, type SceneConfig } from './config';
import { timeline, voiceWindows } from './timing';
import type { DemoProps } from './voiceover';
import { theme } from './theme';
import { HookScene } from "./scenes/HookScene";
import { PhoneScene } from "./scenes/PhoneScene";
import { OutroScene } from "./scenes/OutroScene";

const renderScene = (scene: SceneConfig, index: number) => {
  switch (scene.type) {
    case "hook":
      return <HookScene lines={scene.lines} sub={scene.sub} subAt={scene.subAt} />;
    case "phone":
      return <PhoneScene {...scene} index={index} />;
    case "outro":
      return <OutroScene {...scene} />;
  }
};

const Subtitle: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: '0 8% 5%' }}>
    <div
      style={{
        fontFamily: theme.fontBody,
        fontWeight: 600,
        fontSize: 44,
        lineHeight: 1.25,
        textAlign: 'center',
        color: theme.white,
        background: 'rgba(0,0,0,0.6)',
        padding: '12px 28px',
        borderRadius: 16,
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);

// Music levels: normal vs. under the voice, with 0.15 s ramps; 0.5 s fade in, 1.5 s fade out.
const MUSIC_VOLUME = 0.25;
const MUSIC_DUCKED_VOLUME = 0.08;
const DUCK_RAMP_FRAMES = Math.round(0.15 * FPS);
const MUSIC_FADE_IN = Math.round(0.5 * FPS);
const MUSIC_FADE_OUT = Math.round(1.5 * FPS);

/** Music volume at an absolute frame: ducks while any voice segment plays. */
const musicVolumeAt = (frame: number, total: number, windows: [number, number][]): number => {
  const distance = Math.min(...windows.map(([start, end]) => (frame < start ? start - frame : frame >= end ? frame - end + 1 : 0)));
  const duck = interpolate(distance, [0, DUCK_RAMP_FRAMES], [MUSIC_DUCKED_VOLUME, MUSIC_VOLUME], { extrapolateRight: 'clamp' });
  const fadeIn = interpolate(frame, [0, MUSIC_FADE_IN], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [total - MUSIC_FADE_OUT, total], [1, 0], { extrapolateLeft: 'clamp' });
  return duck * fadeIn * fadeOut;
};

const Music: React.FC<{ src: string }> = ({ src }) => {
  const { durationInFrames } = useVideoConfig();
  const windows = React.useMemo(voiceWindows, []);
  // Starts at frame 0 and loops when the track is shorter than the video.
  return (
    <Audio
      src={staticFile(src)}
      loop
      loopVolumeCurveBehavior="extend"
      volume={(frame) => musicVolumeAt(frame, durationInFrames, windows)}
    />
  );
};

/** Voice segments back to back (cuts from voiceover-edits.json). One frame of half volume at each edge avoids clicks. */
const VoiceTrack: React.FC = () => (
  <>
    {timeline.voice.map((v, i) => {
      const scene = scenes[v.scene];
      return (
        <Sequence key={i} from={v.start} durationInFrames={v.duration} layout="none">
          <Audio
            src={staticFile(scene.voiceover!)}
            trimBefore={v.trimBefore}
            trimAfter={v.trimBefore + v.duration}
            volume={(f) => (f === 0 || f === v.duration - 1 ? 0.5 : 1)}
          />
        </Sequence>
      );
    })}
  </>
);

const SfxTrack: React.FC = () => (
  <>
    {timeline.sfx.map((e, i) => (
      <Sequence key={i} from={e.start} layout="none">
        <Audio src={staticFile(`sfx/${e.name}.wav`)} volume={e.volume} />
      </Sequence>
    ))}
  </>
);

const snap = Easing.bezier(0.7, 0, 0.2, 1);
const presentations: TransitionPresentation<any>[] = [
  slide({ direction: 'from-right' }),
  slide({ direction: 'from-bottom' }),
  wipe({ direction: 'from-left' }),
  slide({ direction: 'from-left' }),
  slide({ direction: 'from-bottom' }),
];

export const DemoVideo: React.FC<DemoProps> = ({ music, subtitles }) => (
  <AbsoluteFill style={{ backgroundColor: theme.paper }}>
    <TransitionSeries>
      {scenes.map((scene, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <TransitionSeries.Transition
              presentation={presentations[(i - 1) % presentations.length]}
              timing={linearTiming({ durationInFrames: TRANSITION_FRAMES, easing: snap })}
            />
          )}
          <TransitionSeries.Sequence durationInFrames={timeline.frames[i]}>
            {renderScene(scene, i)}
            {subtitles && scene.subtitle && <Subtitle text={scene.subtitle} />}
          </TransitionSeries.Sequence>
        </React.Fragment>
      ))}
    </TransitionSeries>
    <VoiceTrack />
    <SfxTrack />
    {music && <Music src={music} />}
  </AbsoluteFill>
);
