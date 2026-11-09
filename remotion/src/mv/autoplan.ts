// First-draft storyboard from timing.json: a look per section (by its Suno label) and shots cut on
// downbeats. Claude edits the result per song (plan.json); this only gives a sensible start.
// Self-contained (type imports only) so scripts/make-plan.ts can run it with plain Node.
import type { Look, Pattern, Plan, Shot, Timing } from "./types";

type Rule = { test: RegExp; look: Look; bars: number; pattern: Pattern; cut: Shot["cut"] };

const RULES: Rule[] = [
  { test: /intro|イントロ/i, look: { lyric: "none", grain: 0.45, bars: 0.6, pulse: 0.1 }, bars: 4, pattern: "none", cut: "fade" },
  { test: /pre|build|bメロ/i, look: { lyric: "stack", pulse: 0.35, dim: 0.4, grain: 0.35 }, bars: 2, pattern: "grid", cut: "hard" },
  { test: /chorus|hook|サビ/i, look: { lyric: "vertical", pulse: 0.6, flash: 0.35, shake: 8, glitch: 0.35, dim: 0.25, grain: 0.3 }, bars: 2, pattern: "rings", cut: "glitch" },
  { test: /drop/i, look: { lyric: "impact", pulse: 0.8, flash: 0.45, shake: 12, glitch: 0.6, dim: 0.3, grain: 0.35 }, bars: 1, pattern: "rings", cut: "glitch" },
  { test: /bridge|interlude|break|間奏/i, look: { lyric: "center", position: "low", bars: 0.6, dim: 0.45, grain: 0.5 }, bars: 4, pattern: "none", cut: "fade" },
  { test: /outro|ending|アウトロ/i, look: { lyric: "center", dim: 0.5, grain: 0.5 }, bars: 4, pattern: "lines", cut: "fade" },
  { test: /verse|aメロ|.*/i, look: { lyric: "center", pulse: 0.15, dim: 0.35, grain: 0.35 }, bars: 4, pattern: "lines", cut: "hard" },
];

const ruleFor = (label: string) => RULES.find((r) => r.test.test(label)) ?? RULES[RULES.length - 1];
const baseLabel = (label: string) => label.replace(/\s*\d+\s*$/, "").trim();

const MOVES: Shot["move"][] = ["in", "left", "out", "right", "up", "in", "down"];

export type AutoPlanOptions = {
  title?: string;
  artist?: string;
  audio?: string;
  media?: string[]; // public/ paths of key visuals and clips, used round-robin
};

export const autoPlan = (timing: Timing, opts: AutoPlanOptions = {}): Plan => {
  const sections: Record<string, Look> = {};
  for (const s of timing.sections) sections[baseLabel(s.label)] ??= { ...ruleFor(s.label).look };

  // the last chorus (when there are several) is set in the impact style
  const lines: Plan["lines"] = {};
  const choruses = timing.sections.filter((s) => /chorus|hook|サビ/i.test(s.label) && !/pre/i.test(s.label));
  if (choruses.length >= 2) {
    const last = choruses[choruses.length - 1];
    timing.lines.forEach((l, i) => {
      if (l.start >= last.start && l.start < last.end) lines[String(i)] = { lyric: "impact", glitch: 0.55, shake: 12, flash: 0.45 };
    });
  }

  // shots: cut every N bars inside each section, starting on the section's downbeat
  const shots: Shot[] = [];
  const media = opts.media ?? [];
  const bounds = timing.sections.map((s, i) => (i === 0 ? 0 : s.downbeat));
  let k = 0;
  timing.sections.forEach((s, si) => {
    const rule = ruleFor(s.label);
    const start = bounds[si];
    const end = si + 1 < bounds.length ? bounds[si + 1] : timing.duration;
    const inside = timing.downbeats.filter((d) => d > start + 0.05 && d < end - 0.05);
    const cuts = [start, ...inside.filter((_, i) => (i + 1) % rule.bars === 0), end];
    for (let c = 0; c + 1 < cuts.length; c++) {
      if (cuts[c + 1] - cuts[c] < 0.2) continue;
      const shot: Shot = {
        start: +cuts[c].toFixed(3),
        end: +cuts[c + 1].toFixed(3),
        move: MOVES[k % MOVES.length],
        cut: c === 0 ? (rule.cut === "glitch" ? "flash" : rule.cut) : rule.cut === "glitch" ? (c % 2 ? "glitch" : "hard") : "hard",
      };
      if (media.length) shot.src = media[k % media.length];
      else {
        shot.kind = "color";
        shot.pattern = rule.pattern;
      }
      shots.push(shot);
      k++;
    }
  });

  const firstSung = timing.lines.length ? timing.lines[0].start : timing.duration;
  return {
    title: opts.title,
    artist: opts.artist,
    audio: opts.audio,
    palette: { bg: "#07080c", fg: "#f3efe6", accent: "#e0473c" },
    fonts: { mincho: "Shippori Mincho", gothic: "Zen Kaku Gothic New", impact: "Dela Gothic One" },
    defaults: { lyric: "center", grain: 0.35, pulse: 0.2 },
    sections,
    lines,
    shots,
    titleCard: opts.title && firstSung > 4 ? { start: 0.5, end: Math.min(firstSung - 0.5, 9) } : undefined,
    fadeOut: 3,
  };
};
