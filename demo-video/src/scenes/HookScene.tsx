import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';

/** Kinetic type over rose. Words pop in staggered; bubbles drift behind. */
export const HookScene: React.FC<{ lines: string[]; sub: string; subAt: number }> = ({ lines, sub, subAt }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const fontSize = width > 1200 ? 190 : 150;
  const bubbles = [0, 1, 2, 3, 4, 5];
  const subP = spring({ frame: frame - Math.round(subAt * 30), fps, config: { damping: 11, stiffness: 200 } });
  // Slow breathing keeps the type alive after it lands.
  const breathe = 1 + 0.015 * Math.sin(frame / 7);

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
        <div key={li} style={{ transform: `scale(${breathe})`, display: 'flex', gap: fontSize * 0.25, flexWrap: 'wrap', justifyContent: 'center' }}>
          {line.split(' ').map((word, wi) => {
            const p = spring({ frame: frame - (li * 12 + wi * 3), fps, config: { damping: 10, stiffness: 220 } });
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
          width: `${interpolate(frame, [10, 28], [0, 38], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%`,
        }}
      />
      <div
        style={{
          marginTop: 44,
          padding: '14px 44px',
          borderRadius: 999,
          background: theme.paper,
          color: theme.brand700,
          fontFamily: theme.fontBody,
          fontWeight: 800,
          fontSize: width > 1200 ? 64 : 54,
          opacity: subP,
          transform: `translateY(${interpolate(subP, [0, 1], [60, 0])}px) scale(${interpolate(subP, [0, 1], [0.8, 1])})`,
          boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
        }}
      >
        {sub}
      </div>
    </AbsoluteFill>
  );
};
