import { isRecord } from "@/internal/isRecord";
import { getControlType } from "@/internal/dom/getControlType";
import { getSelectedCount } from "@/internal/dom/getSelectedCount";
import { getTagName } from "@/internal/dom/getTagName";
import { isContentEditable } from "@/internal/dom/isContentEditable";

/**
 * Captures privacy-safe value metadata such as lengths, checked state, and selected counts.
 */
export function getSafeValueMetadata(target: EventTarget | null): Record<string, unknown> {
  if (!isRecord(target)) {
    return {};
  }

  const metadata: Record<string, unknown> = {};
  const tagName = getTagName(target);
  const controlType = getControlType(target);
  const editable = isContentEditable(target);

  const value = target.value;
  const isTextControl = tagName === "textarea" || tagName === "input";

  if (typeof value === "string" && (isTextControl || editable)) {
    metadata.valueLength = value.length;
  } else if (editable && typeof target.textContent === "string") {
    metadata.valueLength = target.textContent.length;
  }

  if (typeof target.checked === "boolean") {
    metadata.checked = target.checked;
  }

  const selectedCount = getSelectedCount(target);

  if (selectedCount !== undefined) {
    metadata.selectedCount = selectedCount;
  }

  if (tagName) {
    metadata.elementTag = tagName;
  }

  if (controlType) {
    metadata.controlType = controlType;
  }

  return metadata;
}
