import type { EventTargetLike } from "@/internal/types/EventTargetLike";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";

/**
 * Keeps listener registration and teardown symmetrical.
 */
export function attachTrackedListener(
  state: TrackerRuntimeState,
  target: EventTargetLike,
  type: string,
  handler: (event: Event) => void,
  options?: boolean | AddEventListenerOptions
): void {
  target.addEventListener(type, handler, options);
  state.listeners.push({
    target,
    type,
    handler,
    options
  });
}
