/**
 * Produces human-readable modifier combinations such as `Ctrl+V`.
 */
export function describeShortcut(
  key: string,
  modifiers: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }
): string {
  const parts: string[] = [];

  if (modifiers.ctrlKey) {
    parts.push("Ctrl");
  }

  if (modifiers.metaKey) {
    parts.push("Cmd");
  }

  if (modifiers.altKey) {
    parts.push("Alt");
  }

  if (modifiers.shiftKey) {
    parts.push("Shift");
  }

  let displayKey = key;
  if (key.length === 1) {
    displayKey = key.toUpperCase();
  }

  parts.push(displayKey);
  return parts.join("+");
}
