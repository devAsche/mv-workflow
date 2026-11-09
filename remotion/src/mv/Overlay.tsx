// Top layer: downbeat flash, cinema bars, film grain, vignette, title card, fade-out, debug HUD.
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { energyAt, envelope, lookAt, sectionAt } from "./beat";
import { fontStack } from "./fonts";
import type { Plan, Timing } from "./types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Grain: React.FC<{ amount: number; frame: number }> = ({ amount, frame }) => {
  const seed = frame % 9;
  return (
    <svg
      viewBox="0 0 960 540"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", mixBlendMode: "overlay", opacity: amount }}
    >
      <filter id={`grain${seed}`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#grain${seed})`} />
    </svg>
  );
};

const TitleCard: React.FC<{ plan: Plan; t: number }> = ({ plan, t }) => {
  const tc = plan.titleCard;
  if (!tc || !plan.title || t < tc.start || t > tc.end) return null;
  const inO = interpolate(t, [tc.start, tc.start + 1.2], [0, 1], clamp);
  const outO = interpolate(t, [tc.end - 0.8, tc.end], [1, 0], clamp);
  const spacing = interpolate(t, [tc.start, tc.end], [0.7, 0.32], { ...clamp, easing: Easing.out(Easing.quad) });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: inO * outO, color: plan.palette.fg }}>
      <div style={{ fontFamily: fontStack(plan, "mincho"), fontWeight: 800, fontSize: 104, letterSpacing: `${spacing}em`, marginRight: `-${spacing}em` }}>
        {plan.title}
      </div>
      {plan.artist ? (
        <div style={{ marginTop: 28, fontFamily: fontStack(plan, "gothic"), fontWeight: 400, fontSize: 30, letterSpacing: "0.5em", opacity: 0.75 }}>
          {plan.artist}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const Overlay: React.FC<{ plan: Plan; timing: Timing; debug?: boolean }> = ({ plan, timing, debug }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, height } = useVideoConfig();
  const t = frame / fps;
  const look = lookAt(plan, timing, t);
  const down = envelope(timing.downbeats, t, 0.12);
  const energy = energyAt(timing, t);
  const flash = (look.flash ?? 0) * 0.55 * down;
  const grain = look.grain ?? 0;
  const bars = look.bars ?? 0;
  const fadeOut = plan.fadeOut ?? 0;
  const endFade = fadeOut > 0 ? interpolate(frame, [durationInFrames - fadeOut * fps, durationInFrames - 1], [0, 1], clamp) : 0;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <TitleCard plan={plan} t={t} />
      {flash > 0.01 ? <AbsoluteFill style={{ backgroundColor: "white", opacity: flash, mixBlendMode: "screen" }} /> : null}
      {bars > 0 ? (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: height * 0.12 * bars, backgroundColor: "black" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.12 * bars, backgroundColor: "black" }} />
        </>
      ) : null}
      {grain > 0 ? <Grain amount={grain * (0.45 + 0.25 * energy)} frame={frame} /> : null}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
      {plan.credits && t >= plan.credits.start && t <= plan.credits.end ? (
        <div
          style={{
            position: "absolute",
            left: "6%",
            bottom: "9%",
            fontFamily: fontStack(plan, "gothic"),
            fontWeight: 400,
            fontSize: 28 * (height / 1080),
            letterSpacing: "0.3em",
            lineHeight: 1.9,
            color: plan.palette.fg,
            opacity:
              interpolate(t, [plan.credits.start, plan.credits.start + 1], [0, 0.85], clamp) *
              interpolate(t, [plan.credits.end - 1, plan.credits.end], [1, 0], clamp),
          }}
        >
          {plan.credits.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : null}
      {endFade > 0 ? <AbsoluteFill style={{ backgroundColor: plan.fadeColor ?? "black", opacity: endFade }} /> : null}
      {debug ? (
        <div
          style={{
            position: "absolute",
            left: 24,
            top: 20,
            padding: "10px 14px",
            fontFamily: "monospace",
            fontSize: 22,
            color: "#fff",
            backgroundColor: "rgba(0,0,0,0.6)",
            lineHeight: 1.4,
          }}
        >
          <div>
            {t.toFixed(2)}s {sectionAt(timing, t)?.label ?? "-"} / {look.lyric ?? "-"}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 18, height: 18, borderRadius: 9, background: "#4af", opacity: envelope(timing.beats, t, 0.12) }} />
            <span style={{ width: 18, height: 18, borderRadius: 9, background: "#f44", opacity: down }} />
            <span style={{ width: 200 * energy, height: 8, background: "#fc4" }} />
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
