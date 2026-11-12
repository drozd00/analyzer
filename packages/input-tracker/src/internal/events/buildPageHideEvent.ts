import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { createTrackerEvent } from "@/internal/runtime/createTrackerEvent";

/**
 * Records whether the browser page is being hidden into the back-forward cache.
 */
export function buildPageHideEvent(state: TrackerRuntimeState, event: Event): InputTrackerEvent {
  const pageTransitionEvent = event as PageTransitionEvent;
  const payload = {
    persisted: pageTransitionEvent.persisted === true
  };

  return createTrackerEvent(state, {
    source: "browser",
    type: "pagehide",
    payload
  });
}
