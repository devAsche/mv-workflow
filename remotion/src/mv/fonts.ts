// Loads Google Fonts subset to just the characters the song uses (css2 API "text=" parameter).
// A full Japanese font is 100+ files; this is one small file per weight.
// If the network is down, rendering continues with the fallback fonts below.
import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import type { FontRole, Plan } from "./types";

const WEIGHTS: Record<FontRole, number[]> = {
  mincho: [500, 800],
  gothic: [400, 700, 900],
  impact: [400],
};

export const FALLBACK: Record<FontRole, string> = {
  mincho: '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif',
  gothic: '"Yu Gothic", "YuGothic", "Hiragino Sans", "Noto Sans CJK JP", sans-serif',
  impact: '"Yu Gothic", "Hiragino Sans", "Noto Sans CJK JP", sans-serif',
};

export const fontStack = (plan: Plan, role: FontRole) => `"${plan.fonts[role]}", ${FALLBACK[role]}`;

const loaded = new Set<string>();

const loadOne = async (family: string, weights: number[], text: string) => {
  // try the requested weights; some families only have one weight, so retry with the default
  const tries = [
    `family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weights.join(";")}`,
    `family=${encodeURIComponent(family).replace(/%20/g, "+")}`,
  ];
  for (const q of tries) {
    const res = await fetch(`https://fonts.googleapis.com/css2?${q}&text=${encodeURIComponent(text)}&display=block`);
    if (!res.ok) continue;
    const css = await res.text();
    const blocks = css.match(/@font-face\s*{[^}]*}/g) ?? [];
    await Promise.all(
      blocks.map(async (b) => {
        const url = b.match(/url\(([^)]+)\)/)?.[1];
        const weight = b.match(/font-weight:\s*([0-9]+)/)?.[1] ?? "400";
        if (!url) return;
        const face = new FontFace(family, `url(${url})`, { weight, style: "normal" });
        await face.load();
        document.fonts.add(face);
      }),
    );
    return;
  }
  throw new Error(`no font css for ${family}`);
};

export const useSongFonts = (plan: Plan, text: string) => {
  const [handle] = useState(() => delayRender("Loading lyric fonts", { timeoutInMilliseconds: 60000 }));
  useEffect(() => {
    const uniq = Array.from(new Set(Array.from(text + "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,!?-–—()「」『』、。・…ー〜"))).join("");
    const jobs = (Object.keys(WEIGHTS) as FontRole[]).map((role) => {
      const key = `${plan.fonts[role]}|${uniq}`;
      if (loaded.has(key)) return Promise.resolve();
      return loadOne(plan.fonts[role], WEIGHTS[role], uniq)
        .then(() => {
          loaded.add(key);
        })
        .catch((e) => console.warn(`font ${plan.fonts[role]} not loaded, using fallback:`, e));
    });
    Promise.all(jobs).finally(() => continueRender(handle));
  }, [handle, plan.fonts, text]);
};
