/**
 * Copies top-level payload properties into a record.
 */
export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return { ...record };
}
