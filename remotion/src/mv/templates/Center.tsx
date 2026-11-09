// Quiet verses: a small centred line, characters rise and sharpen as they are sung,
// a hairline under the line grows with the line's progress.
import React from "react";
import { Easing, interpolate } from "remotion";
import { fontStack } from "../fonts";
import { clamp, type TemplateProps } from "./common";

export const Center: React.FC<TemplateProps> = ({ line, text, chars, t, hideAt, look, plan }) => {
  const size = 58 * (look.size ?? 1);
  const color = look.color ?? plan.palette.fg;
  const accent = look.accent ?? plan.palette.accent;
  const top = look.position === "low" ? 76 : look.position === "high" ? 22 : 50;
  const exit = interpolate(t, [hideAt - 0.35, hideAt], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: "8%",
        right: "8%",
        top: `${top}%`,
        translate: "0 -50%",
        textAlign: "center",
        fontFamily: fontStack(plan, look.font ?? "mincho"),
        fontWeight: 500,
        fontSize: size,
        letterSpacing: "0.14em",
        lineHeight: 1.5,
        color,
        opacity: exit,
        filter: exit < 1 ? `blur(${(1 - exit) * 10}px)` : undefined,
        textShadow: "0 0 18px rgba(0,0,0,0.55)",
      }}
    >
      <div>
        {chars.map((c, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: interpolate(t, [c.t - 0.06, c.t + 0.22], [0, 1], clamp),
              translate: `0 ${interpolate(t, [c.t - 0.06, c.t + 0.4], [16, 0], { ...clamp, easing: Easing.out(Easing.cubic) })}px`,
              filter: `blur(${interpolate(t, [c.t - 0.06, c.t + 0.3], [7, 0], clamp)}px)`,
            }}
          >
            {c.ch}
          </span>
        ))}
      </div>
      <div
        style={{
          margin: "18px auto 0",
          height: 2,
          width: `${interpolate(t, [line.start, line.end], [0, Math.min(70, text.length * 4)], clamp)}%`,
          backgroundColor: accent,
          opacity: 0.8,
        }}
      />
    </div>
  );
};
