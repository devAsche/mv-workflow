import type { TimedChar } from "../beat";
import type { Line, Look, Plan, Timing } from "../types";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type TemplateProps = {
  line: Line;
  index: number; // line index in the song
  text: string;
  chars: TimedChar[];
  t: number; // absolute time in seconds
  hideAt: number; // when the line must be gone
  look: Look;
  plan: Plan;
  timing: Timing;
};

// RGB split for text: two coloured shadows, offset in px.
export const rgbSplit = (dx: number, accent: string) =>
  dx < 0.3 ? undefined : `${dx}px 0 0 ${accent}, ${-dx}px 0 0 rgba(0, 220, 255, 0.85)`;

// Split a lyric into chunks at spaces, then cut chunks longer than max characters.
export const splitChunks = (chars: TimedChar[], max: number): TimedChar[][] => {
  const out: TimedChar[][] = [];
  let cur: TimedChar[] = [];
  for (const c of chars) {
    if (/\s/.test(c.ch)) {
      if (cur.length) out.push(cur);
      cur = [];
      continue;
    }
    cur.push(c);
    if (cur.length >= max) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
};
