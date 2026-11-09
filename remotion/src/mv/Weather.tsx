// Weather layer between the background and the lyrics: rain streaks, ripples on the beat and
// twinkling four-point stars. Everything is a pure function of time, so any frame renders alone.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { hash01, lastIndexAtOrBefore, smoothLook } from "./beat";
import type { Plan, Timing } from "./types";

const Rain: React.FC<{ amount: number; angle: number; speed: number; t: number }> = ({ amount, angle, speed, t }) => {
  const { width, height } = useVideoConfig();
  const n = Math.round(260 * amount);
  const rad = (angle * Math.PI) / 180;
  const span = height * 1.4;
  const drops: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const depth = hash01(i, 1); // 0 far .. 1 near
    const v = (1300 + 1500 * depth) * speed * (height / 1080);
    const len = (30 + 110 * depth * depth) * (height / 1080);
    const y = ((t * v + hash01(i, 2) * span) % span) - height * 0.2;
    const x = hash01(i, 3) * (width + height * Math.abs(Math.tan(rad))) - (rad > 0 ? height * Math.tan(rad) : 0) + y * Math.tan(rad);
    const dx = Math.sin(rad) * len;
    const dy = Math.cos(rad) * len;
    drops.push(
      <line
        key={i}
        x1={x}
        y1={y}
        x2={x + dx}
        y2={y + dy}
        stroke="rgba(220,235,255,1)"
        strokeOpacity={0.12 + 0.38 * depth}
        strokeWidth={(0.8 + 1.8 * depth) * (height / 1080)}
        strokeLinecap="round"
      />,
    );
  }
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
      {drops}
    </svg>
  );
};

const Ripples: React.FC<{ amount: number; t: number; beats: number[] }> = ({ amount, t, beats }) => {
  const { width, height } = useVideoConfig();
  const k = lastIndexAtOrBefore(beats, t);
  const per = Math.max(1, Math.round(5 * amount));
  const life = 1.3;
  const rings: React.ReactNode[] = [];
  for (let b = Math.max(0, k - 4); b <= k; b++) {
    const age = t - beats[b];
    if (age < 0 || age > life) continue;
    for (let j = 0; j < per; j++) {
      const y = height * (0.62 + 0.36 * hash01(b, j + 10));
      const persp = 0.5 + (y / height - 0.62) * 2.2; // nearer = bigger
      const x = width * (0.04 + 0.92 * hash01(b, j + 30));
      const r = (8 + age * 150) * persp * (height / 1080);
      const o = (1 - age / life) * 0.55 * amount;
      rings.push(<ellipse key={`${b}-${j}`} cx={x} cy={y} rx={r} ry={r * 0.26} fill="none" stroke="rgba(230,240,255,1)" strokeOpacity={o} strokeWidth={1.6 * persp} />);
      if (age < life * 0.6)
        rings.push(
          <ellipse key={`${b}-${j}i`} cx={x} cy={y} rx={r * 0.55} ry={r * 0.26 * 0.55} fill="none" stroke="rgba(230,240,255,1)" strokeOpacity={o * 0.6} strokeWidth={1.1 * persp} />,
        );
    }
  }
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
      {rings}
    </svg>
  );
};

const star = (cx: number, cy: number, r: number) => {
  const w = r * 0.18;
  return `M${cx},${cy - r} Q${cx + w},${cy - w} ${cx + r},${cy} Q${cx + w},${cy + w} ${cx},${cy + r} Q${cx - w},${cy + w} ${cx - r},${cy} Q${cx - w},${cy - w} ${cx},${cy - r}Z`;
};

const Sparkle: React.FC<{ amount: number; t: number; beats: number[]; color: string }> = ({ amount, t, beats, color }) => {
  const { width, height } = useVideoConfig();
  const n = Math.round(46 * amount);
  const k = lastIndexAtOrBefore(beats, t);
  const beatAge = k >= 0 ? t - beats[k] : 9;
  const paths: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const phase = hash01(i, 5) * Math.PI * 2;
    const rate = 1.2 + 2.4 * hash01(i, 6);
    let b = Math.pow(Math.max(0, Math.sin(t * rate + phase)), 4);
    // a few stars flare on each beat
    if (k >= 0 && hash01(k, i) < 0.12) b = Math.max(b, Math.exp(-beatAge / 0.25));
    if (b < 0.03) continue;
    const r = (6 + 22 * hash01(i, 7)) * (0.5 + 0.5 * b) * (height / 1080);
    const x = width * hash01(i, 8);
    const y = height * (0.04 + 0.9 * hash01(i, 9));
    paths.push(<path key={i} d={star(x, y, r)} fill={i % 4 === 0 ? color : "#fffbe8"} opacity={b * amount} />);
  }
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, mixBlendMode: "screen", filter: "drop-shadow(0 0 6px rgba(255,250,220,0.8))" }}>
      {paths}
    </svg>
  );
};

export const Weather: React.FC<{ plan: Plan; timing: Timing }> = ({ plan, timing }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const rain = smoothLook(plan, timing, t, "rain", 2);
  const ripples = smoothLook(plan, timing, t, "ripples", 2);
  const sparkle = smoothLook(plan, timing, t, "sparkle", 2);
  const angle = smoothLook(plan, timing, t, "rainAngle", 2, 8);
  const speed = smoothLook(plan, timing, t, "rainSpeed", 2, 1);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {ripples > 0.01 ? <Ripples amount={ripples} t={t} beats={timing.beats} /> : null}
      {rain > 0.01 ? <Rain amount={rain} angle={angle} speed={speed} t={t} /> : null}
      {sparkle > 0.01 ? <Sparkle amount={sparkle} t={t} beats={timing.beats} color={plan.palette.accent} /> : null}
    </AbsoluteFill>
  );
};
