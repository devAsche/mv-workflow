// Draft storyboard from timing.json (runs with plain Node 22.18+, which strips the types).
//   node scripts/make-plan.ts public/song/timing.json --title "曲名" --artist "名前" \
//        --audio song/song.wav --media song/kv01.png,song/h3_01.mp4 > public/song/plan.json
// Without a timing file (--sample) it uses the built-in 48-second sample song.
import { readFileSync } from "node:fs";
import { autoPlan, type AutoPlanOptions } from "../src/mv/autoplan.ts";
import { sampleTiming } from "../src/mv/sample.ts";
import type { Timing } from "../src/mv/types.ts";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const file = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--")));
const timing: Timing = args.includes("--sample") || !file ? sampleTiming : JSON.parse(readFileSync(file, "utf8"));

const options: AutoPlanOptions = {
  title: opt("title"),
  artist: opt("artist"),
  audio: opt("audio"),
  media: opt("media")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

process.stdout.write(JSON.stringify(autoPlan(timing, options), null, 1) + "\n");
