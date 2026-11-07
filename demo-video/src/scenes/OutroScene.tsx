import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';

export const OutroScene: React.FC<{ logo: string; title: string; cta: string }> = ({ logo, title, cta }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const landscape = width > 1200;

  const logoP = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const titleP = spring({ frame: frame - 12, fps, config: { damping: 12 } });
  const ctaP = spring({ frame: frame - 24, fps, config: { damping: 14 } });
  const pulse = 1 + 0.045 * Math.sin(frame / 6);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 38%, ${theme.primary}, ${theme.brand700})`,
        justifyContent: 'center',
        alignItems: 'center',
        gap: landscape ? 28 : 36,
        padding: 60,
      }}
    >
      <Img
        src={staticFile(logo)}
        style={{
          height: landscape ? 260 : 300,
          borderRadius: 56,
          boxShadow: '0 30px 80px rgba(0,0,0,0.3)',
          transform: `scale(${interpolate(logoP, [0, 1], [0.3, 1]) * pulse})`,
          opacity: logoP,
        }}
      />
      <div
        style={{
          fontFamily: theme.fontHeading,
          fontWeight: 800,
          fontSize: landscape ? 150 : 130,
          color: theme.white,
          opacity: titleP,
          transform: `translateY(${interpolate(titleP, [0, 1], [40, 0])}px)`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: theme.fontBody,
          fontWeight: 600,
          fontSize: landscape ? 64 : 58,
          color: theme.paper,
          textAlign: 'center',
          opacity: ctaP,
          transform: `translateY(${interpolate(ctaP, [0, 1], [30, 0])}px)`,
        }}
      >
        {cta}
      </div>
    </AbsoluteFill>
  );
};
