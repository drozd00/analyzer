import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { buildCompositionEvent } from "@/internal/events/buildCompositionEvent";
import { buildFocusEvent } from "@/internal/events/buildFocusEvent";
import { buildFormLifecycleEvent } from "@/internal/events/buildFormLifecycleEvent";
import { buildInputEvent } from "@/internal/events/buildInputEvent";
import { buildKeyboardEvent } from "@/internal/events/buildKeyboardEvent";
import { buildPageHideEvent } from "@/internal/events/buildPageHideEvent";
import { buildPointerEvent } from "@/internal/events/buildPointerEvent";
import { buildPointerMoveSampledEvent } from "@/internal/events/buildPointerMoveSampledEvent";
import { buildVisibilityEvent } from "@/internal/events/buildVisibilityEvent";
import { publishTrackerEvent } from "@/internal/runtime/publishTrackerEvent";
import { resolveContext } from "@/internal/runtime/resolveContext";

/**
 * Normalizes and publishes registered browser events.
 */
export function createBrowserEventHandler(state: TrackerRuntimeState): (event: Event) => void {
  return (event: Event): void => {
    const isPageEvent = event.type === "visibilitychange" || event.type === "pagehide";
    const tracksOnlyRegisteredForms = state.options.trackRegisteredFormsOnly !== false;

    if (!isPageEvent && tracksOnlyRegisteredForms) {
      const context = resolveContext(state, event.target);
      const formId = context.formId;

      if (!formId) {
        return;
      }

      if (!state.registeredForms.has(formId)) {
        return;
      }

      const hasUnknownField = Boolean(context.fieldId) && !context.fieldDefinition;

      if (hasUnknownField) {
        return;
      }
    }

    if (event.type === "pointermove") {
      if (!state.trackPointerTrajectory) {
        return;
      }

      const sampledEvent = buildPointerMoveSampledEvent(state, event);

      if (sampledEvent) {
        publishTrackerEvent(state, sampledEvent);
      }

      return;
    }

    switch (event.type) {
      case "focusin":
      case "focusout": {
        const focusEvent = buildFocusEvent(state, event);
        publishTrackerEvent(state, focusEvent);
        return;
      }

      case "keydown":
      case "keyup": {
        const keyboardEvent = buildKeyboardEvent(state, event);
        publishTrackerEvent(state, keyboardEvent);
        return;
      }

      case "beforeinput":
      case "input":
      case "change": {
        const inputEvent = buildInputEvent(state, event);
        publishTrackerEvent(state, inputEvent);
        return;
      }

      case "compositionstart":
      case "compositionend": {
        const compositionEvent = buildCompositionEvent(state, event);
        publishTrackerEvent(state, compositionEvent);
        return;
      }

      case "pointerdown":
      case "pointerup":
      case "click": {
        const pointerEvent = buildPointerEvent(state, event);
        publishTrackerEvent(state, pointerEvent);
        return;
      }

      case "submit":
      case "reset": {
        const formLifecycleEvent = buildFormLifecycleEvent(state, event);
        publishTrackerEvent(state, formLifecycleEvent);
        return;
      }

      case "visibilitychange": {
        const visibilityEvent = buildVisibilityEvent(state);
        publishTrackerEvent(state, visibilityEvent);
        return;
      }

      case "pagehide": {
        const pageHideEvent = buildPageHideEvent(state, event);
        publishTrackerEvent(state, pageHideEvent);
        return;
      }

      default:
        return;
    }
  };
}
