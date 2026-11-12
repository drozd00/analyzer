/**
 * `KeyboardEvent.key` values that are not ordinary character input, so the
 * tracker stores them in the keyboard payload.
 *
 * Keep as a `Set` because the tracker only checks membership on every
 * keydown event.
 */
export const NonPrintableKeys = new Set<string>([
  "Enter",
  "Tab",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Backspace",
  "Delete"
] as const);
