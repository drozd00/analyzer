import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { getSelection } from "@/internal/dom/getSelection";
import { createBasePayload } from "@/internal/runtime/createBasePayload";
import { createTrackerEvent } from "@/internal/runtime/createTrackerEvent";
import { ensureFieldRuntimeState } from "@/internal/runtime/ensureFieldRuntimeState";
import { resolveContext } from "@/internal/runtime/resolveContext";

/**
 * Records IME composition boundaries and selection metadata.
 */
export function buildCompositionEvent(state: TrackerRuntimeState, event: Event): InputTrackerEvent {
  const target = event.target ?? null;
  const context = resolveContext(state, target);
  const fieldState = ensureFieldRuntimeState(state, context.formId, context.fieldId);

  if (fieldState) {
    fieldState.isComposing = event.type === "compositionstart";
  }

  const basePayload = createBasePayload(context, target);
  const selection = getSelection(target);
  const isComposing = fieldState?.isComposing === true;
  const payload = {
    ...basePayload,
    ...selection,
    isComposing
  };

  return createTrackerEvent(state, {
    source: "browser",
    type: event.type,
    formId: context.formId,
    fieldId: context.fieldId,
    payload
  });
}
