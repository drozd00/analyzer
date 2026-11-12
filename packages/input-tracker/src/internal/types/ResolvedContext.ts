import type { TrackedFieldDefinition } from "@/types/TrackedFieldDefinition";

export interface ResolvedContext {
  formId?: string;
  fieldId?: string;
  fieldDefinition?: TrackedFieldDefinition;
}
