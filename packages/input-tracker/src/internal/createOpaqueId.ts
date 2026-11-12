let fallbackCounter = 0;

/**
 * Creates opaque ids for sessions, pages, and events.
 */
export function createOpaqueId(prefix: string): string {
  const cryptoObject = globalThis.crypto;

  if (cryptoObject && cryptoObject.randomUUID) {
    return `${prefix}-${cryptoObject.randomUUID()}`;
  }

  fallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
}
