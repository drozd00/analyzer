import type { TrackedFormDefinition } from "@/types/TrackedFormDefinition";

/**
 * Fails fast on duplicate field identifiers inside a single form definition.
 */
export function validateTrackedFormDefinition(definition: TrackedFormDefinition): void {
  const fieldIds = new Set<string>();

  for (const field of definition.fields) {
    if (fieldIds.has(field.fieldId)) {
      throw new Error(
        `Duplicate fieldId "${field.fieldId}" detected in form "${definition.formId}".`
      );
    }

    fieldIds.add(field.fieldId);
  }
}
