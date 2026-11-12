import test from "node:test";
import assert from "node:assert/strict";
import { createInputTracker } from "../dist/index.js";
import { MockEventHub, createElement, createFormDefinition } from "./helpers.mjs";

function createStartedTracker(options = {}) {
  const documentHub = new MockEventHub();
  const windowHub = new MockEventHub();
  const tracker = createInputTracker({ document: documentHub, window: windowHub, ...options });
  tracker.registerForm(createFormDefinition());
  tracker.start();
  return { tracker, documentHub, windowHub };
}

test("AltGr text is redacted for both explicit AltGraph and Ctrl+Alt browsers", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "zip" });
  const modifiers = [
    { ctrlKey: true, altKey: true },
    { ctrlKey: false, altKey: false, getModifierState: (name) => name === "AltGraph" }
  ];

  for (const modifier of modifiers) {
    documentHub.emit("keydown", { target: input, key: "@", code: "KeyV", ...modifier });
    documentHub.emit("keyup", { target: input, key: "@", code: "KeyV", ...modifier });
  }

  const events = tracker.getEvents();
  assert.equal(events.length, 4);
  for (const event of events) {
    assert.equal(event.payload.commandLike, false);
    assert.equal(event.payload.keyCategory, "content-like");
    assert.equal(event.payload.key, undefined);
    assert.equal(event.payload.code, undefined);
    assert.equal(event.payload.shortcut, undefined);
    assert.equal(event.payload.commandId, undefined);
  }
});

test("flush and clear preserve sequence identity and stop removes browser listeners", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name" });
  documentHub.emit("focusin", { target: input });
  const firstBatch = tracker.flush();
  assert.equal(firstBatch.length, 1);
  assert.equal(firstBatch[0].sequence, 1);
  assert.deepEqual(tracker.getEvents(), []);

  tracker.stop();
  documentHub.emit("focusout", { target: input });
  assert.deepEqual(tracker.getEvents(), []);
  tracker.start();
  tracker.start();
  documentHub.emit("focusin", { target: input });
  const secondBatch = tracker.flush();
  assert.equal(secondBatch.length, 1, "idempotent start must not duplicate listeners");
  assert.equal(secondBatch[0].sequence, 2);
  assert.equal(secondBatch[0].pageId, firstBatch[0].pageId);
  assert.notEqual(secondBatch[0].eventId, firstBatch[0].eventId);

  tracker.emitAppEvent({ type: "app.checkpoint", payload: {} });
  tracker.clear();
  const finalEvent = tracker.emitAppEvent({ type: "app.finished", payload: {} });
  assert.equal(finalEvent.sequence, 4, "clear discards buffered records, not event identity");
});

test("exports and event reads isolate nested metadata from later caller mutations", () => {
  const { tracker } = createStartedTracker();
  const payload = { checks: [{ rules: ["required"] }] };
  tracker.emitAppEvent({ type: "app.validated", payload });
  payload.checks[0].rules.push("outside");

  const exported = tracker.exportData();
  exported.events[0].payload.checks[0].rules.push("export-change");
  exported.forms[0].fields[0].shortcuts.enterIsCommand = false;
  const readEvents = tracker.getEvents();
  readEvents[0].payload.checks[0].rules.push("read-change");

  const freshExport = tracker.exportData();
  assert.deepEqual(freshExport.events[0].payload.checks[0].rules, ["required"]);
  assert.equal(freshExport.forms[0].fields[0].shortcuts.enterIsCommand, true);
});

test("registered scope excludes unrelated controls but preserves page lifecycle events", () => {
  const { tracker, documentHub, windowHub } = createStartedTracker({
    trackPointerTrajectory: true
  });
  const registered = createElement({ fieldId: "name" });
  const unrelatedForm = createElement({ fieldId: "name", formId: "unrelated" });
  const unregisteredField = createElement({ fieldId: "unregistered" });
  for (const target of [unrelatedForm, unregisteredField, null]) {
    documentHub.emit("keydown", { target, key: "Enter" });
    documentHub.emit("pointermove", { target, clientX: 10, clientY: 20 });
  }
  documentHub.emit("focusin", { target: registered });
  documentHub.emit("visibilitychange");
  windowHub.emit("pagehide", { persisted: true });

  const events = tracker.getEvents();
  assert.deepEqual(
    events.map((event) => event.type),
    ["focusin", "visibilitychange", "pagehide"]
  );
  assert.deepEqual(
    events.map((event) => event.sequence),
    [1, 2, 3]
  );
  assert.equal(events[2].payload.persisted, true);
});
