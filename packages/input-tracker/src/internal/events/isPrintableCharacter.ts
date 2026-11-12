/**
 * Treats single-character keys as printable input unless modifiers reinterpret them as commands.
 */
export function isPrintableCharacter(key: string | undefined): boolean {
  return typeof key === "string" && key.length === 1;
}
