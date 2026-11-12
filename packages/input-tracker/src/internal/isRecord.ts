/**
 * Narrow unknown values into plain records before probing DOM-like properties.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
