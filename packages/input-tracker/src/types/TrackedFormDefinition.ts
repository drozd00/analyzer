import type { TrackedFieldDefinition } from "@/types/TrackedFieldDefinition";

export interface TrackedFormDefinition {
  formId: string;
  fields: TrackedFieldDefinition[];
}
