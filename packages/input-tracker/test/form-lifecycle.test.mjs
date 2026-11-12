import test from "node:test";
import assert from "node:assert/strict";
import { createElement, createStartedTracker } from "./helpers.mjs";

test("submit and reset events record form lifecycle without field content", () => {
  const { tracker, documentHub } = createStartedTracker();
  const form = createElement({
    fieldId: null,
    formId: "signup-form",
    tagName: "form",
    type: null,
    value: "secret-form-value"
  });
  const unregisteredForm = createElement({
    fieldId: null,
    formId: "other-form",
    tagName: "form",
    type: null
  });

  documentHub.emit("submit", { target: form, defaultPrevented: false });
  documentHub.emit("reset", { target: form, defaultPrevented: true });
  documentHub.emit("submit", { target: unregisteredForm, defaultPrevented: false });

  const events = tracker.getEvents();
  assert.deepEqual(
    events.map((event) => event.type),
    ["submit", "reset"]
  );
  assert.equal(events[0].formId, "signup-form");
  assert.equal(events[0].fieldId, undefined);
  assert.equal(events[0].payload.defaultPrevented, false);
  assert.equal(events[1].payload.defaultPrevented, true);
  assert.equal(JSON.stringify(events).includes("secret-form-value"), false);
});

test("visibilitychange reports the live document visibility state without a form", () => {
  const { tracker, documentHub } = createStartedTracker();

  documentHub.visibilityState = "hidden";
  documentHub.emit("visibilitychange");
  documentHub.visibilityState = "visible";
  documentHub.emit("visibilitychange", {
    target: createElement({ fieldId: "name", formId: "unregistered-form" })
  });

  const events = tracker.getEvents();
  assert.deepEqual(
    events.map((event) => event.type),
    ["visibilitychange", "visibilitychange"]
  );
  assert.equal(events[0].payload.visibilityState, "hidden");
  assert.equal(events[1].payload.visibilityState, "visible");
  assert.equal(events[0].formId, undefined);
  assert.equal(events[0].fieldId, undefined);
});

test("pagehide records back-forward cache state and defaults persisted to false", () => {
  const { tracker, windowHub } = createStartedTracker();

  windowHub.emit("pagehide");
  windowHub.emit("pagehide", { persisted: true });
  windowHub.emit("pagehide", { persisted: "yes" });

  const events = tracker.getEvents();
  assert.deepEqual(
    events.map((event) => [event.type, event.payload.persisted]),
    [
      ["pagehide", false],
      ["pagehide", true],
      ["pagehide", false]
    ]
  );
  assert.ok(events.every((event) => event.formId === undefined));
});

test("page lifecycle events remain available with broad filtering enabled", () => {
  const { tracker, documentHub, windowHub } = createStartedTracker({
    trackRegisteredFormsOnly: false
  });

  documentHub.visibilityState = "hidden";
  documentHub.emit("visibilitychange");
  windowHub.emit("pagehide", { persisted: true });

  assert.deepEqual(
    tracker.getEvents().map((event) => event.type),
    ["visibilitychange", "pagehide"]
  );
});
