// Background layer: the shots of the storyboard (images, videos, colour + generative motif),
// with camera moves, beat pulse, downbeat shake, cut transitions, tint and dim.
import { Video } from "@remotion/media";
import React from "react";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { envelope, hitIndex, lookAt, rand } from "./beat";
import { rgbShift } from "./effects/rgb-shift";
import { sliceShift } from "./effects/slice-shift";
import type { GradeKey, Look, Plan, Shot, Timing } from "./types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const kindOf = (s: Shot): "image" | "video" | "color" => {
  if (s.kind) return s.kind;
  if (!s.src) return "color";
  return /\.(mp4|mov|webm|mkv)$/i.test(s.src) ? "video" : "image";
};

const Pattern: React.FC<{ shot: Shot; plan: Plan; timing: Timing; t: number; look: Look }> = ({
  shot,
  plan,
  timing,
  t,
  look,
}) => {
  const { width, height } = useVideoConfig();
  const accent = look.accent ?? plan.palette.accent;
  const down = envelope(timing.downbeats, t, 0.35);
  if (shot.pattern === "lines") {
    const gap = 46;
    const off = (t * 24) % gap;
    return (
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: 0.12 + 0.18 * down }}>
        {Array.from({ length: Math.ceil((width + height) / gap) + 2 }).map((_, i) => {
          const x = i * gap - height + off;
          return <line key={i} x1={x} y1={height} x2={x + height} y2={0} stroke={accent} strokeWidth={1.2} />;
        })}
      </svg>
    );
  }
  if (shot.pattern === "rings") {
    const k = hitIndex(timing.downbeats, t);
    const rings = [0, 1, 2, 3, 4]
      .map((j) => k - j)
      .filter((i) => i >= 0)
      .map((i) => {
        const age = t - timing.downbeats[i];
        return { i, r: 40 + age * 520, o: Math.max(0, 0.55 - age * 0.22) };
      });
    return (
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {rings.map((r) => (
          <circle key={r.i} cx={width / 2} cy={height / 2} r={r.r} fill="none" stroke={accent} strokeWidth={2} opacity={r.o} />
        ))}
      </svg>
    );
  }
  if (shot.pattern === "grid") {
    return (
      <AbsoluteFill style={{ perspective: 600, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: "-50%",
            width: "200%",
            top: "45%",
            height: "120%",
            rotate: "x 72deg",
            transformOrigin: "50% 0%",
            backgroundImage: `linear-gradient(${accent} 1px, transparent 1px), linear-gradient(90deg, ${accent} 1px, transparent 1px)`,
            backgroundSize: "80px 80px",
            backgroundPosition: `0px ${(t * 160) % 80}px`,
            opacity: 0.25 + 0.25 * down,
          }}
        />
      </AbsoluteFill>
    );
  }
  return null;
};

const ShotView: React.FC<{ shot: Shot; from: number; index: number; plan: Plan; timing: Timing }> = ({
  shot,
  from,
  index,
  plan,
  timing,
}) => {
  const f = useCurrentFrame();
  const { fps, width, height, durationInFrames: D } = useVideoConfig();
  const t = (from + f) / fps;
  const look: Look = { ...lookAt(plan, timing, t), ...(shot.look ?? {}) };
  const a = shot.amount ?? 1;
  const p = interpolate(f, [0, Math.max(1, D - 1)], [0, 1], clamp);
  const ease = Easing.bezier(0.33, 0, 0.2, 1)(p);

  // camera move over the shot
  let moveScale = 1.06;
  let mx = 0;
  let my = 0;
  switch (shot.move ?? "in") {
    case "in":
      moveScale = 1 + 0.12 * a * ease;
      break;
    case "out":
      moveScale = 1 + 0.12 * a * (1 - ease);
      break;
    case "left":
      mx = (0.5 - ease) * 6 * a;
      moveScale = 1.1;
      break;
    case "right":
      mx = (ease - 0.5) * 6 * a;
      moveScale = 1.1;
      break;
    case "up":
      my = (0.5 - ease) * 6 * a;
      moveScale = 1.1;
      break;
    case "down":
      my = (ease - 0.5) * 6 * a;
      moveScale = 1.1;
      break;
    default:
      moveScale = 1;
  }

  // beat reactions
  const beat = envelope(timing.beats, t, 0.15);
  const down = envelope(timing.downbeats, t, 0.2);
  const pulse = 1 + (look.pulse ?? 0) * (0.02 * beat + 0.05 * down);
  const di = hitIndex(timing.downbeats, t);
  const shake = (look.shake ?? 0) * envelope(timing.downbeats, t, 0.12);
  const cut = shot.cut ?? "hard";
  const cutSpike = cut === "glitch" ? Math.exp(-f / 3) : 0;
  const sx = shake * rand(di) + cutSpike * 60 * rand(f + index * 7);
  const sy = shake * rand(di + 0.5);

  const glitch = look.glitch ?? 0;
  const ca = glitch * (16 * down + 50 * cutSpike);
  const slice = cut === "glitch" && f < 4 ? 0.35 + 0.65 * Math.max(glitch, 0.4) * (1 - f / 4) : 0;
  const effects =
    glitch > 0 || slice > 0
      ? [
          sliceShift({ amount: Math.min(1, slice), seed: from + f, disabled: slice <= 0 }),
          rgbShift({ amount: ca, angle: 0, disabled: ca < 0.5 }),
        ]
      : [];

  const kind = kindOf(shot);
  const fit = shot.fit ?? "cover";
  const mediaStyle: React.CSSProperties = {
    position: "absolute",
    width,
    height,
    scale: String(moveScale * pulse),
    translate: `${mx + (sx / width) * 100}% ${my + (sy / height) * 100}%`,
  };

  let opacity = 1;
  if (cut === "fade") opacity = interpolate(f, [0, 0.5 * fps], [0, 1], clamp);
  if (cut === "black") opacity = f < 3 ? 0 : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: shot.color ?? plan.palette.bg, opacity, overflow: "hidden" }}>
      {kind === "image" && shot.src ? (
        <CanvasImage src={staticFile(shot.src)} width={width} height={height} fit={fit} effects={effects} style={mediaStyle} />
      ) : null}
      {kind === "video" && shot.src ? (
        <Video
          src={staticFile(shot.src)}
          muted
          loop
          trimBefore={shot.trim ? Math.round(shot.trim * fps) : undefined}
          playbackRate={shot.rate ?? 1}
          objectFit={fit}
          effects={effects}
          style={mediaStyle}
        />
      ) : null}
      {kind === "color" ? <Pattern shot={shot} plan={plan} timing={timing} t={t} look={look} /> : null}
      {look.tint && (look.tintAmount ?? 0) > 0 ? (
        <AbsoluteFill style={{ backgroundColor: look.tint, mixBlendMode: "color", opacity: look.tintAmount }} />
      ) : null}
      {(look.dim ?? 0) > 0 ? <AbsoluteFill style={{ backgroundColor: "black", opacity: look.dim }} /> : null}
      {cut === "flash" ? (
        <AbsoluteFill style={{ backgroundColor: "white", opacity: interpolate(f, [0, 6], [0.9, 0], clamp) }} />
      ) : null}
    </AbsoluteFill>
  );
};

// Colour grade of the background at time t, from plan.grade keyframes.
export const gradeAt = (plan: Plan, t: number): string | undefined => {
  const keys = plan.grade;
  if (!keys || !keys.length) return undefined;
  const v = (k: keyof Omit<GradeKey, "t">, def: number) => {
    const ks = keys.filter((g) => g[k] !== undefined);
    if (!ks.length) return def;
    if (t <= ks[0].t) return ks[0][k] as number;
    for (let i = 0; i + 1 < ks.length; i++) {
      if (t < ks[i + 1].t) {
        const f = (t - ks[i].t) / (ks[i + 1].t - ks[i].t);
        const a = ks[i][k] as number;
        const b = ks[i + 1][k] as number;
        return a + (b - a) * Easing.inOut(Easing.sin)(f);
      }
    }
    return ks[ks.length - 1][k] as number;
  };
  const s = v("saturate", 1);
  const b = v("brightness", 1);
  const c = v("contrast", 1);
  const h = v("hue", 0);
  return `saturate(${s.toFixed(3)}) brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)})${Math.abs(h) > 0.1 ? ` hue-rotate(${h.toFixed(1)}deg)` : ""}`;
};

export const Background: React.FC<{ plan: Plan; timing: Timing }> = ({ plan, timing }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ filter: gradeAt(plan, frame / fps) }}>
      {plan.shots.map((s, i) => {
        const from = Math.round(s.start * fps);
        const to = Math.round(s.end * fps);
        if (to <= from) return null;
        return (
          <Sequence key={i} from={from} durationInFrames={to - from} premountFor={fps} name={`shot ${i} ${s.src ?? s.pattern ?? "color"}`}>
            <ShotView shot={s} from={from} index={i} plan={plan} timing={timing} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
