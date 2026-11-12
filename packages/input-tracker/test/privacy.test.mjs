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

test("privacy guardrails avoid raw values and pasted payloads in browser event payloads", () => {
  const documentHub = new MockEventHub();
  let currentTs = 0;
  const inputTracker = createInputTracker({
    document: documentHub,
    now: () => currentTs
  });

  inputTracker.registerForm(createFormDefinition());
  inputTracker.start();

  const zipField = createElement({
    fieldId: "zip",
    tagName: "input",
    type: "text",
    value: ""
  });

  currentTs = 10;
  documentHub.emit("keydown", {
    target: zipField,
    key: "v",
    code: "KeyV",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false
  });

  zipField.value = "12345";
  zipField.selectionStart = 5;
  zipField.selectionEnd = 5;
  currentTs = 20;
  documentHub.emit("beforeinput", {
    target: zipField,
    inputType: "insertFromPaste",
    data: "12345",
    isComposing: false
  });

  currentTs = 30;
  documentHub.emit("input", {
    target: zipField,
    inputType: "insertFromPaste",
    data: "12345",
    isComposing: false
  });

  const events = inputTracker.getEvents();
  const pasteShortcut = events.find((event) => event.type === "keydown");
  const beforeInput = events.find((event) => event.type === "beforeinput");
  const input = events.find((event) => event.type === "input");

  assert.ok(pasteShortcut);
  assert.equal(pasteShortcut.payload.commandLike, true);
  assert.equal(pasteShortcut.payload.shortcut, "Ctrl+V");

  assert.ok(beforeInput);
  assert.equal(beforeInput.payload.data, undefined);
  assert.equal(beforeInput.payload.value, undefined);
  assert.equal(beforeInput.payload.valueLength, 5);

  assert.ok(input);
  assert.equal(input.payload.data, undefined);
  assert.equal(input.payload.value, undefined);
  assert.equal(input.payload.valueLength, 5);
});

test("no captured browser payload exposes values, typed text, or pasted data", () => {
  const secret = "s3cr3t-typed-value";
  const { tracker, documentHub, windowHub } = createStartedTracker();
  const input = createElement({
    fieldId: "name",
    value: secret,
    selectionStart: 3,
    selectionEnd: 7
  });
  const form = createElement({
    fieldId: null,
    formId: "signup-form",
    tagName: "form",
    type: null,
    value: secret
  });
  const browserEvents = [
    ["focusin", { target: input }],
    ["focusout", { target: input, relatedTarget: input }],
    ["keydown", { target: input, ...createKeyboardEvent({ key: "s", code: "KeyS" }) }],
    ["keydown", { target: input, ...createKeyboardEvent({ key: "Enter", code: "Enter" }) }],
    ["beforeinput", { target: input, inputType: "insertText", data: secret, isComposing: false }],
    ["input", { target: input, inputType: "insertText", data: secret, isComposing: false }],
    ["change", { target: input, inputType: "insertText", data: secret, isComposing: false }],
    ["compositionstart", { target: input, data: secret }],
    ["compositionend", { target: input, data: secret }],
    ["pointerdown", { target: input, pointerType: "mouse", button: 0, clientX: 1, clientY: 2 }],
    ["pointerup", { target: input, pointerType: "mouse", button: 0, clientX: 1, clientY: 2 }],
    ["click", { target: input, pointerType: "mouse", button: 0, clientX: 1, clientY: 2 }],
    ["submit", { target: form, defaultPrevented: false }],
    ["reset", { target: form, defaultPrevented: true }]
  ];

  for (const [type, event] of browserEvents) {
    documentHub.emit(type, event);
  }

  documentHub.visibilityState = "hidden";
  documentHub.emit("visibilitychange");
  windowHub.emit("pagehide", { persisted: true });

  const recorded = tracker.getEvents();
  assert.equal(recorded.length, browserEvents.length + 2);

  for (const event of recorded) {
    assert.equal("value" in event.payload, false, `${event.type} must not store value`);
    assert.equal("data" in event.payload, false, `${event.type} must not store data`);
    assert.equal("textContent" in event.payload, false, `${event.type} must not store textContent`);
  }

  assert.equal(JSON.stringify(recorded).includes(secret), false);
});

test("pasting into fields that treat paste as content redacts the shortcut and text", () => {
  const definition = {
    formId: "custom",
    fields: [
      {
        fieldId: "text",
        order: 1,
        fieldKind: "text",
        shortcuts: { pasteIsCommand: false }
      }
    ]
  };
  const { tracker, documentHub } = createStartedTracker({}, definition);
  const input = createElement({
    formId: "custom",
    fieldId: "text",
    value: "private clipboard"
  });

  documentHub.emit("keydown", {
    target: input,
    ...createKeyboardEvent({ key: "v", code: "KeyV", ctrlKey: true })
  });
  documentHub.emit("beforeinput", {
    target: input,
    inputType: "insertFromPaste",
    data: "private clipboard",
    isComposing: false
  });
  documentHub.emit("input", {
    target: input,
    inputType: "insertFromPaste",
    data: "private clipboard",
    isComposing: false
  });

  const [shortcut, beforeInput, inputEvent] = tracker.getEvents();
  assert.equal(shortcut.payload.commandLike, false);
  assert.equal(shortcut.payload.key, undefined);
  assert.equal(shortcut.payload.code, undefined);
  assert.equal(shortcut.payload.shortcut, undefined);
  assert.equal(shortcut.payload.commandId, undefined);
  assert.equal(shortcut.payload.keyCategory, "content-like");
  assert.equal(beforeInput.payload.data, undefined);
  assert.equal(inputEvent.payload.data, undefined);
  assert.equal(JSON.stringify(tracker.getEvents()).includes("private clipboard"), false);
});
