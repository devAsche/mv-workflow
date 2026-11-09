// Data shapes shared by the MV composition.
// Timing comes from the PC's mv_analyze job (pc/autopilot/mv/analyze.py -> timing.json).
// Plan is the storyboard: written by scripts/make-plan.mjs, then edited per song.

export type Word = { text: string; start: number; end: number };

export type Line = {
  text: string;
  start: number;
  end: number;
  words: Word[];
  section: string | null;
};

export type Section = { label: string; start: number; end: number; downbeat: number };

export type Timing = {
  version: number;
  audio: string;
  duration: number;
  bpm: number | null;
  beats: number[];
  downbeats: number[];
  energy: { hop: number; values: number[] };
  sections: Section[];
  lines: Line[];
};

// How the lyrics of a section are set.
//   center   small centred line, characters fade up (quiet verses)
//   vertical giant vertical mincho columns that stamp in (choruses)
//   impact   one big bold line, characters punch in with an RGB split (drops, last chorus)
//   stack    lines pile up bottom-left, older lines dim (pre-chorus build)
//   none     no lyrics (intro, instrumental)
//   drops    onomatopoeia: characters fall like raindrops and land with a ripple, chunks scattered
export type LyricStyle = "center" | "vertical" | "impact" | "stack" | "drops" | "none";

export type FontRole = "mincho" | "gothic" | "impact";

export type Look = {
  lyric?: LyricStyle;
  font?: FontRole;
  size?: number; // multiplier on the template's base size
  color?: string; // text colour
  accent?: string; // second colour (rules, RGB split, rings)
  pulse?: number; // 0..1 background zoom on beats
  flash?: number; // 0..1 white flash on downbeats
  shake?: number; // pixels of shake on downbeats
  glitch?: number; // 0..1 RGB split on text and background, spikes on cuts and downbeats
  grain?: number; // 0..1 film grain
  dim?: number; // 0..1 darken the background behind the lyrics
  bars?: number; // 0..1 cinema bars
  tint?: string; // colour laid over the background (mix-blend: color)
  tintAmount?: number; // 0..1
  position?: "center" | "low" | "high"; // for center/impact
  rain?: number; // 0..1 density of falling rain streaks over the background
  rainAngle?: number; // degrees from vertical, positive leans right
  rainSpeed?: number; // multiplier, default 1
  ripples?: number; // 0..1 ripples spawned on beats in the lower part of the frame
  sparkle?: number; // 0..1 twinkling four-point stars
};

// Colour grade keyframes over the whole video (background layer only), linearly interpolated.
export type GradeKey = {
  t: number; // seconds
  saturate?: number; // 1 = as is, 0 = monochrome
  brightness?: number; // 1 = as is
  contrast?: number; // 1 = as is
  hue?: number; // degrees
};

export type Pattern = "lines" | "rings" | "grid" | "none";

export type Shot = {
  start: number;
  end: number;
  kind?: "image" | "video" | "color";
  src?: string; // path inside public/
  color?: string; // for kind=color, defaults to palette.bg
  pattern?: Pattern; // generative motif drawn over a color shot
  move?: "in" | "out" | "left" | "right" | "up" | "down" | "none";
  amount?: number; // strength of the move, default 1
  cut?: "hard" | "flash" | "glitch" | "fade" | "black";
  trim?: number; // seconds to skip at the start of a video
  rate?: number; // playback rate of a video
  fit?: "cover" | "contain";
  look?: Look; // per-shot override of the section look (grain, glitch, tint ...)
};

export type Plan = {
  title?: string;
  artist?: string;
  audio?: string; // path inside public/, empty = silent preview
  palette: { bg: string; fg: string; accent: string };
  fonts: { mincho: string; gothic: string; impact: string }; // Google Fonts family names
  defaults: Look;
  sections: Record<string, Look>; // by section label; "Chorus" also matches "Chorus 2"
  lines?: Record<string, Look & { text?: string; hide?: boolean }>; // overrides by line index
  shots: Shot[];
  titleCard?: { start: number; end: number }; // seconds; shows title/artist
  fadeOut?: number; // seconds of fade to black at the end
  fadeColor?: string; // colour of the end fade, default black
  grade?: GradeKey[]; // colour arc of the song (e.g. monochrome verses, colour returning)
  credits?: { start: number; end: number; lines: string[] }; // small text block, bottom-left
};

export type MVProps = {
  timing?: Timing;
  plan?: Plan;
  timingSrc?: string; // alternative to timing: a JSON file inside public/
  planSrc?: string;
  debug?: boolean; // section name, time and beat lamps in the corner
};
