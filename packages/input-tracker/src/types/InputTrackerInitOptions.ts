import type { InputTrackerEvent } from "@/types/InputTrackerEvent";

export interface InputTrackerInitOptions {
  sessionId?: string;
  pointerSamplingHz?: number;
  trackPointerTrajectory?: boolean;
  /** Restrict DOM events to registered forms. Page lifecycle events remain available. */
  trackRegisteredFormsOnly?: boolean;
  resolveFieldId?: (el: EventTarget | null) => string | undefined;
  resolveFormId?: (el: EventTarget | null) => string | undefined;
  onEvent?: (event: InputTrackerEvent) => void;
  document?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
  window?: Pick<Window, "addEventListener" | "removeEventListener">;
  now?: () => number;
  wallTimeProvider?: () => string;
}
