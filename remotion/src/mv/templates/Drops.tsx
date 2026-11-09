// Onomatopoeia ("ぽつり ぽつり"): each space-separated chunk sits at its own spot; every character
// falls like a raindrop, lands exactly when it is sung, squashes a little and leaves a ripple.
import React from "react";
import { Easing, interpolate, useVideoConfig } from "remotion";
import { hash01 } from "../beat";
import { fontStack } from "../fonts";
import { clamp, splitChunks, type TemplateProps } from "./common";

const FALL = 0.32; // seconds of fall before the character lands on its syllable

export const Drops: React.FC<TemplateProps> = ({ index, chars, t, hideAt, look, plan }) => {
  const { width, height } = useVideoConfig();
  const chunks = splitChunks(chars, 6);
  const n = chunks.length;
  const size = 132 * (look.size ?? 1) * (height / 1080);
  const color = look.color ?? plan.palette.fg;
  const accent = look.accent ?? plan.palette.accent;
  const exit = interpolate(t, [hideAt - 0.3, hideAt], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: exit }}>
      {chunks.map((chunk, j) => {
        // chunks step across the frame, alternating high and low, with a little per-line jitter
        const fx = n === 1 ? 0.5 : 0.2 + (0.6 * j) / (n - 1);
        const fy = 0.42 + (j % 2 === 0 ? -0.08 : 0.1) + 0.04 * (hash01(index, j) - 0.5);
        const cw = size * chunk.length;
        return (
          <div
            key={j}
            style={{
              position: "absolute",
              left: width * fx - cw / 2,
              top: height * fy - size / 2,
              display: "flex",
              fontFamily: fontStack(plan, look.font ?? "mincho"),
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1,
              color,
              textShadow: "0 0 24px rgba(0,0,0,0.45)",
            }}
          >
            {chunk.map((c, i) => {
              const k = t - c.t;
              const fall = interpolate(k, [-FALL, 0], [-height * 0.55, 0], { ...clamp, easing: Easing.in(Easing.quad) });
              const op = interpolate(k, [-FALL, -FALL + 0.08], [0, 1], clamp);
              const squash = k >= 0 ? interpolate(k, [0, 0.06, 0.22], [1, 0.82, 1], clamp) : 1.08;
              const ringK = Math.max(0, k);
              const ringR = interpolate(ringK, [0, 0.7], [0.15, 1.1], { ...clamp, easing: Easing.out(Easing.quad) });
              const ringO = k >= 0 ? interpolate(ringK, [0, 0.7], [0.9, 0], clamp) : 0;
              return (
                <span key={i} style={{ position: "relative", display: "inline-block", width: size }}>
                  <span
                    style={{
                      display: "inline-block",
                      opacity: op,
                      translate: `0 ${fall}px`,
                      scale: `${2 - squash} ${squash}`,
                      transformOrigin: "50% 100%",
                    }}
                  >
                    {c.ch}
                  </span>
                  {ringO > 0 ? (
                    <span
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: "100%",
                        width: size * 1.6,
                        height: size * 0.4,
                        translate: "-50% -30%",
                        scale: String(ringR),
                        borderRadius: "50%",
                        border: `2px solid ${accent}`,
                        opacity: ringO,
                      }}
                    />
                  ) : null}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
