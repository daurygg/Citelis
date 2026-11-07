import React from 'react';
import { Composition } from 'remotion';
import { DemoVideo } from './DemoVideo';
import { FPS, totalFrames } from './config';
import { calculateMetadata, defaultProps } from './voiceover';

export const Root: React.FC = () => (
  <>
    <Composition
      id="Landscape"
      component={DemoVideo}
      durationInFrames={totalFrames(defaultProps.sceneFrames)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="Vertical"
      component={DemoVideo}
      durationInFrames={totalFrames(defaultProps.sceneFrames)}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
    />
  </>
);
