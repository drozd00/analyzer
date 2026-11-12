import type { ResolvedContext } from "@/internal/types/ResolvedContext";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { defaultResolveFieldId } from "@/internal/dom/defaultResolveFieldId";
import { defaultResolveFormId } from "@/internal/dom/defaultResolveFormId";

/**
 * Resolves semantic form and field ids from DOM targets plus registered form definitions.
 */
export function resolveContext(
  state: TrackerRuntimeState,
  target: EventTarget | null
): ResolvedContext {
  const resolveFieldId = state.options.resolveFieldId;
  const customFieldId = resolveFieldId?.(target);
  let fieldId: string | undefined;

  if (customFieldId !== undefined) {
    fieldId = customFieldId;
  } else {
    fieldId = defaultResolveFieldId(target);
  }

  const resolveFormId = state.options.resolveFormId;
  const customFormId = resolveFormId?.(target);
  let formId: string | undefined;

  if (customFormId !== undefined) {
    formId = customFormId;
  } else {
    formId = defaultResolveFormId(target);
  }

  if (!formId && fieldId) {
    const inferredFormId = state.uniqueFieldToForm.get(fieldId);

    if (typeof inferredFormId === "string") {
      formId = inferredFormId;
    }
  }

  let fieldDefinition: ResolvedContext["fieldDefinition"];

  if (formId && fieldId) {
    const formDefinition = state.registeredForms.get(formId);

    if (formDefinition) {
      for (const field of formDefinition.fields) {
        if (field.fieldId === fieldId) {
          fieldDefinition = field;
          break;
        }
      }
    }
  }

  return {
    formId,
    fieldId,
    fieldDefinition
  };
}
