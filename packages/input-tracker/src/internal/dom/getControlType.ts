import { isRecord } from "@/internal/isRecord";

/**
 * Reads the control type from DOM-like inputs when present.
 */
export function getControlType(target: EventTarget | null): string | undefined {
  if (!isRecord(target)) {
    return undefined;
  }

  const type = target.type;

  if (typeof type !== "string" || type.length === 0) {
    return undefined;
  }

  return type;
}
