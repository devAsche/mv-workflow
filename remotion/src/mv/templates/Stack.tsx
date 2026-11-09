// Builds (pre-chorus): the lines of a section pile up bottom-left. A new line wipes in at the
// bottom and pushes the older ones up, which dim. Everything clears just before the section ends.
import React from "react";
import { Easing, interpolate } from "remotion";
import type { TimedChar } from "../beat";
import { fontStack } from "../fonts";
import type { Line, Look, Plan } from "../types";
import { clamp } from "./common";

export type StackItem = { line: Line; chars: TimedChar[]; index: number };

export const Stack: React.FC<{ items: StackItem[]; t: number; clearAt: number; look: Look; plan: Plan }> = ({
  items,
  t,
  clearAt,
  look,
  plan,
}) => {
  const size = 62 * (look.size ?? 1);
  const lh = size * 1.55;
  const color = look.color ?? plan.palette.fg;
  const accent = look.accent ?? plan.palette.accent;
  const newest = items[items.length - 1];
  const m = interpolate(t, [newest.line.start - 0.12, newest.line.start + 0.22], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const exit = interpolate(t, [clearAt - 0.3, clearAt], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: "9%", bottom: "16%", opacity: exit }}>
      {items.map((it, j) => {
        const fromNewest = items.length - 1 - j;
        const slot = fromNewest === 0 ? 0 : fromNewest - 1 + m;
        const dimTo = fromNewest === 0 ? 1 : Math.max(0.12, 0.42 - 0.1 * (fromNewest - 1));
        const op = fromNewest === 1 ? interpolate(m, [0, 1], [1, dimTo]) : dimTo;
        return (
          <div
            key={it.index}
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              whiteSpace: "nowrap",
              translate: `0 ${-slot * lh}px`,
              opacity: op,
              fontFamily: fontStack(plan, look.font ?? "mincho"),
              fontWeight: 500,
              fontSize: size,
              letterSpacing: "0.08em",
              color,
              textShadow: "0 0 16px rgba(0,0,0,0.5)",
            }}
          >
            <span style={{ display: "inline-block", width: 6, height: size * 0.9, backgroundColor: accent, marginRight: size * 0.45, verticalAlign: "middle", opacity: fromNewest === 0 ? 1 : 0.4 }} />
            {it.chars.map((c, i) => (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  whiteSpace: "pre",
                  opacity: interpolate(t, [c.t - 0.04, c.t + 0.1], [0, 1], clamp),
                  translate: `${interpolate(t, [c.t - 0.04, c.t + 0.18], [-14, 0], { ...clamp, easing: Easing.out(Easing.cubic) })}px 0`,
                }}
              >
                {c.ch}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};
