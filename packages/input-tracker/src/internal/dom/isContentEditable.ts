import { isRecord } from "@/internal/isRecord";

/**
 * Detects contenteditable targets without depending on concrete DOM classes.
 */
export function isContentEditable(target: EventTarget | null): boolean {
  if (!isRecord(target)) {
    return false;
  }

  return target.isContentEditable === true;
}
