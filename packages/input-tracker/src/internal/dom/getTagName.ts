import { isRecord } from "@/internal/isRecord";

/**
 * Reads a lowercase tag name from DOM-like targets when available.
 */
export function getTagName(target: EventTarget | null): string | undefined {
  if (!isRecord(target)) {
    return undefined;
  }

  const tagName = target.tagName;

  if (typeof tagName !== "string") {
    return undefined;
  }

  return tagName.toLowerCase();
}
