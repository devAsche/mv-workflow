// A made-up 48-second song for working on the templates in Remotion Studio without real data.
// 120 BPM, a bar every 2 s. The lyric lines are placeholder text written for this sample.
import type { Line, Section, Timing } from "./types";

const lyric = (text: string, start: number, end: number, section: string): Line => {
  const chars = Array.from(text).filter((c) => c !== " ");
  const span = (end - start) * 0.8;
  const words = chars.map((c, i) => ({
    text: c,
    start: +(start + (span * i) / chars.length).toFixed(3),
    end: +(start + (span * (i + 1)) / chars.length).toFixed(3),
  }));
  return { text, start, end, words, section };
};

const lines: Line[] = [
  lyric("夜の端で 名前を呼んだ", 8.4, 11.6, "Verse"),
  lyric("返事のない 街の灯り", 12.2, 15.4, "Verse"),
  lyric("まだ 消えないで", 18.2, 20.0, "Pre-Chorus"),
  lyric("この声が 届くまで", 20.4, 22.6, "Pre-Chorus"),
  lyric("あと少しだけ", 23.0, 25.2, "Pre-Chorus"),
  lyric("空を裂いて", 26.1, 28.0, "Chorus"),
  lyric("君へ走る", 28.2, 30.0, "Chorus"),
  lyric("明日なんて いらない", 30.2, 33.6, "Chorus"),
  lyric("今を燃やせ", 38.1, 40.0, "Drop"),
  lyric("最後の光まで", 40.3, 43.4, "Drop"),
  lyric("おやすみ", 44.6, 46.4, "Outro"),
];

const sections: Section[] = [
  { label: "Intro", start: 0, end: 8.4, downbeat: 0 },
  { label: "Verse", start: 8.4, end: 18.2, downbeat: 8 },
  { label: "Pre-Chorus", start: 18.2, end: 26.1, downbeat: 18 },
  { label: "Chorus", start: 26.1, end: 38.1, downbeat: 26 },
  { label: "Drop", start: 38.1, end: 44.6, downbeat: 38 },
  { label: "Outro", start: 44.6, end: 48, downbeat: 44 },
];

const beats = Array.from({ length: 96 }, (_, i) => i * 0.5);
const downbeats = beats.filter((_, i) => i % 4 === 0);
const energy = Array.from({ length: 192 }, (_, i) => {
  const t = i * 0.25;
  const base = t < 8 ? 0.25 : t < 18 ? 0.45 : t < 26 ? 0.6 : t < 44 ? 0.9 : 0.3;
  return +(base * (0.85 + 0.15 * Math.abs(Math.sin(t * Math.PI)))).toFixed(3);
});

export const sampleTiming: Timing = {
  version: 1,
  audio: "",
  duration: 48,
  bpm: 120,
  beats,
  downbeats,
  energy: { hop: 0.25, values: energy },
  sections,
  lines,
};
