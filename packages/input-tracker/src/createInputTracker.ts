import type { AppEventInput } from "@/types/AppEventInput";
import type { InputTracker } from "@/types/InputTracker";
import type { InputTrackerInitOptions } from "@/types/InputTrackerInitOptions";
import type { InputTrackerEvent } from "@/types/InputTrackerEvent";
import type { TrackerRuntimeState } from "@/internal/types/TrackerRuntimeState";
import { DocumentEventTypes } from "@/internal/const/DocumentEventTypes";
import { asRecord } from "@/internal/asRecord";
import { createOpaqueId } from "@/internal/createOpaqueId";
import { createBrowserEventHandler } from "@/internal/runtime/createBrowserEventHandler";
import { createTrackerEvent } from "@/internal/runtime/createTrackerEvent";
import { createTrackerExport } from "@/internal/runtime/createTrackerExport";
import { attachTrackedListener } from "@/internal/runtime/attachTrackedListener";
import { publishTrackerEvent } from "@/internal/runtime/publishTrackerEvent";
import { registerTrackedForm } from "@/internal/runtime/registerTrackedForm";

function readPerformanceNow(): number {
  const performanceObject = globalThis.performance;
  const timestamp = performanceObject?.now?.();

  if (typeof timestamp !== "number") {
    return Date.now();
  }

  return timestamp;
}

function readWallTime(): string {
  return new Date().toISOString();
}

/**
 * Creates a tracker for browser interactions and application events.
 */
export function createInputTracker(options: InputTrackerInitOptions = {}): InputTracker {
  const pageId = createOpaqueId("page");
  const sessionId = options.sessionId ?? createOpaqueId("session");
  const now = options.now ?? readPerformanceNow;
  const wallTimeProvider = options.wallTimeProvider ?? readWallTime;
  const pointerSamplingHz = options.pointerSamplingHz ?? 12;
  const trackPointerTrajectory = options.trackPointerTrajectory ?? false;
  const documentTarget = options.document as TrackerRuntimeState["documentTarget"];
  const windowTarget = options.window as TrackerRuntimeState["windowTarget"];

  const state: TrackerRuntimeState = {
    pageId,
    sessionId,
    now,
    wallTimeProvider,
    pointerSamplingHz,
    trackPointerTrajectory,
    documentTarget,
    windowTarget,
    registeredForms: new Map(),
    uniqueFieldToForm: new Map(),
    fieldStates: new Map(),
    eventBuffer: [],
    subscribers: new Set(),
    listeners: [],
    started: false,
    eventCounter: 0,
    lastPointerSampleTs: Number.NEGATIVE_INFINITY,
    options
  };
  const browserEventHandler = createBrowserEventHandler(state);

  if (!state.documentTarget && typeof globalThis.document !== "undefined") {
    state.documentTarget = globalThis.document as TrackerRuntimeState["documentTarget"];
  }

  if (!state.windowTarget && typeof globalThis.window !== "undefined") {
    state.windowTarget = globalThis.window as TrackerRuntimeState["windowTarget"];
  }

  return {
    start(): void {
      if (state.started) {
        return;
      }

      if (!state.documentTarget) {
        throw new Error("A document-like event target is required to start form tracking.");
      }

      const listenerOptions: AddEventListenerOptions = { capture: true };

      for (const eventType of DocumentEventTypes) {
        attachTrackedListener(
          state,
          state.documentTarget,
          eventType,
          browserEventHandler,
          listenerOptions
        );
      }

      if (state.trackPointerTrajectory) {
        attachTrackedListener(
          state,
          state.documentTarget,
          "pointermove",
          browserEventHandler,
          listenerOptions
        );
      }

      if (state.windowTarget) {
        attachTrackedListener(
          state,
          state.windowTarget,
          "pagehide",
          browserEventHandler,
          listenerOptions
        );
      }

      state.started = true;
    },

    stop(): void {
      for (const listener of state.listeners) {
        const { target, type, handler, options: listenerOptions } = listener;
        target.removeEventListener(type, handler, listenerOptions);
      }

      state.listeners.length = 0;
      state.started = false;
    },

    flush(): InputTrackerEvent[] {
      const bufferedEvents = state.eventBuffer.slice();
      state.eventBuffer.length = 0;
      return bufferedEvents;
    },

    getEvents(): InputTrackerEvent[] {
      const bufferedEvents = state.eventBuffer;
      return structuredClone(bufferedEvents);
    },

    clear(): void {
      state.eventBuffer.length = 0;
    },

    exportData() {
      return createTrackerExport(state);
    },

    subscribe(listener: (event: InputTrackerEvent) => void): () => void {
      state.subscribers.add(listener);

      return () => {
        state.subscribers.delete(listener);
      };
    },

    registerForm(definition): void {
      registerTrackedForm(state, definition);
    },

    emitAppEvent(input: AppEventInput): InputTrackerEvent {
      const sourcePayload = asRecord(input.payload);
      const serializedPayload = JSON.stringify(sourcePayload);
      const clonedPayload = JSON.parse(serializedPayload) as Record<string, unknown>;

      const event = createTrackerEvent(state, {
        source: "app",
        formId: input.formId,
        fieldId: input.fieldId,
        type: input.type,
        payload: clonedPayload
      });

      publishTrackerEvent(state, event);
      return event;
    }
  };
}
