import test from "node:test";
import assert from "node:assert/strict";
import { createInputTracker } from "../dist/index.js";
import { MockEventHub, createElement, createStartedTracker } from "./helpers.mjs";

test("input length deltas are measured from focus and update field state", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({
    fieldId: "name",
    value: "",
    selectionStart: 0,
    selectionEnd: 0
  });

  documentHub.emit("focusin", { target: input });

  input.value = "hello";
  input.selectionStart = 1;
  input.selectionEnd = 4;
  documentHub.emit("input", { target: input, inputType: "insertText", data: "hello" });

  input.value = "hello!";
  input.selectionStart = 6;
  input.selectionEnd = 6;
  documentHub.emit("input", { target: input, inputType: "insertText" });

  input.value = "hell";
  input.selectionStart = 4;
  input.selectionEnd = 4;
  documentHub.emit("input", { target: input, inputType: "deleteContentBackward" });

  const inputs = tracker.getEvents().filter((event) => event.type === "input");
  assert.equal(inputs.length, 3);

  assert.equal(inputs[0].payload.valueLength, 5);
  assert.equal(inputs[0].payload.lengthDelta, 5);
  assert.equal(inputs[0].payload.selectionStart, 1);
  assert.equal(inputs[0].payload.selectionEnd, 4);
  assert.equal(inputs[0].payload.inputType, "insertText");
  assert.equal(inputs[0].payload.data, undefined);
  assert.equal(inputs[0].payload.value, undefined);

  assert.equal(inputs[1].payload.valueLength, 6);
  assert.equal(inputs[1].payload.lengthDelta, 1);

  assert.equal(inputs[2].payload.valueLength, 4);
  assert.equal(inputs[2].payload.lengthDelta, -2);
  assert.equal(inputs[2].payload.inputType, "deleteContentBackward");
});

test("beforeinput and change expose metadata without length deltas but sync baselines", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name", value: "abc" });

  documentHub.emit("focusin", { target: input });

  input.value = "abcd";
  documentHub.emit("beforeinput", {
    target: input,
    inputType: "insertText",
    data: "d"
  });

  input.value = "abcde";
  documentHub.emit("change", { target: input, inputType: "insertText", data: "e" });

  input.value = "abcdef";
  documentHub.emit("input", { target: input, inputType: "insertText", data: "f" });

  const [, beforeInput, change, inputEvent] = tracker.getEvents();

  assert.equal(beforeInput.type, "beforeinput");
  assert.equal(beforeInput.payload.valueLength, 4);
  assert.equal(beforeInput.payload.lengthDelta, undefined);
  assert.equal(beforeInput.payload.inputType, "insertText");

  assert.equal(change.type, "change");
  assert.equal(change.payload.valueLength, 5);
  assert.equal(change.payload.lengthDelta, undefined);

  assert.equal(inputEvent.payload.lengthDelta, 1);

  for (const event of [beforeInput, change, inputEvent]) {
    assert.equal(event.payload.data, undefined);
    assert.equal(event.payload.value, undefined);
  }
});

test("checked, select, and contenteditable controls expose only safe metadata", () => {
  const { tracker, documentHub } = createStartedTracker();
  const checkbox = createElement({
    fieldId: "name",
    type: "checkbox",
    value: "on",
    checked: false
  });
  const select = createElement({
    fieldId: "email",
    tagName: "select",
    type: "select-multiple",
    value: "secret-option",
    selectedOptions: [{ value: "secret-option" }, { value: "other-secret" }]
  });
  const editable = createElement({
    fieldId: "notes",
    tagName: "div",
    type: null,
    value: null,
    textContent: "private notes",
    isContentEditable: true
  });

  checkbox.checked = true;
  documentHub.emit("change", { target: checkbox });
  documentHub.emit("change", { target: select });
  documentHub.emit("input", { target: editable, inputType: "insertText" });

  const [checkboxEvent, selectEvent, editableEvent] = tracker.getEvents();

  assert.equal(checkboxEvent.payload.checked, true);
  assert.equal(checkboxEvent.payload.elementTag, "input");
  assert.equal(checkboxEvent.payload.controlType, "checkbox");
  assert.equal(checkboxEvent.payload.value, undefined);

  assert.equal(selectEvent.payload.selectedCount, 2);
  assert.equal(selectEvent.payload.valueLength, undefined);
  assert.equal(selectEvent.payload.elementTag, "select");
  assert.equal(selectEvent.payload.controlType, "select-multiple");
  assert.equal(selectEvent.payload.value, undefined);

  assert.equal(editableEvent.payload.valueLength, 13);
  assert.equal(editableEvent.payload.elementTag, "div");
  assert.equal(editableEvent.payload.controlType, undefined);
  assert.equal(editableEvent.payload.textContent, undefined);

  const encoded = JSON.stringify(tracker.getEvents());
  assert.equal(encoded.includes("secret-option"), false);
  assert.equal(encoded.includes("other-secret"), false);
  assert.equal(encoded.includes("private notes"), false);
});

test("contenteditable controls prefer value length over text content length when both exist", () => {
  const { tracker, documentHub } = createStartedTracker();
  const editable = createElement({
    fieldId: "notes",
    tagName: "div",
    type: null,
    value: "abc",
    textContent: "much longer text content",
    isContentEditable: true
  });

  documentHub.emit("input", { target: editable, inputType: "insertText" });

  const [event] = tracker.getEvents();
  assert.equal(event.payload.valueLength, 3);
  assert.equal(event.payload.elementTag, "div");
  assert.equal(event.payload.textContent, undefined);
});

test("selection metadata is omitted when controls do not expose it", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name", value: "abc" });

  documentHub.emit("input", { target: input, inputType: "insertText" });

  const [event] = tracker.getEvents();
  assert.equal("selectionStart" in event.payload, false);
  assert.equal("selectionEnd" in event.payload, false);
});

test("composition boundaries update per-field state for subsequent edit events", () => {
  const { tracker, documentHub } = createStartedTracker();
  const notes = createElement({ fieldId: "notes", tagName: "textarea", value: "h" });

  documentHub.emit("compositionstart", { target: notes });

  notes.value = "ha";
  documentHub.emit("input", {
    target: notes,
    inputType: "insertCompositionText",
    isComposing: false
  });

  documentHub.emit("compositionend", { target: notes });

  notes.value = "hah";
  documentHub.emit("input", {
    target: notes,
    inputType: "insertText",
    isComposing: false
  });

  const events = tracker.getEvents();
  assert.deepEqual(
    events.map((event) => [event.type, event.payload.isComposing]),
    [
      ["compositionstart", true],
      ["input", true],
      ["compositionend", false],
      ["input", false]
    ]
  );
});

test("composition state is isolated per registered form and field", () => {
  const documentHub = new MockEventHub();
  const tracker = createInputTracker({ document: documentHub });
  tracker.registerForm({
    formId: "catalog",
    fields: [{ fieldId: "query", order: 1, fieldKind: "search" }]
  });
  tracker.registerForm({
    formId: "feedback",
    fields: [{ fieldId: "query", order: 1, fieldKind: "textarea" }]
  });
  tracker.start();

  const catalog = createElement({ formId: "catalog", fieldId: "query" });
  const feedback = createElement({
    formId: "feedback",
    fieldId: "query",
    tagName: "textarea"
  });

  documentHub.emit("compositionstart", { target: catalog });
  documentHub.emit("input", { target: feedback, inputType: "insertText" });

  const [catalogStart, feedbackInput] = tracker.getEvents();
  assert.equal(catalogStart.formId, "catalog");
  assert.equal(catalogStart.payload.isComposing, true);
  assert.equal(feedbackInput.formId, "feedback");
  assert.equal(feedbackInput.payload.isComposing, false);
});

test("focus transitions record related targets and seed the length baseline", () => {
  const { tracker, documentHub } = createStartedTracker();
  const name = createElement({ fieldId: "name", value: "abc" });
  const email = createElement({ fieldId: "email", value: "a" });

  documentHub.emit("focusin", { target: name });
  documentHub.emit("focusout", { target: name, relatedTarget: email });
  documentHub.emit("focusin", { target: email });

  email.value = "ab";
  documentHub.emit("input", { target: email, inputType: "insertText" });

  const events = tracker.getEvents();
  const [nameFocus, nameBlur, emailFocus, emailInput] = events;

  assert.equal(nameFocus.type, "focusin");
  assert.equal(nameFocus.payload.valueLength, 3);
  assert.equal(nameFocus.payload.relatedFieldId, undefined);

  assert.equal(nameBlur.type, "focusout");
  assert.equal(nameBlur.payload.relatedFieldId, "email");
  assert.equal(nameBlur.payload.relatedFormId, "signup-form");

  assert.equal(emailFocus.payload.valueLength, 1);
  assert.equal(emailInput.payload.lengthDelta, 1);
});

test("selectedValues fallback counts selections when selectedOptions is absent", () => {
  const { tracker, documentHub } = createStartedTracker();
  const select = createElement({
    fieldId: "email",
    tagName: "select",
    type: null,
    value: "ignored-secret-value",
    selectedValues: ["first-secret", "second-secret", "third-secret"]
  });

  documentHub.emit("change", { target: select });

  const [event] = tracker.getEvents();
  assert.equal(event.payload.selectedCount, 3);
  assert.equal(event.payload.valueLength, undefined);
  assert.equal(event.payload.value, undefined);
  assert.equal(JSON.stringify(event).includes("ignored-secret-value"), false);
});
