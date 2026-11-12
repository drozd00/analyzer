import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { createBasePayload } from "@/internal/runtime/createBasePayload";
import { createTrackerEvent } from "@/internal/runtime/createTrackerEvent";
import { resolveContext } from "@/internal/runtime/resolveContext";

/**
 * Normalizes browser submit and reset events.
 */
export function buildFormLifecycleEvent(
  state: TrackerRuntimeState,
  event: Event
): InputTrackerEvent {
  const target = event.target ?? null;
  const context = resolveContext(state, target);
  const basePayload = createBasePayload(context, target);
  const payload = {
    ...basePayload,
    defaultPrevented: event.defaultPrevented
  };

  return createTrackerEvent(state, {
    source: "browser",
    type: event.type,
    formId: context.formId,
    fieldId: context.fieldId,
    payload
  });
}
