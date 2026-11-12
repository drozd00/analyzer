import type { TrackedFormDefinition } from "@/types/TrackedFormDefinition";

/**
 * Stores tracked forms in a stable order so exports remain deterministic.
 */
export function normalizeTrackedFormDefinition(
  definition: TrackedFormDefinition
): TrackedFormDefinition {
  const sortedFields = definition.fields.slice();
  sortedFields.sort((left, right) => left.order - right.order);

  return {
    formId: definition.formId,
    fields: sortedFields
  };
}
