import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";

/**
 * Stores an event and broadcasts it to tracker subscribers.
 */
export function publishTrackerEvent(state: TrackerRuntimeState, event: InputTrackerEvent): void {
  state.eventBuffer.push(event);

  const onEvent = state.options.onEvent;
  if (onEvent) {
    onEvent(event);
  }

  for (const subscriber of state.subscribers) {
    subscriber(event);
  }
}
