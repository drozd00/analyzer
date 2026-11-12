import type { InputTrackerEventSource } from "@/types/InputTrackerEventSource";

export interface InputTrackerEvent {
  schemaVersion: 1;
  sequence: number;
  eventId: string;
  sessionId: string;
  pageId: string;
  ts: number;
  wallTime?: string;
  source: InputTrackerEventSource;
  formId?: string;
  fieldId?: string;
  type: string;
  payload: Record<string, unknown>;
}
