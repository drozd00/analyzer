import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";

/**
 * Stamps canonical tracker metadata onto a partially built event record.
 */
export function createTrackerEvent(
  state: TrackerRuntimeState,
  input: Omit<
    InputTrackerEvent,
    "schemaVersion" | "sequence" | "eventId" | "sessionId" | "pageId" | "ts" | "wallTime"
  >
): InputTrackerEvent {
  state.eventCounter += 1;

  const sequence = state.eventCounter;
  const eventId = `${state.pageId}:${sequence}`;
  const sessionId = state.sessionId;
  const pageId = state.pageId;
  const timestamp = state.now();
  const wallTime = state.wallTimeProvider();

  return {
    schemaVersion: 1,
    sequence,
    eventId,
    sessionId,
    pageId,
    ts: timestamp,
    wallTime,
    ...input
  };
}
