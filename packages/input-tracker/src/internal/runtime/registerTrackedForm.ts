import type { TrackedFormDefinition } from "@/types/TrackedFormDefinition";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { normalizeTrackedFormDefinition } from "@/internal/runtime/normalizeTrackedFormDefinition";
import { validateTrackedFormDefinition } from "@/internal/runtime/validateTrackedFormDefinition";

/**
 * Registers a form definition and updates the unique field-to-form index.
 */
export function registerTrackedForm(
  state: TrackerRuntimeState,
  definition: TrackedFormDefinition
): void {
  validateTrackedFormDefinition(definition);
  const normalizedDefinition = normalizeTrackedFormDefinition(definition);
  state.registeredForms.set(normalizedDefinition.formId, normalizedDefinition);

  state.uniqueFieldToForm.clear();
  state.fieldStates.clear();

  for (const registeredForm of state.registeredForms.values()) {
    for (const field of registeredForm.fields) {
      const existingFormId = state.uniqueFieldToForm.get(field.fieldId);

      if (existingFormId === undefined) {
        state.uniqueFieldToForm.set(field.fieldId, registeredForm.formId);
        continue;
      }

      if (existingFormId !== registeredForm.formId) {
        state.uniqueFieldToForm.set(field.fieldId, null);
      }
    }
  }
}
