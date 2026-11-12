import type { ResolvedContext } from "@/internal/types/ResolvedContext";
import { getSafeValueMetadata } from "@/internal/dom/getSafeValueMetadata";

/**
 * Adds field kind, field path and control metadata to an event.
 */
export function createBasePayload(
  context: ResolvedContext,
  target: EventTarget | null
): Record<string, unknown> {
  const valueMetadata = getSafeValueMetadata(target);
  const payload: Record<string, unknown> = {
    ...valueMetadata
  };
  const fieldDefinition = context.fieldDefinition;

  if (fieldDefinition?.fieldKind) {
    payload.fieldKind = fieldDefinition.fieldKind;
  }

  if (fieldDefinition?.path) {
    payload.fieldPath = fieldDefinition.path;
  }

  return payload;
}
