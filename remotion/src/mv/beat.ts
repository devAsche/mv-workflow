// Time helpers: beats, downbeats, energy, the look that applies at a moment, character timing.
import type { Line, Look, Plan, Section, Timing } from "./types";

// Index of the last value <= t in a sorted array, or -1.
export const lastIndexAtOrBefore = (arr: number[], t: number): number => {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
};

// 1 right on a hit, decaying exponentially afterwards.
export const envelope = (arr: number[], t: number, decay: number): number => {
  const i = lastIndexAtOrBefore(arr, t);
  if (i < 0) return 0;
  return Math.exp(-(t - arr[i]) / decay);
};

export const hitIndex = (arr: number[], t: number) => lastIndexAtOrBefore(arr, t);

export const energyAt = (timing: Timing, t: number): number => {
  const { hop, values } = timing.energy;
  if (!values.length) return 0.5;
  const x = t / hop;
  const i = Math.max(0, Math.min(values.length - 1, Math.floor(x)));
  const j = Math.min(values.length - 1, i + 1);
  const f = x - Math.floor(x);
  return values[i] * (1 - f) + values[j] * f;
};

export const sectionAt = (timing: Timing, t: number): Section | null => {
  for (const s of timing.sections) {
    if (t >= s.start && t < s.end) return s;
  }
  return timing.sections.length ? timing.sections[timing.sections.length - 1] : null;
};

const baseLabel = (label: string) => label.replace(/\s*\d+\s*$/, "").trim();

export const lookForLabel = (plan: Plan, label: string | null | undefined): Look => {
  if (!label) return plan.defaults;
  const exact = plan.sections[label];
  const base = plan.sections[baseLabel(label)];
  return { ...plan.defaults, ...(base ?? {}), ...(exact ?? {}) };
};

export const lookAt = (plan: Plan, timing: Timing, t: number): Look =>
  lookForLabel(plan, sectionAt(timing, t)?.label);

// Per-character reveal times for a lyric line. Uses the aligned words when they cover the
// line text; otherwise spreads the characters over the first 70% of the line.
export type TimedChar = { ch: string; t: number };

export const charTimes = (line: Line, text: string): TimedChar[] => {
  const chars = Array.from(text);
  const words = (line.words ?? []).filter((w) => w.text.trim().length > 0);
  const joined = words.map((w) => w.text.replace(/\s+/g, "")).join("");
  const plain = chars.filter((c) => !/\s/.test(c)).join("");
  if (words.length && joined.length >= plain.length * 0.8 && joined.length <= plain.length * 1.25) {
    // walk characters of the line, consuming word characters in order
    const out: TimedChar[] = [];
    let wi = 0;
    let used = 0;
    let lastT = words[0].start;
    for (const ch of chars) {
      if (/\s/.test(ch)) {
        out.push({ ch, t: lastT });
        continue;
      }
      const w = words[Math.min(wi, words.length - 1)];
      const wlen = Math.max(1, Array.from(w.text.replace(/\s+/g, "")).length);
      const span = Math.min(Math.max(w.end - w.start, 0.05), 0.45);
      const t = w.start + (span * used) / wlen;
      out.push({ ch, t });
      lastT = t;
      used += 1;
      if (used >= wlen && wi < words.length - 1) {
        wi += 1;
        used = 0;
      }
    }
    return out;
  }
  const dur = Math.max(0.2, (line.end - line.start) * 0.7);
  const n = Math.max(1, chars.length);
  return chars.map((ch, i) => ({ ch, t: line.start + (dur * i) / n }));
};

// Deterministic pseudo-random in [-1, 1].
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

// A numeric look value that eases from the previous section's value into the current one over
// `ramp` seconds after the section starts, so rain, dim and the like do not jump at a boundary.
export const smoothLook = (plan: Plan, timing: Timing, t: number, key: keyof Look, ramp = 1.5, fallback = 0): number => {
  const sec = sectionAt(timing, t);
  const cur = lookForLabel(plan, sec?.label)[key];
  const curV = typeof cur === "number" ? cur : fallback;
  if (!sec) return curV;
  const i = timing.sections.indexOf(sec);
  if (i <= 0 || t - sec.start >= ramp) return curV;
  const prev = lookForLabel(plan, timing.sections[i - 1].label)[key];
  const prevV = typeof prev === "number" ? prev : fallback;
  const f = Math.max(0, (t - sec.start) / ramp);
  return prevV + (curV - prevV) * f;
};

// Deterministic hash in [0, 1).
export const hash01 = (a: number, b = 0) => {
  const x = Math.sin(a * 12.9898 + b * 78.233 + 0.5) * 43758.5453;
  return x - Math.floor(x);
};
