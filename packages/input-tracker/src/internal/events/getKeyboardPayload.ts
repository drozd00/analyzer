import type { TrackedFieldDefinition } from "@/types/TrackedFieldDefinition";
import { NonPrintableKeys } from "@/internal/const/NonPrintableKeys";
import { describeShortcut } from "@/internal/events/describeShortcut";
import { getEffectiveShortcutRules } from "@/internal/events/getEffectiveShortcutRules";
import { isPrintableCharacter } from "@/internal/events/isPrintableCharacter";

/**
 * Keeps command-like keyboard activity while redacting raw character content.
 */
export function getKeyboardPayload(
  event: Event,
  fieldDefinition: TrackedFieldDefinition | undefined,
  target: EventTarget | null
): Record<string, unknown> {
  const keyboardEvent = event as KeyboardEvent;
  const rawKey = keyboardEvent.key;
  const key = typeof rawKey === "string" ? rawKey : "";
  const rawCode = keyboardEvent.code;
  const code = typeof rawCode === "string" ? rawCode : undefined;

  const ctrlKey = keyboardEvent.ctrlKey === true;
  const metaKey = keyboardEvent.metaKey === true;
  const shiftKey = keyboardEvent.shiftKey === true;
  const altKey = keyboardEvent.altKey === true;
  const modifiers = { ctrlKey, metaKey, shiftKey, altKey };
  const hasPrimaryModifier = ctrlKey || metaKey;

  // AltGr commonly reports Ctrl+Alt. Treat it conservatively as text input.
  const hasAltGraphModifier = keyboardEvent.getModifierState?.("AltGraph") === true;
  const isAltGraph = hasAltGraphModifier || (ctrlKey && altKey);

  const shortcutRules = getEffectiveShortcutRules(fieldDefinition, target);
  const isPasteKey = key.toLowerCase() === "v";
  const isPasteShortcut =
    shortcutRules.pasteIsCommand && !isAltGraph && hasPrimaryModifier && isPasteKey;
  const isTabCommand = key === "Tab" && shortcutRules.tabIsCommand;
  const isEnterCommand = key === "Enter" && shortcutRules.enterIsCommand;

  const isArrowKey =
    key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
  const isModifierShortcut =
    !isAltGraph && hasPrimaryModifier && isPrintableCharacter(key) && !isPasteKey;
  const commandLike =
    isPasteShortcut ||
    isTabCommand ||
    isEnterCommand ||
    key === "Escape" ||
    isArrowKey ||
    isModifierShortcut;

  const isModifierOnlyKey = key === "Shift" || key === "Control" || key === "Meta" || key === "Alt";
  const safeToStoreKey = commandLike || NonPrintableKeys.has(key) || isModifierOnlyKey;

  let keyCategory = "content-like";

  if (safeToStoreKey) {
    if (commandLike) {
      keyCategory = "command";
    } else {
      keyCategory = "non-printable";
    }
  }

  const payload: Record<string, unknown> = {
    ctrlKey,
    metaKey,
    shiftKey,
    altKey,
    repeat: keyboardEvent.repeat === true,
    commandLike,
    keyCategory,
    isComposing: keyboardEvent.isComposing === true
  };

  if (safeToStoreKey && key.length > 0) {
    payload.key = key;
  }

  if (safeToStoreKey && code) {
    payload.code = code;
  }

  if (commandLike && key.length > 0) {
    payload.shortcut = describeShortcut(key, modifiers);
  }

  if (isPasteShortcut) {
    payload.commandId = "paste-shortcut";
  } else if (isTabCommand) {
    payload.commandId = "tab-navigation";
  } else if (isEnterCommand) {
    payload.commandId = "enter-navigation";
  } else if (key === "Escape") {
    payload.commandId = "escape";
  } else if (isArrowKey) {
    payload.commandId = "arrow-navigation";
  }

  return payload;
}
