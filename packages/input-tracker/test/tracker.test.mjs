import test from "node:test";
import assert from "node:assert/strict";
import { createInputTracker } from "../dist/index.js";
import { MockEventHub, createElement, createFormDefinition } from "./helpers.mjs";

test("InputTracker normalizes browser events without storing raw typed characters", () => {
  const documentHub = new MockEventHub();
  const windowHub = new MockEventHub();
  let currentTs = 0;
  const inputTracker = createInputTracker({
    document: documentHub,
    window: windowHub,
    now: () => currentTs,
    wallTimeProvider: () => "2026-03-28T12:00:00.000Z"
  });

  inputTracker.registerForm(createFormDefinition());
  inputTracker.start();

  const nameField = createElement({
    fieldId: "name",
    tagName: "input",
    type: "text",
    value: ""
  });

  currentTs = 10;
  documentHub.emit("focusin", { target: nameField });

  currentTs = 20;
  documentHub.emit("keydown", {
    target: nameField,
    key: "a",
    code: "KeyA",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false
  });

  currentTs = 30;
  documentHub.emit("beforeinput", {
    target: nameField,
    inputType: "insertText",
    data: "a",
    isComposing: false
  });

  nameField.value = "a";
  nameField.selectionStart = 1;
  nameField.selectionEnd = 1;
  currentTs = 40;
  documentHub.emit("input", {
    target: nameField,
    inputType: "insertText",
    data: "a",
    isComposing: false
  });

  currentTs = 50;
  documentHub.emit("keydown", {
    target: nameField,
    key: "Enter",
    code: "Enter",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false
  });

  const events = inputTracker.getEvents();
  const plainKeyEvent = events.find((event) => event.type === "keydown" && event.ts === 20);
  const inputEvent = events.find((event) => event.type === "input");
  const enterEvent = events.find((event) => event.type === "keydown" && event.ts === 50);

  assert.ok(plainKeyEvent);
  assert.equal(plainKeyEvent.payload.commandLike, false);
  assert.equal(plainKeyEvent.payload.key, undefined);
  assert.equal(plainKeyEvent.payload.code, undefined);
  assert.equal(plainKeyEvent.payload.keyCategory, "content-like");

  assert.ok(inputEvent);
  assert.equal(inputEvent.payload.valueLength, 1);
  assert.equal(inputEvent.payload.lengthDelta, 1);
  assert.equal(inputEvent.payload.data, undefined);

  assert.ok(enterEvent);
  assert.equal(enterEvent.payload.commandLike, true);
  assert.equal(enterEvent.payload.key, "Enter");
  assert.equal(enterEvent.payload.commandId, "enter-navigation");
});

test("InputTracker respects per-field Enter semantics and records semantic app events", () => {
  const documentHub = new MockEventHub();
  const inputTracker = createInputTracker({
    document: documentHub,
    now: () => 100
  });

  inputTracker.registerForm(createFormDefinition());
  inputTracker.start();

  const notesField = createElement({
    fieldId: "notes",
    tagName: "textarea",
    value: "hello"
  });

  documentHub.emit("keydown", {
    target: notesField,
    key: "Enter",
    code: "Enter",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false
  });

  inputTracker.emitAppEvent({
    formId: "signup-form",
    fieldId: "email",
    type: "validated.failure",
    payload: {
      ruleId: "email-format"
    }
  });

  const events = inputTracker.getEvents();
  const textareaEnter = events.find((event) => event.type === "keydown");
  const appEvent = events.find((event) => event.type === "validated.failure");

  assert.ok(textareaEnter);
  assert.equal(textareaEnter.payload.key, "Enter");
  assert.equal(textareaEnter.payload.commandLike, false);

  assert.ok(appEvent);
  assert.equal(appEvent.source, "app");
  assert.equal(appEvent.payload.ruleId, "email-format");
});

test("InputTracker exports raw data as a separate analysis-ready payload", () => {
  const documentHub = new MockEventHub();
  let currentTs = 0;
  const inputTracker = createInputTracker({
    document: documentHub,
    now: () => currentTs
  });

  inputTracker.registerForm(createFormDefinition());
  inputTracker.start();

  const emailField = createElement({
    fieldId: "email",
    tagName: "input",
    type: "email",
    value: ""
  });

  currentTs = 10;
  documentHub.emit("focusin", { target: emailField });
  currentTs = 20;
  inputTracker.emitAppEvent({
    formId: "signup-form",
    fieldId: "email",
    type: "validated.failure",
    payload: { ruleId: "email-format" }
  });

  const exported = inputTracker.exportData();

  assert.equal(exported.forms.length, 1);
  assert.equal(exported.forms[0].formId, "signup-form");
  assert.equal(exported.events.length, 2);
  assert.equal(exported.events[1].type, "validated.failure");
  assert.equal(exported.events[1].payload.ruleId, "email-format");
});
