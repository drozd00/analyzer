import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { createBasePayload } from "@/internal/runtime/createBasePayload";
import { createTrackerEvent } from "@/internal/runtime/createTrackerEvent";
import { resolveContext } from "@/internal/runtime/resolveContext";
import { shouldSamplePointerMove } from "@/internal/runtime/shouldSamplePointerMove";

/**
 * Samples pointer trajectories only when the configured sampling budget allows it.
 */
export function buildPointerMoveSampledEvent(
  state: TrackerRuntimeState,
  event: Event
): InputTrackerEvent | undefined {
  const timestamp = state.now();

  if (!shouldSamplePointerMove(state, timestamp)) {
    return undefined;
  }

  state.lastPointerSampleTs = timestamp;

  const pointerEvent = event as PointerEvent;
  const target = pointerEvent.target ?? null;
  const context = resolveContext(state, target);
  const basePayload = createBasePayload(context, target);
  const payload = {
    ...basePayload,
    pointerType: pointerEvent.pointerType,
    clientX: pointerEvent.clientX,
    clientY: pointerEvent.clientY
  };

  return createTrackerEvent(state, {
    source: "browser",
    type: "pointermove.sampled",
    formId: context.formId,
    fieldId: context.fieldId,
    payload
  });
}
