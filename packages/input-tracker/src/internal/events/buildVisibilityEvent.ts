import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { createTrackerEvent } from "@/internal/runtime/createTrackerEvent";

/**
 * Records the current document visibility state.
 */
export function buildVisibilityEvent(state: TrackerRuntimeState): InputTrackerEvent {
  const documentTarget = state.documentTarget;
  const payload = {
    visibilityState: documentTarget?.visibilityState
  };

  return createTrackerEvent(state, {
    source: "browser",
    type: "visibilitychange",
    payload
  });
}
