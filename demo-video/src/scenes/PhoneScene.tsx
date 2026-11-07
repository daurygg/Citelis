import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CAPTURE_H, CAPTURE_W, FPS, layerSeconds, type Layer, type Ring, type Zoom } from '../config';
import { theme } from '../theme';
import { Backdrop } from './Backdrop';

const BEZEL = 14;
const FADE = 4; // frames of crossfade between consecutive layers

type Props = {
  title: string;
  side: 'left' | 'right';
  layers: Layer[];
  cropTop?: number;
  zooms?: Zoom[];
  rings?: Ring[];
  index: number;
};

const eased = Easing.inOut(Easing.cubic);

/** Current camera (scale + origin) from keyframes; each eases from the previous one. */
const cameraAt = (zooms: Zoom[], t: number) => {
  let prev = { scale: 1, x: 50, y: 50 };
  let cur = prev;
  let start = 0;
  let dur = 0.6;
  for (const z of zooms) {
    if (z.at <= t) {
      prev = cur;
      cur = { scale: z.scale, x: z.x, y: z.y };
      start = z.at;
      dur = z.dur ?? 0.6;
    }
  }
  const p = eased(Math.min(1, Math.max(0, (t - start) / dur)));
  return {
    scale: prev.scale + (cur.scale - prev.scale) * p,
    x: prev.x + (cur.x - prev.x) * p,
    y: prev.y + (cur.y - prev.y) * p,
  };
};

const LayerView: React.FC<{
  layer: Layer;
  screenW: number;
  cropTop: number;
  stretch: number;
  fadeIn: boolean;
}> = ({ layer, screenW, cropTop, stretch, fadeIn }) => {
  const frame = useCurrentFrame();
  const opacity = fadeIn ? interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: 'clamp' }) : 1;
  const scale = screenW / CAPTURE_W;

  if (layer.kind === 'video') {
    const vh = screenW * (CAPTURE_H / CAPTURE_W);
    return (
      <div style={{ position: 'absolute', inset: 0, opacity }}>
        <OffthreadVideo
          src={staticFile(layer.src)}
          muted
          trimBefore={Math.round(layer.from * FPS)}
          playbackRate={layer.rate / stretch}
          style={{ position: 'absolute', left: 0, width: screenW, height: vh, top: -cropTop * vh }}
        />
      </div>
    );
  }
  const secs = layer.seconds * stretch;
  const from = (layer.scrollFrom ?? 0) * stretch;
  const to = (layer.scrollTo ?? layer.seconds) * stretch;
  const t = frame / FPS;
  const k = eased(Math.min(1, Math.max(0, (t - from) / Math.max(0.01, to - from))));
  const y = (layer.y0 ?? 0) + ((layer.y1 ?? layer.y0 ?? 0) - (layer.y0 ?? 0)) * k;
  // Slow drift keeps still images alive even when they do not scroll.
  const drift = 1 + 0.03 * (t / Math.max(0.1, secs));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity, overflow: 'hidden' }}>
      <Img
        src={staticFile(layer.src)}
        style={{
          position: 'absolute',
          left: 0,
          top: -y * scale,
          width: screenW,
          transform: `scale(${drift})`,
          transformOrigin: '50% 20%',
        }}
      />
    </div>
  );
};

const RingView: React.FC<{ ring: Ring; t: number }> = ({ ring, t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: frame - ring.from * FPS, fps, config: { damping: 10, stiffness: 240 } });
  const out = interpolate(t, [ring.to - 0.2, ring.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (t < ring.from || t > ring.to) return null;
  const pulse = 1 + 0.015 * Math.sin(frame / 5);
  return (
    <div style={{ position: 'absolute', left: `${ring.x}%`, top: `${ring.y}%`, width: `${ring.w}%`, height: `${ring.h}%` }}>
      <div
        style={{
          position: 'absolute',
          inset: -6,
          borderRadius: 22,
          border: `5px solid ${theme.primary}`,
          boxShadow: `0 0 0 6px ${theme.primary}33, 0 0 40px ${theme.primary}66`,
          opacity: inP * out,
          transform: `scale(${interpolate(inP, [0, 1], [1.15, 1]) * pulse})`,
        }}
      />
      {ring.label && (
        <div
          style={{
            position: 'absolute',
            ...(ring.labelSide === 'right'
              ? { left: '100%', top: '50%', marginLeft: 22 }
              : ring.labelSide === 'below-left'
                ? { left: 0, top: '100%', marginTop: 18 }
              : ring.labelSide === 'above'
                ? { left: '50%', bottom: '100%', marginBottom: 16 }
                : { left: '50%', top: '100%', marginTop: 18 }),
            transform: `${ring.labelSide === 'right' ? 'translateY(-50%)' : ring.labelSide === 'below-left' ? '' : 'translateX(-50%)'} scale(${inP})`,
            opacity: inP * out,
            padding: '8px 22px',
            borderRadius: 999,
            background: theme.primary,
            color: theme.white,
            fontFamily: theme.fontBody,
            fontWeight: 800,
            fontSize: 30,
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(159,18,57,0.35)',
          }}
        >
          {ring.label}
        </div>
      )}
    </div>
  );
};

const Title: React.FC<{ title: string; fontSize: number; align: 'left' | 'center' }> = ({ title, fontSize, align }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = title.split(' ');
  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: fontSize * 0.26,
          justifyContent: align === 'center' ? 'center' : 'flex-start',
        }}
      >
        {words.map((w, i) => {
          const p = spring({ frame: frame - 3 - i * 3, fps, config: { damping: 11, stiffness: 220 } });
          return (
            <span
              key={i}
              style={{
                fontFamily: theme.fontHeading,
                fontWeight: 800,
                fontSize,
                lineHeight: 1.06,
                letterSpacing: -2,
                color: i === words.length - 1 ? theme.primary : theme.ink,
                opacity: p,
                display: 'inline-block',
                transform: `translateY(${interpolate(p, [0, 1], [70, 0])}px) scale(${interpolate(p, [0, 1], [0.8, 1])}) rotate(${interpolate(p, [0, 1], [-4, 0])}deg)`,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 28,
          height: 12,
          borderRadius: 6,
          background: theme.primary,
          width: interpolate(frame, [8, 24], [0, fontSize * 2.2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          marginLeft: align === 'center' ? 'auto' : 0,
          marginRight: align === 'center' ? 'auto' : 0,
        }}
      />
    </div>
  );
};

export const PhoneScene: React.FC<Props> = ({ title, side, layers, cropTop = 0, zooms = [], rings = [], index }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const landscape = width > height;

  // The scene is as long as its (cut) voice-over: layers speed up or slow down uniformly to fit.
  // Rings and zooms are authored in scene seconds, so they track the spoken word.
  const natural = layers.reduce((s, l) => s + layerSeconds(l), 0) * FPS;
  const stretch = durationInFrames / natural;
  const t = frame / FPS;

  const aspect = CAPTURE_W / (CAPTURE_H * (1 - cropTop));
  const frameH = landscape ? height * 0.9 : height - 470 - 80;
  const screenH = frameH - BEZEL * 2;
  const screenW = Math.min(screenH * aspect, landscape ? 640 : width - 160);
  const realScreenH = screenW / aspect;
  const frameW = screenW + BEZEL * 2;

  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 170 } });
  const push = 1 + 0.04 * (frame / durationInFrames); // constant slow push-in on the whole phone
  const float = Math.sin(frame / 28) * 7;
  const cam = cameraAt(zooms, t);

  // Layer timeline in frames, each overlapping the next by FADE for a crossfade.
  let offset = 0;
  const timeline = layers.map((layer, i) => {
    const d = Math.round(layerSeconds(layer) * stretch * FPS);
    const entry = { layer, from: offset, dur: i === layers.length - 1 ? Math.max(d, durationInFrames - offset) : d + FADE };
    offset += d;
    return entry;
  });

  const phone = (
    <div
      style={{
        width: frameW,
        height: realScreenH + BEZEL * 2,
        borderRadius: 64,
        border: `${BEZEL}px solid ${theme.ink}`,
        background: theme.paper,
        boxShadow: '0 50px 110px rgba(159,18,57,0.35), 0 8px 24px rgba(35,31,38,0.25)',
        overflow: 'hidden',
        position: 'relative',
        boxSizing: 'content-box',
        transform: `translateY(${interpolate(enter, [0, 1], [landscape ? 0 : 160, 0]) + float}px) translateX(${interpolate(
          enter,
          [0, 1],
          [landscape ? (side === 'right' ? 220 : -220) : 0, 0],
        )}px)`,
        opacity: Math.min(1, enter * 2),
        scale: String(push),
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          transform: `scale(${cam.scale})`,
          transformOrigin: `${cam.x}% ${cam.y}%`,
        }}
      >
        {timeline.map((e, i) => (
          <Sequence key={i} from={e.from} durationInFrames={e.dur} layout="none">
            <LayerView layer={e.layer} screenW={screenW} cropTop={cropTop} stretch={stretch} fadeIn={i > 0} />
          </Sequence>
        ))}
        {rings.map((r, i) => (
          <RingView key={i} ring={r} t={t} />
        ))}
      </div>
    </div>
  );

  return (
    <AbsoluteFill>
      <Backdrop seed={index} />
      {landscape ? (
        <AbsoluteFill
          style={{
            flexDirection: side === 'right' ? 'row' : 'row-reverse',
            alignItems: 'center',
            padding: '0 120px',
            gap: 60,
          }}
        >
          <div style={{ flex: 1 }}>
            <Title title={title} fontSize={104} align="left" />
          </div>
          <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center', width: 700 }}>{phone}</div>
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ alignItems: 'center' }}>
          <div style={{ height: 470, display: 'flex', alignItems: 'flex-end', padding: '0 70px 40px' }}>
            <Title title={title} fontSize={108} align="center" />
          </div>
          {phone}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
