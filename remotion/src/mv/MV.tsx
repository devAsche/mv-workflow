// The music video: background shots, lyrics and overlays, all driven by timing.json + plan.json.
import { Audio } from "@remotion/media";
import React, { useMemo } from "react";
import { AbsoluteFill, staticFile, type CalculateMetadataFunction } from "remotion";
import { useSongFonts } from "./fonts";
import { Background } from "./Background";
import { Lyrics } from "./Lyrics";
import { Overlay } from "./Overlay";
import type { MVProps, Plan, Timing } from "./types";

export const FPS = 30;

export const calculateMVMetadata: CalculateMetadataFunction<MVProps> = async ({ props, abortSignal }) => {
  const load = async <T,>(src: string): Promise<T> => {
    const res = await fetch(staticFile(src), { signal: abortSignal });
    if (!res.ok) throw new Error(`could not load public/${src} (${res.status})`);
    return (await res.json()) as T;
  };
  const timing = props.timing ?? (props.timingSrc ? await load<Timing>(props.timingSrc) : undefined);
  const plan = props.plan ?? (props.planSrc ? await load<Plan>(props.planSrc) : undefined);
  if (!timing || !plan) throw new Error("MV needs timing (or timingSrc) and plan (or planSrc)");
  return {
    durationInFrames: Math.max(1, Math.ceil(timing.duration * FPS)),
    props: { ...props, timing, plan },
  };
};

export const MV: React.FC<MVProps> = ({ timing, plan, debug }) => {
  if (!timing || !plan) throw new Error("timing/plan missing");
  const allText = useMemo(
    () => [plan.title ?? "", plan.artist ?? "", ...timing.lines.map((l) => l.text), ...Object.values(plan.lines ?? {}).map((o) => o.text ?? "")].join(""),
    [plan, timing],
  );
  useSongFonts(plan, allText);
  return (
    <AbsoluteFill style={{ backgroundColor: plan.palette.bg }}>
      <Background plan={plan} timing={timing} />
      <Lyrics plan={plan} timing={timing} />
      <Overlay plan={plan} timing={timing} debug={debug} />
      {plan.audio ? <Audio src={staticFile(plan.audio)} /> : null}
    </AbsoluteFill>
  );
};
