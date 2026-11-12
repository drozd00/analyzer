import type { FieldShortcutRules } from "@/types/FieldShortcutRules";
import type { TrackedFieldDefinition } from "@/types/TrackedFieldDefinition";
import { getTagName } from "@/internal/dom/getTagName";
import { isContentEditable } from "@/internal/dom/isContentEditable";

/**
 * Combines field shortcut rules with control-specific defaults.
 */
export function getEffectiveShortcutRules(
  fieldDefinition: TrackedFieldDefinition | undefined,
  target: EventTarget | null
): Required<FieldShortcutRules> {
  const elementTag = getTagName(target);
  const isMultilineControl = elementTag === "textarea" || isContentEditable(target);
  const enterDefault = !isMultilineControl;
  const shortcuts = fieldDefinition?.shortcuts;

  const enterIsCommand = shortcuts?.enterIsCommand ?? enterDefault;
  const tabIsCommand = shortcuts?.tabIsCommand ?? true;
  const pasteIsCommand = shortcuts?.pasteIsCommand ?? true;

  return {
    enterIsCommand,
    tabIsCommand,
    pasteIsCommand
  };
}
