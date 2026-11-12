import { isRecord } from "@/internal/isRecord";
import { getAttr } from "@/internal/dom/getAttr";

/**
 * Default form resolution prefers explicit tracking attributes and falls back to the nearest form.
 */
export function defaultResolveFormId(target: EventTarget | null): string | undefined {
  const trackedFormId = getAttr(target, "data-track-form-id");
  if (trackedFormId !== undefined) {
    return trackedFormId;
  }

  const dataFormId = getAttr(target, "data-form-id");
  if (dataFormId !== undefined) {
    return dataFormId;
  }

  if (!isRecord(target)) {
    return undefined;
  }

  const closest = target.closest;

  if (typeof closest !== "function") {
    return undefined;
  }

  const formNode = closest.call(target, "form") as EventTarget;
  const closestTrackedFormId = getAttr(formNode, "data-track-form-id");
  if (closestTrackedFormId !== undefined) {
    return closestTrackedFormId;
  }

  return getAttr(formNode, "id");
}
