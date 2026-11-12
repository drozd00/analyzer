import type { FieldRuntimeState } from "@/internal/types/FieldRuntimeState";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { getFieldStateKey } from "@/internal/runtime/getFieldStateKey";

/**
 * Lazily allocates per-field runtime state only when an event actually needs it.
 */
export function ensureFieldRuntimeState(
  state: TrackerRuntimeState,
  formId?: string,
  fieldId?: string
): FieldRuntimeState | undefined {
  const key = getFieldStateKey(formId, fieldId);

  if (!key) {
    return undefined;
  }

  const existing = state.fieldStates.get(key);

  if (existing) {
    return existing;
  }

  const created: FieldRuntimeState = {
    isComposing: false
  };
  state.fieldStates.set(key, created);
  return created;
}
