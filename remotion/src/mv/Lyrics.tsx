// Lyric layer: picks the lines on screen at this moment and sets each with its section's template.
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { charTimes, lookForLabel, type TimedChar } from "./beat";
import { Center } from "./templates/Center";
import { Impact } from "./templates/Impact";
import { Stack, type StackItem } from "./templates/Stack";
import { Vertical } from "./templates/Vertical";
import type { Line, Look, Plan, Timing } from "./types";

const LEAD = 0.25; // seconds a line is mounted before its first word
const TAIL = 0.6; // seconds a line stays after its last word (if the next line allows)

type Prepared = { line: Line; index: number; text: string; chars: TimedChar[]; look: Look; hideAt: number };

export const prepareLines = (plan: Plan, timing: Timing): Prepared[] => {
  const out: Prepared[] = [];
  timing.lines.forEach((line, index) => {
    const ov = plan.lines?.[String(index)] ?? {};
    if (ov.hide) return;
    const text = ov.text ?? line.text;
    const lookOv: Look = { ...ov };
    delete (lookOv as { text?: string }).text;
    delete (lookOv as { hide?: boolean }).hide;
    const look = { ...lookForLabel(plan, line.section), ...lookOv };
    out.push({ line, index, text, chars: charTimes(line, text), look, hideAt: 0 });
  });
  out.forEach((p, i) => {
    const next = out[i + 1];
    const natural = p.line.end + TAIL;
    p.hideAt = next ? Math.max(p.line.end + 0.05, Math.min(natural, next.line.start - 0.04)) : natural;
  });
  return out;
};

export const Lyrics: React.FC<{ plan: Plan; timing: Timing }> = ({ plan, timing }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lines = useMemo(() => prepareLines(plan, timing), [plan, timing]);

  const nodes: React.ReactNode[] = [];

  // stack: all lines of the current section that have started (last 5), cleared at section end
  const stackLines = lines.filter((p) => p.look.lyric === "stack");
  if (stackLines.length) {
    const current = stackLines.filter((p) => p.line.start - LEAD <= t);
    const last = current[current.length - 1];
    if (last) {
      const sec = timing.sections.find((s) => last.line.start >= s.start && last.line.start < s.end);
      const group = current.filter((p) => p.line.section === last.line.section && (!sec || p.line.start >= sec.start));
      const nextNonStack = lines.find((p) => p.line.start > last.line.start && p.look.lyric !== "stack");
      const clearAt = Math.min(sec ? sec.end : last.hideAt, nextNonStack ? nextNonStack.line.start - 0.04 : Infinity, last.line.end + 4);
      if (t < clearAt) {
        const items: StackItem[] = group.slice(-5).map((p) => ({ line: p.line, chars: p.chars, index: p.index }));
        nodes.push(<Stack key="stack" items={items} t={t} clearAt={clearAt} look={last.look} plan={plan} />);
      }
    }
  }

  for (const p of lines) {
    if (p.look.lyric === "stack" || p.look.lyric === "none") continue;
    if (t < p.line.start - LEAD || t >= p.hideAt) continue;
    const props = { line: p.line, index: p.index, text: p.text, chars: p.chars, t, hideAt: p.hideAt, look: p.look, plan, timing };
    if (p.look.lyric === "vertical") nodes.push(<Vertical key={p.index} {...props} />);
    else if (p.look.lyric === "impact") nodes.push(<Impact key={p.index} {...props} />);
    else nodes.push(<Center key={p.index} {...props} />);
  }

  return <AbsoluteFill style={{ pointerEvents: "none" }}>{nodes}</AbsoluteFill>;
};
