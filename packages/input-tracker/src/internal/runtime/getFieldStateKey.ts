/**
 * Namespaces field state by form so identical field ids across forms do not collide.
 */
export function getFieldStateKey(formId?: string, fieldId?: string): string | undefined {
  if (!fieldId) {
    return undefined;
  }

  const formKey = formId ?? "unknown";
  return `${formKey}::${fieldId}`;
}
