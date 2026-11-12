# Architecture Overview

`InputTracker` captures browser interactions and application events.

## Tracker Core

`src/createInputTracker.ts` is the entrypoint.

- It attaches listeners directly to `document` and `window`.
- It normalizes browser signals into canonical `InputTrackerEvent` records.
- It redacts ordinary character input and records field lengths and selection metadata.
- It exports registered form definitions and recorded events through `exportData()`.

## Internal Structure

Source directories:

- `src/types/*`: public types, one per file
- `src/internal/dom/*`: DOM-reading helpers
- `src/internal/events/*`: per-event normalization helpers
- `src/internal/runtime/*`: tracker state and orchestration helpers

Source modules import each other through the `@/*` path alias, which maps to `src/*` in `tsconfig.json`.

## Data flow

1. The host app registers `TrackedFormDefinition`.
2. The tracker captures browser and app events into canonical raw records.
3. The host app calls `exportData()` or reads buffered events.
4. `input-analyzer` consumes the exported event stream.
