import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { getKeyboardPayload } from "@/internal/events/getKeyboardPayload";
import { createBasePayload } from "@/internal/runtime/createBasePayload";
import { createTrackerEvent } from "@/internal/runtime/createTrackerEvent";
import { resolveContext } from "@/internal/runtime/resolveContext";

/**
 * Records command-like keyboard usage while redacting plain character content.
 */
export function buildKeyboardEvent(state: TrackerRuntimeState, event: Event): InputTrackerEvent {
  const target = event.target ?? null;
  const context = resolveContext(state, target);
  const basePayload = createBasePayload(context, target);
  const keyboardPayload = getKeyboardPayload(event, context.fieldDefinition, target);
  const payload = {
    ...basePayload,
    ...keyboardPayload
  };

  return createTrackerEvent(state, {
    source: "browser",
    type: event.type,
    formId: context.formId,
    fieldId: context.fieldId,
    payload
  });
}
