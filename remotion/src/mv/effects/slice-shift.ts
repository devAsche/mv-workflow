// Glitch cut: shifts a few horizontal bands of the picture sideways (2D canvas, no WebGL needed).
import { createEffect, type InteractivitySchema } from "remotion";

type SliceShiftParams = {
  readonly amount?: number; // 0..1, band shift as a share of 8% of the width
  readonly seed?: number; // changes which bands move
  readonly bands?: number; // how many bands
};

const schema = {
  amount: { type: "number", min: 0, max: 1, step: 0.01, default: 0.5, description: "Amount", hiddenFromList: false },
  seed: { type: "number", min: 0, max: 1000, step: 1, default: 0, description: "Seed", hiddenFromList: false },
  bands: { type: "number", min: 1, max: 24, step: 1, default: 7, description: "Bands", hiddenFromList: false },
} as const satisfies InteractivitySchema;

const resolve = (p: SliceShiftParams) => ({ amount: p.amount ?? 0.5, seed: p.seed ?? 0, bands: p.bands ?? 7 });

const rnd = (x: number) => {
  const s = Math.sin(x * 91.345 + 47.853) * 43758.5453;
  return s - Math.floor(s);
};

export const sliceShift = createEffect<SliceShiftParams, null>({
  type: "dev.devasche.sliceShift",
  label: "sliceShift()",
  documentationLink: null,
  backend: "2d",
  calculateKey: (p) => {
    const { amount, seed, bands } = resolve(p);
    return `slice-shift-${amount}-${seed}-${bands}`;
  },
  setup: () => null,
  apply: ({ source, target, width, height, params }) => {
    const ctx = target.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D context for sliceShift().");
    const { amount, seed, bands } = resolve(params);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    if (amount <= 0) return;
    const sw = (source as { width?: number }).width ?? width;
    const sh = (source as { height?: number }).height ?? height;
    for (let k = 0; k < bands; k++) {
      const y = rnd(seed * 31 + k * 7) * height;
      const h = Math.max(2, (0.008 + 0.06 * rnd(seed * 17 + k * 13)) * height);
      const dx = (rnd(seed * 7 + k * 3) * 2 - 1) * amount * width * 0.08;
      ctx.drawImage(source, 0, (y / height) * sh, sw, (h / height) * sh, dx, y, width, h);
    }
  },
  cleanup: () => undefined,
  schema,
  validateParams: ({ amount = 0.5 }) => {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1) {
      throw new TypeError("amount must be a number between 0 and 1");
    }
  },
});
