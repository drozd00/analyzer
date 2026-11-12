# Event Schema Notes

## Canonical Record

```ts
interface InputTrackerEvent {
  schemaVersion: 1;
  sequence: number;
  eventId: string;
  sessionId: string;
  pageId: string;
  ts: number;
  wallTime?: string;
  source: "browser" | "app";
  formId?: string;
  fieldId?: string;
  type: string;
  payload: Record<string, unknown>;
}
```

## Timestamp Policy

- `ts` is intended to come from `performance.now()`.
- `wallTime` is optional ISO time for joining with external logs when needed.
- Event ordering is preserved by the buffered event sequence and monotonic `ts`.

## Browser Payload Conventions

Examples of safe metadata:

- keyboard: `key`, `code`, modifier flags, `repeat`, `commandLike`, `commandId`
- editing: `inputType`, `valueLength`, `lengthDelta`, selection range, `isComposing`
- pointer: `pointerType`, `button`, `clientX`, `clientY`
- lifecycle: `defaultPrevented`, `visibilityState`, `persisted`

Character keys that would reveal raw content are redacted. Command-like shortcuts remain visible.

## Semantic App Events

App events are passed through as explicit host-provided metadata. Recommended payload content:

- validation rule ids
- error codes
- field state flags
- step ids
- mount or unmount metadata

Applications must exclude raw field values and personal data from these payloads.

## Export Shape

The tracker hands raw data off through:

```ts
interface InputTrackerExport {
  sessionId: string;
  pageId: string;
  forms: TrackedFormDefinition[];
  events: InputTrackerEvent[];
}
```
