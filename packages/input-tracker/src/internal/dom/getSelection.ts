import { isRecord } from "@/internal/isRecord";

/**
 * Extracts safe cursor and selection boundaries from text-like controls.
 */
export function getSelection(target: EventTarget | null): {
  selectionStart?: number;
  selectionEnd?: number;
} {
  if (!isRecord(target)) {
    return {};
  }

  const result: { selectionStart?: number; selectionEnd?: number } = {};

  if (typeof target.selectionStart === "number") {
    result.selectionStart = target.selectionStart;
  }

  if (typeof target.selectionEnd === "number") {
    result.selectionEnd = target.selectionEnd;
  }

  return result;
}
