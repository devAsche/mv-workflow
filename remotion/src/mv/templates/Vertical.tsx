// Choruses: giant vertical mincho columns. Each character stamps in (big -> settled) and leaves
// an outlined echo that expands and fades. Lines alternate between the right and left side.
import React from "react";
import { Easing, interpolate, useVideoConfig } from "remotion";
import { envelope, hitIndex, rand } from "../beat";
import { fontStack } from "../fonts";
import { clamp, rgbSplit, splitChunks, type TemplateProps } from "./common";

export const Vertical: React.FC<TemplateProps> = ({ line, index, chars, t, hideAt, look, plan, timing }) => {
  const { height } = useVideoConfig();
  const cols = splitChunks(chars, 9);
  const maxLen = Math.max(1, ...cols.map((c) => c.length));
  const size = Math.min(170, (height * 0.8) / maxLen) * (look.size ?? 1);
  const color = look.color ?? plan.palette.fg;
  const accent = look.accent ?? plan.palette.accent;
  const right = index % 2 === 0;
  const exit = interpolate(t, [hideAt - 0.14, hideAt], [1, 0], clamp);
  const down = envelope(timing.downbeats, t, 0.12);
  const di = hitIndex(timing.downbeats, t);
  const shake = (look.shake ?? 0) * 0.6 * down;
  const glitch = look.glitch ?? 0;
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        [right ? "right" : "left"]: "9%",
        translate: `${shake * rand(di + 3)}px calc(-50% + ${shake * rand(di + 4) + (1 - exit) * 30}px)`,
        display: "flex",
        flexDirection: "row-reverse",
        gap: size * 0.35,
        alignItems: "flex-start",
        opacity: exit,
        fontFamily: fontStack(plan, look.font ?? "mincho"),
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        color,
      }}
    >
      {cols.map((col, ci) => (
        <div key={ci} style={{ writingMode: "vertical-rl", marginTop: ci * size * 0.9, position: "relative" }}>
          {col.map((c, i) => {
            const k = t - c.t;
            const on = interpolate(k, [-0.02, 0.05], [0, 1], clamp);
            const sc = interpolate(k, [-0.02, 0.16], [1.55, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
            const echoS = interpolate(k, [0, 0.55], [1, 1.9], { ...clamp, easing: Easing.out(Easing.quad) });
            const echoO = interpolate(k, [0, 0.55], [0.7, 0], clamp);
            const dx = glitch * (22 * Math.exp(-Math.max(0, k) / 0.07) * on + 8 * down);
            return (
              <span key={i} style={{ position: "relative", display: "inline-block" }}>
                <span style={{ display: "inline-block", opacity: on, scale: String(sc), textShadow: rgbSplit(dx, accent) }}>{c.ch}</span>
                {k > 0 && echoO > 0 ? (
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      color: "transparent",
                      WebkitTextStroke: `1.5px ${accent}`,
                      scale: String(echoS),
                      opacity: echoO,
                    }}
                  >
                    {c.ch}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      ))}
      <div
        style={{
          width: 2,
          alignSelf: "stretch",
          backgroundColor: accent,
          opacity: 0.7,
          scale: `1 ${interpolate(t, [line.start, line.end], [0, 1], clamp)}`,
          transformOrigin: "50% 0%",
        }}
      />
    </div>
  );
};
