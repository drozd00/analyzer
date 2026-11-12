import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { getSafeValueMetadata } from "@/internal/dom/getSafeValueMetadata";
import { createBasePayload } from "@/internal/runtime/createBasePayload";
import { createTrackerEvent } from "@/internal/runtime/createTrackerEvent";
import { ensureFieldRuntimeState } from "@/internal/runtime/ensureFieldRuntimeState";
import { resolveContext } from "@/internal/runtime/resolveContext";

/**
 * Normalizes focus transitions and safely records related field references.
 */
export function buildFocusEvent(state: TrackerRuntimeState, event: Event): InputTrackerEvent {
  const focusEvent = event as FocusEvent;
  const target = focusEvent.target ?? null;
  const relatedTarget = focusEvent.relatedTarget ?? null;
  const context = resolveContext(state, target);
  const relatedContext = resolveContext(state, relatedTarget);
  const fieldState = ensureFieldRuntimeState(state, context.formId, context.fieldId);
  const valueMetadata = getSafeValueMetadata(target);
  const nextLength = valueMetadata.valueLength;

  if (fieldState && typeof nextLength === "number") {
    fieldState.lastValueLength = nextLength;
  }

  const basePayload = createBasePayload(context, target);
  const payload = {
    ...basePayload,
    relatedFieldId: relatedContext.fieldId,
    relatedFormId: relatedContext.formId
  };

  return createTrackerEvent(state, {
    source: "browser",
    type: event.type,
    formId: context.formId,
    fieldId: context.fieldId,
    payload
  });
}
