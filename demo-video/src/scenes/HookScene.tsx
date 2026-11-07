import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';

/** Kinetic type over rose. Words pop in staggered; bubbles drift behind. */
export const HookScene: React.FC<{ lines: string[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const fontSize = width > 1200 ? 190 : 150;
  const bubbles = [0, 1, 2, 3, 4, 5];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 30% 20%, ${theme.primary}, ${theme.brand700})`,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {bubbles.map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 160 + i * 50,
            height: 160 + i * 50,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.07)',
            left: `${(i * 19 + 8) % 90}%`,
            top: `${100 - ((frame * (0.5 + i * 0.12) + i * 25) % 130)}%`,
          }}
        />
      ))}
      {lines.map((line, li) =>
        <div key={li} style={{ display: 'flex', gap: fontSize * 0.25, flexWrap: 'wrap', justifyContent: 'center' }}>
          {line.split(' ').map((word, wi) => {
            const p = spring({ frame: frame - (li * 10 + wi * 5), fps, config: { damping: 11, stiffness: 120 } });
            return (
              <span
                key={wi}
                style={{
                  fontFamily: theme.fontHeading,
                  fontWeight: 800,
                  fontSize,
                  lineHeight: 1.05,
                  color: li === lines.length - 1 ? theme.paper : theme.white,
                  opacity: interpolate(p, [0, 1], [0, 1]),
                  transform: `translateY(${interpolate(p, [0, 1], [90, 0])}px) scale(${interpolate(p, [0, 1], [0.7, 1])})`,
                  display: 'inline-block',
                }}
              >
                {word}
              </span>
            );
          })}
        </div>,
      )}
      <div
        style={{
          marginTop: 36,
          height: 10,
          borderRadius: 5,
          background: theme.paper,
          width: `${interpolate(frame, [20, 50], [0, 38], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%`,
        }}
      />
    </AbsoluteFill>
  );
};
