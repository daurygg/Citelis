import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { theme } from '../theme';

/** Light rose backdrop with two slowly drifting blobs (keeps the scene alive). */
export const Backdrop: React.FC<{ seed?: number }> = ({ seed = 0 }) => {
  const frame = useCurrentFrame();
  const t = frame / 30 + seed * 3;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${theme.paper}, ${theme.paperDeep})`, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.primary}33, transparent 70%)`,
          left: `${20 + 8 * Math.sin(t / 2)}%`,
          top: `${-20 + 6 * Math.cos(t / 2.5)}%`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.brand600}22, transparent 70%)`,
          right: `${-5 + 6 * Math.cos(t / 3)}%`,
          bottom: `${-15 + 5 * Math.sin(t / 2)}%`,
        }}
      />
    </AbsoluteFill>
  );
};
