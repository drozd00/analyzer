import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackedFormDefinition } from "@/types/TrackedFormDefinition";

export interface InputTrackerExport {
  sessionId: string;
  pageId: string;
  forms: TrackedFormDefinition[];
  events: InputTrackerEvent[];
}
