import { Composition } from "remotion";
import { autoPlan } from "./mv/autoplan";
import { calculateMVMetadata, FPS, MV } from "./mv/MV";
import { sampleTiming } from "./mv/sample";
import type { MVProps } from "./mv/types";

const sampleProps: MVProps = {
  timing: sampleTiming,
  plan: autoPlan(sampleTiming, { title: "サンプル", artist: "mv-workflow" }),
  debug: true,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Real songs: render with --props '{"timingSrc":"song/timing.json","planSrc":"song/plan.json"}' */}
      <Composition
        id="MV"
        component={MV}
        durationInFrames={Math.ceil(sampleTiming.duration * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={sampleProps}
        calculateMetadata={calculateMVMetadata}
      />
    </>
  );
};
