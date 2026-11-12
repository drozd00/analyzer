import type { AppEventInput } from "@/types/AppEventInput";
import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { InputTrackerExport } from "@/types/InputTrackerExport";
import type { TrackedFormDefinition } from "@/types/TrackedFormDefinition";

export interface InputTracker {
  start(): void;
  stop(): void;
  flush(): InputTrackerEvent[];
  getEvents(): InputTrackerEvent[];
  clear(): void;
  exportData(): InputTrackerExport;
  subscribe(listener: (event: InputTrackerEvent) => void): () => void;
  registerForm(definition: TrackedFormDefinition): void;
  emitAppEvent(input: AppEventInput): InputTrackerEvent;
}
