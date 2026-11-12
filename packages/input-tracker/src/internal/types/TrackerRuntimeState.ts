import type { InputTrackerInitOptions } from "@/types/InputTrackerInitOptions";
import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackedFormDefinition } from "@/types/TrackedFormDefinition";
import type { EventTargetLike } from "@/internal/types/EventTargetLike";
import type { FieldRuntimeState } from "@/internal/types/FieldRuntimeState";
import type { ListenerRegistration } from "@/internal/types/ListenerRegistration";

export interface TrackerRuntimeState {
  pageId: string;
  sessionId: string;
  now: () => number;
  wallTimeProvider: () => string;
  pointerSamplingHz: number;
  trackPointerTrajectory: boolean;
  documentTarget?: EventTargetLike;
  windowTarget?: EventTargetLike;
  registeredForms: Map<string, TrackedFormDefinition>;
  uniqueFieldToForm: Map<string, string | null>;
  fieldStates: Map<string, FieldRuntimeState>;
  eventBuffer: InputTrackerEvent[];
  subscribers: Set<(event: InputTrackerEvent) => void>;
  listeners: ListenerRegistration[];
  started: boolean;
  eventCounter: number;
  lastPointerSampleTs: number;
  options: InputTrackerInitOptions;
}
