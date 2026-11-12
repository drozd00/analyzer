import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";

/**
 * Throttles sampled pointer trajectories using the configured sampling rate.
 */
export function shouldSamplePointerMove(state: TrackerRuntimeState, timestamp: number): boolean {
  const samplingHz = state.pointerSamplingHz;
  let minimumGap: number;

  if (samplingHz > 0) {
    minimumGap = 1000 / samplingHz;
  } else {
    minimumGap = Number.POSITIVE_INFINITY;
  }

  const elapsed = timestamp - state.lastPointerSampleTs;
  return elapsed >= minimumGap;
}
