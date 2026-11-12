import test from "node:test";
import assert from "node:assert/strict";
import { createElement, createKeyboardEvent, createStartedTracker } from "./helpers.mjs";

function isAltGraphModifier(name) {
  return name === "AltGraph";
}

test("printable keydown and keyup payloads are redacted but keep modifier state", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name" });

  documentHub.emit("keydown", {
    target: input,
    ...createKeyboardEvent({
      key: "a",
      code: "KeyA",
      shiftKey: true,
      repeat: true,
      isComposing: true
    })
  });
  documentHub.emit("keyup", {
    target: input,
    ...createKeyboardEvent({ key: "a", code: "KeyA", shiftKey: true })
  });

  const [keydown, keyup] = tracker.getEvents();

  for (const event of [keydown, keyup]) {
    assert.equal(event.payload.key, undefined);
    assert.equal(event.payload.code, undefined);
    assert.equal(event.payload.shortcut, undefined);
    assert.equal(event.payload.commandId, undefined);
    assert.equal(event.payload.commandLike, false);
    assert.equal(event.payload.keyCategory, "content-like");
    assert.equal(event.payload.shiftKey, true);
  }

  assert.equal(keydown.type, "keydown");
  assert.equal(keydown.payload.repeat, true);
  assert.equal(keydown.payload.isComposing, true);
  assert.equal(keyup.type, "keyup");
  assert.equal(keyup.payload.repeat, false);
  assert.equal(keyup.payload.isComposing, false);
});

test("non-printable editing keys keep their identity without becoming commands", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name" });
  const keys = [
    ["Home", "Home"],
    ["End", "End"],
    ["PageUp", "PageUp"],
    ["PageDown", "PageDown"],
    ["Backspace", "Backspace"],
    ["Delete", "Delete"]
  ];

  for (const [key, code] of keys) {
    documentHub.emit("keydown", {
      target: input,
      ...createKeyboardEvent({ key, code })
    });
  }

  const events = tracker.getEvents();
  assert.equal(events.length, keys.length);

  for (const [index, [key, code]] of keys.entries()) {
    const payload = events[index].payload;
    assert.equal(payload.key, key);
    assert.equal(payload.code, code);
    assert.equal(payload.commandLike, false);
    assert.equal(payload.keyCategory, "non-printable");
    assert.equal(payload.shortcut, undefined);
    assert.equal(payload.commandId, undefined);
  }
});

test("arrow keys and Escape are recorded as navigation commands", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name" });
  const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape"];

  for (const key of keys) {
    documentHub.emit("keydown", {
      target: input,
      ...createKeyboardEvent({ key, code: key })
    });
  }

  const events = tracker.getEvents();

  for (const [index, key] of keys.entries()) {
    const payload = events[index].payload;
    assert.equal(payload.key, key);
    assert.equal(payload.commandLike, true);
    assert.equal(payload.keyCategory, "command");
    assert.equal(payload.shortcut, key);
    assert.equal(payload.commandId, key === "Escape" ? "escape" : "arrow-navigation");
  }
});

test("field shortcut rules control Enter, Tab, paste, and modifier commands", () => {
  const definition = {
    formId: "commands",
    fields: [
      { fieldId: "text", order: 1, fieldKind: "text" },
      {
        fieldId: "multiline",
        order: 2,
        fieldKind: "textarea",
        shortcuts: { enterIsCommand: false }
      },
      { fieldId: "noTab", order: 3, fieldKind: "text", shortcuts: { tabIsCommand: false } },
      { fieldId: "noPaste", order: 4, fieldKind: "text", shortcuts: { pasteIsCommand: false } },
      {
        fieldId: "literal",
        order: 5,
        fieldKind: "textarea",
        shortcuts: { enterIsCommand: false, tabIsCommand: false, pasteIsCommand: false }
      }
    ]
  };
  const { tracker, documentHub } = createStartedTracker({}, definition);
  const text = createElement({ formId: "commands", fieldId: "text" });
  const multiline = createElement({
    formId: "commands",
    fieldId: "multiline",
    tagName: "textarea"
  });
  const noTab = createElement({ formId: "commands", fieldId: "noTab" });
  const noPaste = createElement({ formId: "commands", fieldId: "noPaste" });
  const literal = createElement({
    formId: "commands",
    fieldId: "literal",
    tagName: "textarea"
  });

  const emit = (target, overrides) =>
    documentHub.emit("keydown", { target, ...createKeyboardEvent(overrides) });

  emit(text, { key: "Tab", code: "Tab" });
  emit(noTab, { key: "Tab", code: "Tab" });
  emit(text, { key: "Enter", code: "Enter" });
  emit(multiline, { key: "Enter", code: "Enter" });
  emit(text, { key: "v", code: "KeyV", ctrlKey: true });
  emit(noPaste, { key: "v", code: "KeyV", ctrlKey: true });
  emit(text, { key: "V", code: "KeyV", ctrlKey: true, shiftKey: true });
  emit(text, { key: "v", code: "KeyV", metaKey: true });
  emit(text, { key: "Enter", code: "Enter", ctrlKey: true });
  emit(text, { key: "z", code: "KeyZ", ctrlKey: true });
  emit(text, { key: "z", code: "KeyZ", altKey: true });
  emit(text, { key: "A", code: "KeyA", shiftKey: true });
  emit(literal, { key: "Enter", code: "Enter" });

  const events = tracker.getEvents();
  assert.equal(events.length, 13);

  const tabCommand = events[0].payload;
  assert.equal(tabCommand.key, "Tab");
  assert.equal(tabCommand.commandLike, true);
  assert.equal(tabCommand.keyCategory, "command");
  assert.equal(tabCommand.commandId, "tab-navigation");
  assert.equal(tabCommand.shortcut, "Tab");

  const tabLiteral = events[1].payload;
  assert.equal(tabLiteral.key, "Tab");
  assert.equal(tabLiteral.commandLike, false);
  assert.equal(tabLiteral.keyCategory, "non-printable");
  assert.equal(tabLiteral.commandId, undefined);
  assert.equal(tabLiteral.shortcut, undefined);

  const enterCommand = events[2].payload;
  assert.equal(enterCommand.key, "Enter");
  assert.equal(enterCommand.commandLike, true);
  assert.equal(enterCommand.commandId, "enter-navigation");
  assert.equal(enterCommand.shortcut, "Enter");

  const enterLiteral = events[3].payload;
  assert.equal(enterLiteral.key, "Enter");
  assert.equal(enterLiteral.commandLike, false);
  assert.equal(enterLiteral.keyCategory, "non-printable");
  assert.equal(enterLiteral.commandId, undefined);

  const pasteCommand = events[4].payload;
  assert.equal(pasteCommand.key, "v");
  assert.equal(pasteCommand.code, "KeyV");
  assert.equal(pasteCommand.commandLike, true);
  assert.equal(pasteCommand.commandId, "paste-shortcut");
  assert.equal(pasteCommand.shortcut, "Ctrl+V");
  assert.equal(pasteCommand.keyCategory, "command");

  const pasteLiteral = events[5].payload;
  assert.equal(pasteLiteral.ctrlKey, true);
  assert.equal(pasteLiteral.key, undefined);
  assert.equal(pasteLiteral.code, undefined);
  assert.equal(pasteLiteral.commandLike, false);
  assert.equal(pasteLiteral.keyCategory, "content-like");
  assert.equal(pasteLiteral.commandId, undefined);
  assert.equal(pasteLiteral.shortcut, undefined);

  const shiftedPaste = events[6].payload;
  assert.equal(shiftedPaste.commandId, "paste-shortcut");
  assert.equal(shiftedPaste.shortcut, "Ctrl+Shift+V");

  const metaPaste = events[7].payload;
  assert.equal(metaPaste.commandId, "paste-shortcut");
  assert.equal(metaPaste.shortcut, "Cmd+V");
  assert.equal(metaPaste.metaKey, true);

  const ctrlEnter = events[8].payload;
  assert.equal(ctrlEnter.commandId, "enter-navigation");
  assert.equal(ctrlEnter.shortcut, "Ctrl+Enter");

  const ctrlZ = events[9].payload;
  assert.equal(ctrlZ.key, "z");
  assert.equal(ctrlZ.code, "KeyZ");
  assert.equal(ctrlZ.commandLike, true);
  assert.equal(ctrlZ.commandId, undefined);
  assert.equal(ctrlZ.shortcut, "Ctrl+Z");
  assert.equal(ctrlZ.keyCategory, "command");

  assert.equal(events[10].payload.key, undefined);
  assert.equal(events[10].payload.commandLike, false);
  assert.equal(events[10].payload.keyCategory, "content-like");
  assert.equal(events[11].payload.key, undefined);
  assert.equal(events[11].payload.commandLike, false);
  assert.equal(events[11].payload.keyCategory, "content-like");

  assert.equal(events[12].payload.key, "Enter");
  assert.equal(events[12].payload.commandLike, false);
  assert.equal(events[12].payload.keyCategory, "non-printable");
});

test("modifier-only keys keep their identity without becoming commands", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name" });

  for (const key of ["Shift", "Control", "Meta", "Alt"]) {
    documentHub.emit("keydown", {
      target: input,
      ...createKeyboardEvent({ key, code: `${key}Left` })
    });
  }

  const events = tracker.getEvents();

  for (const [index, key] of ["Shift", "Control", "Meta", "Alt"].entries()) {
    const payload = events[index].payload;
    assert.equal(payload.key, key);
    assert.equal(payload.code, `${key}Left`);
    assert.equal(payload.commandLike, false);
    assert.equal(payload.keyCategory, "non-printable");
    assert.equal(payload.shortcut, undefined);
    assert.equal(payload.commandId, undefined);
  }
});

test("keyup keeps command classification for modifier shortcuts", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name" });

  documentHub.emit("keyup", {
    target: input,
    ...createKeyboardEvent({ key: "s", code: "KeyS", ctrlKey: true })
  });

  const [event] = tracker.getEvents();
  assert.equal(event.type, "keyup");
  assert.equal(event.payload.key, "s");
  assert.equal(event.payload.code, "KeyS");
  assert.equal(event.payload.commandLike, true);
  assert.equal(event.payload.keyCategory, "command");
  assert.equal(event.payload.shortcut, "Ctrl+S");
  assert.equal(event.payload.commandId, undefined);
});

test("keyboard events without standard fields fall back to safe defaults", () => {
  const { tracker, documentHub } = createStartedTracker();

  documentHub.emit("keydown", { target: createElement({ fieldId: "name" }) });

  const [event] = tracker.getEvents();
  assert.equal(event.payload.key, undefined);
  assert.equal(event.payload.code, undefined);
  assert.equal(event.payload.ctrlKey, false);
  assert.equal(event.payload.metaKey, false);
  assert.equal(event.payload.altKey, false);
  assert.equal(event.payload.shiftKey, false);
  assert.equal(event.payload.repeat, false);
  assert.equal(event.payload.isComposing, false);
  assert.equal(event.payload.commandLike, false);
  assert.equal(event.payload.keyCategory, "content-like");
});

test("AltGraph modifier state redacts printable text even without Ctrl or Alt", () => {
  const { tracker, documentHub } = createStartedTracker();
  const input = createElement({ fieldId: "name" });

  documentHub.emit("keydown", {
    target: input,
    ...createKeyboardEvent({ key: "€", code: "KeyE", getModifierState: isAltGraphModifier })
  });
  documentHub.emit("keyup", {
    target: input,
    ...createKeyboardEvent({ key: "€", code: "KeyE", getModifierState: isAltGraphModifier })
  });

  const events = tracker.getEvents();
  assert.equal(events.length, 2);

  for (const event of events) {
    assert.equal(event.payload.commandLike, false);
    assert.equal(event.payload.keyCategory, "content-like");
    assert.equal(event.payload.key, undefined);
    assert.equal(event.payload.code, undefined);
    assert.equal(event.payload.shortcut, undefined);
  }
});

test("Enter defaults to literal input for textareas and contenteditable controls", () => {
  const definition = {
    formId: "custom",
    fields: [
      { fieldId: "single", order: 1, fieldKind: "text" },
      { fieldId: "multiline", order: 2, fieldKind: "text" },
      { fieldId: "editable", order: 3, fieldKind: "text" }
    ]
  };
  const { tracker, documentHub } = createStartedTracker({}, definition);
  const single = createElement({ formId: "custom", fieldId: "single" });
  const multiline = createElement({
    formId: "custom",
    fieldId: "multiline",
    tagName: "textarea"
  });
  const editable = createElement({
    formId: "custom",
    fieldId: "editable",
    tagName: "div",
    type: null,
    isContentEditable: true
  });

  for (const target of [single, multiline, editable]) {
    documentHub.emit("keydown", {
      target,
      ...createKeyboardEvent({ key: "Enter", code: "Enter" })
    });
  }

  const [singleEnter, multilineEnter, editableEnter] = tracker.getEvents();
  assert.equal(singleEnter.payload.commandLike, true);
  assert.equal(singleEnter.payload.commandId, "enter-navigation");

  for (const event of [multilineEnter, editableEnter]) {
    assert.equal(event.payload.key, "Enter");
    assert.equal(event.payload.commandLike, false);
    assert.equal(event.payload.keyCategory, "non-printable");
    assert.equal(event.payload.commandId, undefined);
  }
});
