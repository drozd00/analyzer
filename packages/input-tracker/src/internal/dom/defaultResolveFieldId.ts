import { getAttr } from "@/internal/dom/getAttr";

/**
 * Default field resolution prefers explicit tracking attributes and then common form identifiers.
 */
export function defaultResolveFieldId(target: EventTarget | null): string | undefined {
  const trackedFieldId = getAttr(target, "data-track-field-id");
  if (trackedFieldId !== undefined) {
    return trackedFieldId;
  }

  const dataFieldId = getAttr(target, "data-field-id");
  if (dataFieldId !== undefined) {
    return dataFieldId;
  }

  const name = getAttr(target, "name");
  if (name !== undefined) {
    return name;
  }

  return getAttr(target, "id");
}
