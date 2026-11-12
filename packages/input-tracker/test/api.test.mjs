import test from "node:test";
import assert from "node:assert/strict";
import { createInputTracker } from "../dist/index.js";
import {
  MockEventHub,
  createElement,
  createFormDefinition,
  createKeyboardEvent,
  createStartedTracker
} from "./helpers.mjs";

const DOCUMENT_EVENT_TYPES = [
  "focusin",
  "focusout",
  "keydown",
  "keyup",
  "beforeinput",
  "input",
  "change",
  "compositionstart",
  "compositionend",
  "pointerdown",
  "pointerup",
  "click",
  "submit",
  "reset",
  "visibilitychange"
];

test("start requires a document-like event target", () => {
  const tracker = createInputTracker({ document: undefined, window: undefined });

  assert.throws(() => tracker.start(), /document-like event target/);
});

test("start attaches the event surface once and stop removes every listener", () => {
  const documentHub = new MockEventHub();
  const windowHub = new MockEventHub();
  const tracker = createInputTracker({ document: documentHub, window: windowHub });

  tracker.start();
  tracker.start();

  for (const type of DOCUMENT_EVENT_TYPES) {
    assert.equal(documentHub.getListenerCount(type), 1, `${type} should be attached once`);
  }

  assert.equal(documentHub.getListenerCount("pointermove"), 0);
  assert.equal(windowHub.getListenerCount("pagehide"), 1);
  assert.equal(documentHub.registrations.get("keydown")[0].options.capture, true);
  assert.equal(windowHub.registrations.get("pagehide")[0].options.capture, true);

  tracker.stop();
  tracker.stop();

  assert.equal(documentHub.totalListenerCount, 0);
  assert.equal(windowHub.totalListenerCount, 0);
});

test("pointer trajectory listeners are opt-in", () => {
  const disabledDocument = new MockEventHub();
  const disabled = createInputTracker({ document: disabledDocument });
  disabled.start();
  assert.equal(disabledDocument.getListenerCount("pointermove"), 0);
  disabled.stop();

  const enabledDocument = new MockEventHub();
  const enabled = createInputTracker({
    document: enabledDocument,
    trackPointerTrajectory: true
  });
  enabled.start();
  assert.equal(enabledDocument.getListenerCount("pointermove"), 1);
  enabled.stop();
  assert.equal(enabledDocument.getListenerCount("pointermove"), 0);
});

test("start works without a window target and simply skips pagehide tracking", () => {
  const documentHub = new MockEventHub();
  const tracker = createInputTracker({ document: documentHub, window: null });

  assert.doesNotThrow(() => tracker.start());
  assert.equal(documentHub.getListenerCount("keydown"), 1);
  tracker.stop();
});

test("event records use configured clocks and a fixed session id", () => {
  let now = 5;
  let wallTimeCounter = 0;
  const tracker = createInputTracker({
    document: new MockEventHub(),
    sessionId: "session-fixed",
    now: () => now,
    wallTimeProvider: () => `wall-${++wallTimeCounter}`
  });

  const first = tracker.emitAppEvent({ type: "app.first", payload: {} });
  now = 8;
  const second = tracker.emitAppEvent({ type: "app.second" });

  assert.equal(first.schemaVersion, 1);
  assert.match(first.pageId, /^page-/);
  assert.equal(first.sessionId, "session-fixed");
  assert.equal(first.sequence, 1);
  assert.equal(first.eventId, `${first.pageId}:1`);
  assert.equal(first.ts, 5);
  assert.equal(first.wallTime, "wall-1");

  assert.equal(second.sequence, 2);
  assert.equal(second.eventId, `${first.pageId}:2`);
  assert.equal(second.sessionId, first.sessionId);
  assert.equal(second.ts, 8);
  assert.equal(second.wallTime, "wall-2");

  const exported = tracker.exportData();
  assert.equal(exported.sessionId, first.sessionId);
  assert.equal(exported.pageId, first.pageId);
  assert.deepEqual(exported.events, [first, second]);
});

test("default session and page ids are unique opaque values", () => {
  const firstTracker = createInputTracker({ document: new MockEventHub() });
  const secondTracker = createInputTracker({ document: new MockEventHub() });
  const first = firstTracker.emitAppEvent({ type: "app.first" });
  const second = secondTracker.emitAppEvent({ type: "app.first" });

  assert.match(first.sessionId, /^session-/);
  assert.match(first.pageId, /^page-/);
  assert.match(second.sessionId, /^session-/);
  assert.match(second.pageId, /^page-/);
  assert.notEqual(first.sessionId, second.sessionId);
  assert.notEqual(first.pageId, second.pageId);
});

test("empty exports still describe session identity and empty collections", () => {
  const tracker = createInputTracker({ document: new MockEventHub() });
  const exported = tracker.exportData();

  assert.match(exported.sessionId, /^session-/);
  assert.match(exported.pageId, /^page-/);
  assert.deepEqual(exported.forms, []);
  assert.deepEqual(exported.events, []);
});

test("app event payloads are cloned, record-coerced, and isolated from callers", () => {
  const tracker = createInputTracker({ document: new MockEventHub() });
  const payload = {
    checks: [{ rules: ["required"] }],
    at: new Date(0),
    skipped: () => "not serializable"
  };

  const event = tracker.emitAppEvent({
    formId: "signup-form",
    fieldId: "email",
    type: "validated",
    payload
  });

  payload.checks[0].rules.push("caller-mutation");

  assert.equal(event.source, "app");
  assert.equal(event.formId, "signup-form");
  assert.equal(event.fieldId, "email");
  assert.deepEqual(event.payload.checks[0].rules, ["required"]);
  assert.equal(event.payload.at, "1970-01-01T00:00:00.000Z");
  assert.equal("skipped" in event.payload, false);

  const empty = tracker.emitAppEvent({ type: "app.empty" });
  const scalar = tracker.emitAppEvent({ type: "app.scalar", payload: "not-a-record" });

  assert.deepEqual(empty.payload, {});
  assert.equal(empty.formId, undefined);
  assert.equal(empty.fieldId, undefined);
  assert.deepEqual(scalar.payload, {});
});

test("subscribers and onEvent observe published events until unsubscribed", () => {
  const observed = [];
  const firstSubscriber = [];
  const secondSubscriber = [];
  const { tracker, documentHub } = createStartedTracker({
    onEvent: (event) => observed.push(event)
  });

  const unsubscribeFirst = tracker.subscribe((event) => firstSubscriber.push(event));
  const unsubscribeSecond = tracker.subscribe((event) => secondSubscriber.push(event));

  documentHub.emit("focusin", { target: createElement({ fieldId: "name" }) });
  const appEvent = tracker.emitAppEvent({ type: "app.checkpoint", payload: { step: 2 } });

  assert.deepEqual(
    observed.map((event) => event.type),
    ["focusin", "app.checkpoint"]
  );
  assert.equal(observed[1], appEvent);
  assert.equal(firstSubscriber[1], appEvent);
  assert.equal(secondSubscriber[1], appEvent);

  unsubscribeFirst();
  tracker.emitAppEvent({ type: "app.after-unsubscribe" });

  assert.deepEqual(
    firstSubscriber.map((event) => event.type),
    ["focusin", "app.checkpoint"]
  );
  assert.deepEqual(
    secondSubscriber.map((event) => event.type),
    ["focusin", "app.checkpoint", "app.after-unsubscribe"]
  );

  unsubscribeSecond();
  unsubscribeSecond();
  tracker.emitAppEvent({ type: "app.after-all-unsubscribed" });

  assert.equal(secondSubscriber.length, 3);
  assert.equal(observed.length, 4);
});

test("browser capture is inactive before start and after stop while app events remain", () => {
  const documentHub = new MockEventHub();
  const tracker = createInputTracker({ document: documentHub });
  tracker.registerForm(createFormDefinition());

  documentHub.emit("focusin", { target: createElement({ fieldId: "name" }) });
  assert.deepEqual(tracker.getEvents(), []);

  tracker.start();
  documentHub.emit("focusin", { target: createElement({ fieldId: "name" }) });

  tracker.stop();
  documentHub.emit("focusout", { target: createElement({ fieldId: "name" }) });
  const appEvent = tracker.emitAppEvent({ type: "app.after-stop" });

  assert.deepEqual(
    tracker.getEvents().map((event) => event.type),
    ["focusin", "app.after-stop"]
  );
  assert.equal(appEvent.sequence, 2);
});

test("duplicate field ids are rejected before replacing a registered form", () => {
  const tracker = createInputTracker({ document: new MockEventHub() });

  tracker.registerForm({
    formId: "signup-form",
    fields: [
      { fieldId: "name", order: 1 },
      { fieldId: "email", order: 2 }
    ]
  });

  assert.throws(
    () =>
      tracker.registerForm({
        formId: "signup-form",
        fields: [
          { fieldId: "duplicate", order: 1 },
          { fieldId: "duplicate", order: 2 }
        ]
      }),
    /Duplicate fieldId "duplicate" detected in form "signup-form"/
  );

  const exported = tracker.exportData();
  assert.equal(exported.forms.length, 1);
  assert.deepEqual(
    exported.forms[0].fields.map((field) => field.fieldId),
    ["name", "email"]
  );
});

test("registered forms are sorted by order and replacements overwrite prior definitions", () => {
  const tracker = createInputTracker({ document: new MockEventHub() });

  tracker.registerForm({
    formId: "profile",
    fields: [
      { fieldId: "third", order: 3, fieldKind: "text", path: "contact.third" },
      {
        fieldId: "first",
        order: 1,
        fieldKind: "email",
        shortcuts: { enterIsCommand: false }
      },
      { fieldId: "second", order: 2, fieldKind: "textarea" }
    ]
  });

  const firstExport = tracker.exportData();
  const form = firstExport.forms[0];
  assert.equal(form.formId, "profile");
  assert.deepEqual(
    form.fields.map((field) => field.fieldId),
    ["first", "second", "third"]
  );
  assert.equal(form.fields[0].fieldKind, "email");
  assert.equal(form.fields[0].shortcuts.enterIsCommand, false);
  assert.equal(form.fields[2].path, "contact.third");

  tracker.registerForm({
    formId: "profile",
    fields: [{ fieldId: "only", order: 1, fieldKind: "search" }]
  });

  const secondExport = tracker.exportData();
  const forms = secondExport.forms;
  assert.equal(forms.length, 1);
  assert.deepEqual(
    forms[0].fields.map((field) => field.fieldId),
    ["only"]
  );
  assert.equal(forms[0].fields[0].fieldKind, "search");
});

test("flush transfers buffered records and subsequent event identity continues", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name" });

  documentHub.emit("focusin", { target: input });
  documentHub.emit("focusout", { target: input });

  const flushed = tracker.flush();
  assert.equal(flushed.length, 2);
  assert.equal(flushed[0].sequence, 1);
  assert.equal(flushed[1].sequence, 2);
  assert.deepEqual(tracker.getEvents(), []);
  assert.deepEqual(tracker.flush(), []);

  documentHub.emit("focusin", { target: input });
  const next = tracker.flush();
  assert.equal(next[0].sequence, 3);
});

test("getEvents returns isolated snapshots without draining the buffer", () => {
  const tracker = createInputTracker({ document: new MockEventHub() });
  tracker.emitAppEvent({ type: "app.first", payload: { nested: { value: 1 } } });

  const firstRead = tracker.getEvents();
  firstRead[0].payload.nested.value = 99;
  firstRead.push({ type: "injected" });

  const secondRead = tracker.getEvents();
  assert.equal(secondRead.length, 1);
  assert.equal(secondRead[0].payload.nested.value, 1);
  assert.equal(secondRead[0].type, "app.first");
});

test("keydown payloads for targets outside registered forms are not captured by default", () => {
  const { tracker, documentHub } = createStartedTracker();
  const control = createElement({
    fieldId: null,
    formId: "unregistered-form",
    tagName: "button",
    type: null
  });

  documentHub.emit("keydown", {
    target: control,
    ...createKeyboardEvent({ key: "Enter", code: "Enter" })
  });

  assert.deepEqual(tracker.getEvents(), []);
});
