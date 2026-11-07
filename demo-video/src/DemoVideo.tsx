import React from 'react';
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Audio } from '@remotion/media';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { TRANSITION_FRAMES, scenes, type SceneConfig } from './config';
import type { DemoProps } from './voiceover';
import { theme } from './theme';
import { HookScene } from "./scenes/HookScene";
import { PhoneScene } from "./scenes/PhoneScene";
import { OutroScene } from "./scenes/OutroScene";

const MUSIC_VOLUME = 0.25; // no voice
const MUSIC_DUCKED_VOLUME = 0.08; // while voice plays
const DUCK_RAMP_FRAMES = 10;

const renderScene = (scene: SceneConfig, index: number) => {
  switch (scene.type) {
    case "hook":
      return <HookScene lines={scene.lines} />;
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

/** Background music; volume ducks while any voice-over window is active. */
const Music: React.FC<{ src: string; windows: [number, number][] }> = ({ src, windows }) => {
  const frame = useCurrentFrame();
  const distance = Math.min(
    ...windows.map(([start, end]) => (frame < start ? start - frame : frame > end ? frame - end : 0)),
  );
  const volume = interpolate(distance, [0, DUCK_RAMP_FRAMES], [MUSIC_DUCKED_VOLUME, MUSIC_VOLUME], {
    extrapolateRight: 'clamp',
  });
  return <Audio src={staticFile(src)} volume={volume} loop />;
};

export const DemoVideo: React.FC<DemoProps> = ({ sceneFrames, voiceFrames, music, subtitles }) => {
  // Absolute [start, end] frame of each voice-over, for music ducking.
  let start = 0;
  const windows: [number, number][] = [];
  scenes.forEach((scene, i) => {
    const v = voiceFrames[i];
    if (scene.voiceover && v !== null) windows.push([start, start + v]);
    start += sceneFrames[i] - TRANSITION_FRAMES;
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper }}>
      <TransitionSeries>
        {scenes.map((scene, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <TransitionSeries.Transition
                presentation={i % 2 ? slide({ direction: 'from-right' }) : fade()}
                timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
              />
            )}
            <TransitionSeries.Sequence durationInFrames={sceneFrames[i]}>
              {renderScene(scene, i)}
              {scene.voiceover && voiceFrames[i] !== null && <Audio src={staticFile(scene.voiceover)} />}
              {subtitles && scene.subtitle && <Subtitle text={scene.subtitle} />}
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}
      </TransitionSeries>
      {music && <Music src={music} windows={windows} />}
    </AbsoluteFill>
  );
};
