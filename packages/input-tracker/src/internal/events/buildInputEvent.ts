import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { getSafeValueMetadata } from "@/internal/dom/getSafeValueMetadata";
import { getSelection } from "@/internal/dom/getSelection";
import { createBasePayload } from "@/internal/runtime/createBasePayload";
import { createTrackerEvent } from "@/internal/runtime/createTrackerEvent";
import { ensureFieldRuntimeState } from "@/internal/runtime/ensureFieldRuntimeState";
import { resolveContext } from "@/internal/runtime/resolveContext";

/**
 * Records edit metadata such as input type, lengths, and selections without storing values.
 */
export function buildInputEvent(state: TrackerRuntimeState, event: Event): InputTrackerEvent {
  const inputEvent = event as InputEvent;
  const target = inputEvent.target ?? null;
  const context = resolveContext(state, target);
  const fieldState = ensureFieldRuntimeState(state, context.formId, context.fieldId);
  const valueMetadata = getSafeValueMetadata(target);

  let currentLength: number | undefined;
  if (typeof valueMetadata.valueLength === "number") {
    currentLength = valueMetadata.valueLength;
  }

  let previousLength: number | undefined;
  if (fieldState) {
    previousLength = fieldState.lastValueLength;
  }

  let lengthDelta: number | undefined;
  if (event.type === "input" && currentLength !== undefined && previousLength !== undefined) {
    lengthDelta = currentLength - previousLength;
  }

  if (fieldState && currentLength !== undefined) {
    fieldState.lastValueLength = currentLength;
  }

  const basePayload = createBasePayload(context, target);
  const selection = getSelection(target);
  const isComposing = fieldState?.isComposing === true || inputEvent.isComposing === true;
  const payload = {
    ...basePayload,
    ...valueMetadata,
    ...selection,
    inputType: inputEvent.inputType,
    lengthDelta,
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
