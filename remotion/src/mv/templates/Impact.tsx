// Drops and the last chorus: one big heavy line, characters punch in on their syllable with an
// RGB split that decays; the whole line jolts on downbeats and cuts out hard.
import React from "react";
import { Easing, interpolate, useVideoConfig } from "remotion";
import { envelope, hitIndex, rand } from "../beat";
import { fontStack } from "../fonts";
import { clamp, rgbSplit, splitChunks, type TemplateProps } from "./common";

export const Impact: React.FC<TemplateProps> = ({ chars, t, look, plan, timing }) => {
  const { width } = useVideoConfig();
  const plain = chars.filter((c) => !/\s/.test(c.ch));
  const rows = plain.length > 11 ? splitChunks(chars, Math.ceil(plain.length / 2)) : [chars];
  const maxLen = Math.max(1, ...rows.map((r) => r.length));
  const size = Math.min(230, (width * 0.86) / maxLen) * (look.size ?? 1);
  const color = look.color ?? plan.palette.fg;
  const accent = look.accent ?? plan.palette.accent;
  const top = look.position === "low" ? 70 : look.position === "high" ? 30 : 50;
  const down = envelope(timing.downbeats, t, 0.14);
  const di = hitIndex(timing.downbeats, t);
  const shake = (look.shake ?? 0) * down;
  const glitch = look.glitch ?? 0.5;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: `${top}%`,
        translate: `${shake * rand(di + 9)}px calc(-50% + ${shake * rand(di + 11)}px)`,
        scale: String(1 + 0.03 * down),
        textAlign: "center",
        fontFamily: fontStack(plan, look.font ?? "impact"),
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1.12,
        color,
      }}
    >
      {rows.map((row, ri) => (
        <div key={ri} style={{ whiteSpace: "nowrap" }}>
          {row.map((c, i) => {
            const k = t - c.t;
            if (k < -0.01) {
              return (
                <span key={i} style={{ display: "inline-block", opacity: 0 }}>
                  {c.ch}
                </span>
              );
            }
            const sc = interpolate(k, [0, 0.12], [1.4, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
            const dx = 3 + glitch * (30 * Math.exp(-Math.max(0, k) / 0.08) + 10 * down);
            return (
              <span key={i} style={{ display: "inline-block", whiteSpace: "pre", scale: String(sc), textShadow: rgbSplit(dx, accent) }}>
                {c.ch}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
