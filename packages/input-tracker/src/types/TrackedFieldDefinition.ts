import type { FieldShortcutRules } from "@/types/FieldShortcutRules";

export interface TrackedFieldDefinition {
  fieldId: string;
  order: number;
  fieldKind?: string;
  path?: string;
  shortcuts?: FieldShortcutRules;
}
