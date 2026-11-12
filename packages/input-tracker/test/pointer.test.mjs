import test from "node:test";
import assert from "node:assert/strict";
import { createElement, createStartedTracker } from "./helpers.mjs";

test("pointer button events record coordinates, pointer type, and button", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name" });

  documentHub.emit("pointerdown", {
    target: input,
    pointerType: "touch",
    button: 0,
    clientX: 10,
    clientY: 20
  });
  documentHub.emit("pointerup", {
    target: input,
    pointerType: "touch",
    button: 0,
    clientX: 12,
    clientY: 24
  });
  documentHub.emit("click", {
    target: input,
    pointerType: "mouse",
    button: 2,
    clientX: 13,
    clientY: 25
  });

  const events = tracker.getEvents();
  assert.deepEqual(
    events.map((event) => event.type),
    ["pointerdown", "pointerup", "click"]
  );

  assert.equal(events[0].payload.pointerType, "touch");
  assert.equal(events[0].payload.button, 0);
  assert.equal(events[0].payload.clientX, 10);
  assert.equal(events[0].payload.clientY, 20);

  assert.equal(events[1].payload.clientX, 12);
  assert.equal(events[1].payload.clientY, 24);

  assert.equal(events[2].payload.pointerType, "mouse");
  assert.equal(events[2].payload.button, 2);
  assert.equal(events[2].payload.clientX, 13);
  assert.equal(events[2].payload.clientY, 25);
});

test("form controls without a field id remain trackable inside a registered form", () => {
  const { tracker, documentHub } = createStartedTracker();
  const button = createElement({ fieldId: null, tagName: "button", type: null });

  documentHub.emit("click", {
    target: button,
    pointerType: "mouse",
    button: 0,
    clientX: 40,
    clientY: 50
  });

  const [event] = tracker.getEvents();
  assert.equal(event.type, "click");
  assert.equal(event.formId, "signup-form");
  assert.equal(event.fieldId, undefined);
  assert.equal(event.payload.elementTag, "button");
  assert.equal(event.payload.clientX, 40);
  assert.equal(event.payload.clientY, 50);
});

test("pointer trajectory capture is opt-in", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name" });

  assert.equal(documentHub.getListenerCount("pointermove"), 0);

  documentHub.emit("pointermove", {
    target: input,
    pointerType: "mouse",
    clientX: 1,
    clientY: 2
  });

  assert.deepEqual(tracker.getEvents(), []);
});

test("pointer trajectory samples at the configured rate using tracker time", () => {
  let now = 0;
  const { tracker, documentHub } = createStartedTracker({
    trackPointerTrajectory: true,
    pointerSamplingHz: 12,
    now: () => now
  });
  const input = createElement({ fieldId: "name" });

  for (const [timestamp, x] of [
    [0, 1],
    [50, 2],
    [83, 3],
    [84, 4],
    [200, 5]
  ]) {
    now = timestamp;
    documentHub.emit("pointermove", {
      target: input,
      pointerType: "pen",
      clientX: x,
      clientY: x * 2,
      timeStamp: 999_999
    });
  }

  const moves = tracker.getEvents().filter((event) => event.type === "pointermove.sampled");
  assert.deepEqual(
    moves.map((event) => [event.ts, event.payload.clientX]),
    [
      [0, 1],
      [84, 4],
      [200, 5]
    ]
  );
  assert.equal(moves[0].payload.pointerType, "pen");
  assert.equal(moves[0].payload.clientY, 2);
  assert.equal(moves[0].payload.button, undefined);
});

test("a higher sampling rate allows proportionally more pointer samples", () => {
  let now = 0;
  const { tracker, documentHub } = createStartedTracker({
    trackPointerTrajectory: true,
    pointerSamplingHz: 100,
    now: () => now
  });
  const input = createElement({ fieldId: "name" });

  for (const timestamp of [0, 9, 10, 19, 20]) {
    now = timestamp;
    documentHub.emit("pointermove", { target: input, clientX: timestamp, clientY: 0 });
  }

  const moves = tracker.getEvents().filter((event) => event.type === "pointermove.sampled");
  assert.deepEqual(
    moves.map((event) => event.ts),
    [0, 10, 20]
  );
});

test("unregistered pointer moves are ignored before consuming the sampling budget", () => {
  let now = 0;
  const { tracker, documentHub } = createStartedTracker({
    trackPointerTrajectory: true,
    pointerSamplingHz: 1,
    now: () => now
  });
  const registered = createElement({ fieldId: "name" });
  const unregistered = createElement({ fieldId: "name", formId: "other-form" });

  documentHub.emit("pointermove", {
    target: unregistered,
    clientX: 1,
    clientY: 1
  });

  now = 0;
  documentHub.emit("pointermove", {
    target: registered,
    clientX: 2,
    clientY: 2
  });
  documentHub.emit("pointermove", {
    target: registered,
    clientX: 3,
    clientY: 3
  });

  const events = tracker.getEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "pointermove.sampled");
  assert.equal(events[0].payload.clientX, 2);
});
