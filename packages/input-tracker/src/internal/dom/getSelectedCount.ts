import { isRecord } from "@/internal/isRecord";

/**
 * Counts selected options without exposing selected values.
 */
export function getSelectedCount(target: EventTarget | null): number | undefined {
  if (!isRecord(target)) {
    return undefined;
  }

  const selectedOptions = target.selectedOptions;

  if (isRecord(selectedOptions) && typeof selectedOptions.length === "number") {
    return selectedOptions.length;
  }

  if (Array.isArray(target.selectedValues)) {
    return target.selectedValues.length;
  }

  return undefined;
}
