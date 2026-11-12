import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { createBasePayload } from "@/internal/runtime/createBasePayload";
import { createTrackerEvent } from "@/internal/runtime/createTrackerEvent";
import { resolveContext } from "@/internal/runtime/resolveContext";

/**
 * Records pointer coordinates, buttons and target identifiers.
 */
export function buildPointerEvent(state: TrackerRuntimeState, event: Event): InputTrackerEvent {
  const pointerEvent = event as PointerEvent;
  const target = pointerEvent.target ?? null;
  const context = resolveContext(state, target);
  const basePayload = createBasePayload(context, target);
  const payload = {
    ...basePayload,
    pointerType: pointerEvent.pointerType,
    button: pointerEvent.button,
    clientX: pointerEvent.clientX,
    clientY: pointerEvent.clientY
  };

  return createTrackerEvent(state, {
    source: "browser",
    type: event.type,
    formId: context.formId,
    fieldId: context.fieldId,
    payload
  });
}
