import test from "node:test";
import assert from "node:assert/strict";
import { createInputTracker } from "../dist/index.js";
import {
  MockEventHub,
  createElement,
  createKeyboardEvent,
  createStartedTracker
} from "./helpers.mjs";

test("form and field resolution follows tracking, data, name, id, and closest-form fallbacks", () => {
  const definition = {
    formId: "signup-form",
    fields: [
      { fieldId: "explicit", order: 1, fieldKind: "text" },
      { fieldId: "dataset-field", order: 2, fieldKind: "text" },
      { fieldId: "named", order: 3, fieldKind: "text" },
      { fieldId: "idonly", order: 4, fieldKind: "text" },
      { fieldId: "closest", order: 5, fieldKind: "text" },
      { fieldId: "data-form", order: 6, fieldKind: "text" }
    ]
  };
  const { tracker, documentHub } = createStartedTracker({}, definition);
  const targets = [
    createElement({
      fieldId: "explicit",
      formId: "signup-form",
      name: "wrong-name",
      id: "wrong-id"
    }),
    createElement({
      fieldId: null,
      formId: "signup-form",
      attributes: { "data-field-id": "dataset-field" }
    }),
    createElement({
      fieldId: null,
      formId: "signup-form",
      attributes: { name: "named" }
    }),
    createElement({
      fieldId: null,
      formId: "signup-form",
      attributes: { id: "idonly" }
    }),
    createElement({ fieldId: "closest", formId: null, closestFormId: "signup-form" }),
    createElement({
      fieldId: "data-form",
      formId: null,
      closestForm: false,
      attributes: { "data-form-id": "signup-form" }
    })
  ];

  for (const target of targets) {
    documentHub.emit("focusin", { target });
  }

  const events = tracker.getEvents();
  assert.deepEqual(
    events.map((event) => [event.formId, event.fieldId]),
    [
      ["signup-form", "explicit"],
      ["signup-form", "dataset-field"],
      ["signup-form", "named"],
      ["signup-form", "idonly"],
      ["signup-form", "closest"],
      ["signup-form", "data-form"]
    ]
  );
  assert.ok(events.every((event) => event.payload.fieldKind === "text"));
});

test("custom resolvers map synthetic or portal targets and fall back to DOM resolution", () => {
  const documentHub = new MockEventHub();
  const seen = [];
  const portal = { kind: "portal" };
  const tracker = createInputTracker({
    document: documentHub,
    resolveFieldId(target) {
      seen.push(target);
      return target === portal ? "email" : undefined;
    },
    resolveFormId(target) {
      return target === portal ? "signup-form" : undefined;
    }
  });
  tracker.registerForm({
    formId: "signup-form",
    fields: [
      { fieldId: "name", order: 1, fieldKind: "text" },
      { fieldId: "email", order: 2, fieldKind: "email" }
    ]
  });
  tracker.start();

  documentHub.emit("focusin", { target: portal });
  documentHub.emit("focusin", { target: createElement({ fieldId: "name" }) });

  const [portalEvent, fallbackEvent] = tracker.getEvents();
  assert.equal(portalEvent.formId, "signup-form");
  assert.equal(portalEvent.fieldId, "email");
  assert.equal(portalEvent.payload.fieldKind, "email");
  assert.equal(fallbackEvent.formId, "signup-form");
  assert.equal(fallbackEvent.fieldId, "name");
  assert.equal(fallbackEvent.payload.fieldKind, "text");
  assert.ok(seen.includes(portal));
});

test("a field-only target is associated with the single form that declares it", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name", formId: null, closestForm: false });

  documentHub.emit("focusin", { target: input });

  const [event] = tracker.getEvents();
  assert.equal(event.formId, "signup-form");
  assert.equal(event.fieldId, "name");
  assert.equal(event.payload.fieldKind, "text");
});

test("ambiguous field ids across forms are not inferred", () => {
  const documentHub = new MockEventHub();
  const tracker = createInputTracker({ document: documentHub });
  tracker.registerForm({
    formId: "catalog",
    fields: [{ fieldId: "shared", order: 1, fieldKind: "search" }]
  });
  tracker.registerForm({
    formId: "feedback",
    fields: [{ fieldId: "shared", order: 1, fieldKind: "textarea" }]
  });
  tracker.start();

  const target = createElement({ fieldId: "shared", formId: null, closestForm: false });
  documentHub.emit("focusin", { target });
  assert.deepEqual(tracker.getEvents(), []);

  const broadDocumentHub = new MockEventHub();
  const broadTracker = createInputTracker({
    document: broadDocumentHub,
    trackRegisteredFormsOnly: false
  });
  broadTracker.registerForm({
    formId: "catalog",
    fields: [{ fieldId: "shared", order: 1, fieldKind: "search" }]
  });
  broadTracker.registerForm({
    formId: "feedback",
    fields: [{ fieldId: "shared", order: 1, fieldKind: "textarea" }]
  });
  broadTracker.start();

  broadDocumentHub.emit("focusin", { target });
  const [broadEvent] = broadTracker.getEvents();
  assert.equal(broadEvent.formId, undefined);
  assert.equal(broadEvent.fieldId, "shared");
  assert.equal(broadEvent.payload.fieldKind, undefined);
});

test("unregistered forms, unknown fields, and empty targets are filtered by default", () => {
  const { tracker, documentHub } = createStartedTracker();
  const registered = createElement({ fieldId: "name" });
  const otherForm = createElement({ fieldId: "name", formId: "other-form" });
  const unknownField = createElement({ fieldId: "unknown" });

  for (const target of [registered, otherForm, unknownField, null]) {
    documentHub.emit("keydown", {
      target,
      ...createKeyboardEvent({ key: "Enter", code: "Enter" })
    });
  }

  const events = tracker.getEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].formId, "signup-form");
  assert.equal(events[0].fieldId, "name");
  assert.equal(events[0].payload.fieldKind, "text");
});

test("broad capture keeps context for unregistered forms, unknown fields, and empty targets", () => {
  const { tracker, documentHub } = createStartedTracker({ trackRegisteredFormsOnly: false });
  const registered = createElement({ fieldId: "name" });
  const otherForm = createElement({ fieldId: "name", formId: "other-form" });
  const unknownField = createElement({ fieldId: "unknown" });

  for (const target of [registered, otherForm, unknownField, null]) {
    documentHub.emit("keydown", {
      target,
      ...createKeyboardEvent({ key: "Enter", code: "Enter" })
    });
  }

  const events = tracker.getEvents();
  assert.equal(events.length, 4);
  assert.deepEqual(
    events.map((event) => [event.formId, event.fieldId]),
    [
      ["signup-form", "name"],
      ["other-form", "name"],
      ["signup-form", "unknown"],
      [undefined, undefined]
    ]
  );
  assert.equal(events[0].payload.fieldKind, "text");
  assert.equal(events[1].payload.fieldKind, undefined);
  assert.equal(events[2].payload.fieldKind, undefined);
  assert.equal(events[3].payload.fieldKind, undefined);
  assert.ok(events.every((event) => event.payload.commandId === "enter-navigation"));
});

test("re-registering forms recomputes unique field inference", () => {
  const documentHub = new MockEventHub();
  const tracker = createInputTracker({ document: documentHub });
  tracker.registerForm({
    formId: "catalog",
    fields: [
      { fieldId: "shared", order: 1, fieldKind: "search" },
      { fieldId: "only", order: 2, fieldKind: "search" }
    ]
  });
  tracker.registerForm({
    formId: "feedback",
    fields: [{ fieldId: "shared", order: 1, fieldKind: "textarea" }]
  });
  tracker.start();

  const shared = createElement({ fieldId: "shared", formId: null, closestForm: false });
  const only = createElement({ fieldId: "only", formId: null, closestForm: false });

  documentHub.emit("focusin", { target: shared });
  documentHub.emit("focusin", { target: only });

  let events = tracker.getEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].formId, "catalog");
  assert.equal(events[0].fieldId, "only");

  tracker.registerForm({
    formId: "feedback",
    fields: [{ fieldId: "feedback-only", order: 1, fieldKind: "textarea" }]
  });

  documentHub.emit("focusin", { target: shared });

  events = tracker.getEvents();
  assert.equal(events.length, 2);
  assert.equal(events[1].formId, "catalog");
  assert.equal(events[1].fieldId, "shared");
  assert.equal(events[1].payload.fieldKind, "search");
});

test("registered field kind and path are attached to browser event payloads", () => {
  const definition = {
    formId: "shipping",
    fields: [
      {
        fieldId: "street",
        order: 1,
        fieldKind: "address-line",
        path: "shipping.street"
      }
    ]
  };
  const { tracker, documentHub } = createStartedTracker({}, definition);

  documentHub.emit("focusin", {
    target: createElement({ formId: "shipping", fieldId: "street" })
  });

  const [event] = tracker.getEvents();
  assert.equal(event.formId, "shipping");
  assert.equal(event.fieldId, "street");
  assert.equal(event.payload.fieldKind, "address-line");
  assert.equal(event.payload.fieldPath, "shipping.street");
});
