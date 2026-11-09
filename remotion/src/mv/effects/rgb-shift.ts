// RGB split (chromatic aberration) on the 2D canvas, so renders never depend on WebGL.
// The red channel moves one way, blue the other, green stays.
import { createEffect, type InteractivitySchema } from "remotion";

type RgbShiftParams = {
  readonly amount?: number; // pixels of separation
  readonly angle?: number; // degrees, 0 = horizontal
};

const schema = {
  amount: { type: "number", min: 0, max: 80, step: 0.5, default: 8, description: "Amount", hiddenFromList: false },
  angle: { type: "number", min: 0, max: 360, step: 1, default: 0, description: "Angle", hiddenFromList: false },
} as const satisfies InteractivitySchema;

const resolve = (p: RgbShiftParams) => ({ amount: p.amount ?? 8, angle: p.angle ?? 0 });

type State = { tmp: HTMLCanvasElement };

export const rgbShift = createEffect<RgbShiftParams, State>({
  type: "dev.devasche.rgbShift",
  label: "rgbShift()",
  documentationLink: null,
  backend: "2d",
  calculateKey: (p) => {
    const { amount, angle } = resolve(p);
    return `rgb-shift-${amount}-${angle}`;
  },
  setup: () => ({ tmp: document.createElement("canvas") }),
  apply: ({ source, target, width, height, params, state }) => {
    const ctx = target.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D context for rgbShift().");
    const { amount, angle } = resolve(params);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, width, height);
    if (amount < 0.5) {
      ctx.drawImage(source, 0, 0, width, height);
      return;
    }
    const { tmp } = state;
    if (tmp.width !== width || tmp.height !== height) {
      tmp.width = width;
      tmp.height = height;
    }
    const t = tmp.getContext("2d");
    if (!t) throw new Error("Could not get a 2D context for rgbShift() scratch canvas.");
    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad) * amount;
    const dy = Math.sin(rad) * amount;
    const channels: [string, number, number][] = [
      ["#ff0000", dx, dy],
      ["#00ff00", 0, 0],
      ["#0000ff", -dx, -dy],
    ];
    for (const [color, ox, oy] of channels) {
      t.globalCompositeOperation = "source-over";
      t.clearRect(0, 0, width, height);
      t.drawImage(source, 0, 0, width, height);
      t.globalCompositeOperation = "multiply";
      t.fillStyle = color;
      t.fillRect(0, 0, width, height);
      t.globalCompositeOperation = "destination-in";
      t.drawImage(source, 0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(tmp, ox, oy);
    }
    t.globalCompositeOperation = "source-over";
    ctx.globalCompositeOperation = "source-over";
  },
  cleanup: () => undefined,
  schema,
  validateParams: ({ amount = 8 }) => {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      throw new TypeError("amount must be a positive number");
    }
  },
});
