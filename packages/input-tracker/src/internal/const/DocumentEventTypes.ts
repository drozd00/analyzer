/**
 * DOM events to subscribe to on the document target when tracking starts.
 *
 * Keep as an array because the tracker iterates the list once to register
 * the listeners.
 */
export const DocumentEventTypes = [
  "focusin",
  "focusout",
  "keydown",
  "keyup",
  "beforeinput",
  "input",
  "change",
  "compositionstart",
  "compositionend",
  "pointerdown",
  "pointerup",
  "click",
  "submit",
  "reset",
  "visibilitychange"
] as const;
