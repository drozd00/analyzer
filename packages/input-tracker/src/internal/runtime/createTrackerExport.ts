import type { InputTrackerExport } from "@/types/InputTrackerExport";
import type { TrackedFormDefinition } from "@/types/TrackedFormDefinition";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";

/**
 * Creates a deep snapshot of registered forms and buffered events.
 */
export function createTrackerExport(state: TrackerRuntimeState): InputTrackerExport {
  const registeredForms = state.registeredForms.values();
  const forms: TrackedFormDefinition[] = [];

  for (const form of registeredForms) {
    forms.push(form);
  }

  const snapshot: InputTrackerExport = {
    sessionId: state.sessionId,
    pageId: state.pageId,
    forms,
    events: state.eventBuffer
  };

  return structuredClone(snapshot);
}
