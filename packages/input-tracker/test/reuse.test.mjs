import test from "node:test";
import assert from "node:assert/strict";
import { createInputTracker } from "../dist/index.js";
import { MockEventHub, createElement } from "./helpers.mjs";

test("independent catalog and feedback forms share field names without merging their context", () => {
  const documentHub = new MockEventHub();
  const windowHub = new MockEventHub();
  const tracker = createInputTracker({ document: documentHub, window: windowHub });
  tracker.registerForm({
    formId: "catalog-search",
    fields: [
      { fieldId: "query", order: 1, fieldKind: "search" },
      { fieldId: "category", order: 2, fieldKind: "select" }
    ]
  });
  tracker.registerForm({
    formId: "feedback",
    fields: [{ fieldId: "query", order: 1, fieldKind: "textarea" }]
  });
  tracker.start();

  const search = createElement({
    formId: "catalog-search",
    fieldId: "query",
    value: "private search"
  });
  const feedback = createElement({
    formId: "feedback",
    fieldId: "query",
    value: "private feedback"
  });
  documentHub.emit("input", { target: search, inputType: "insertText" });
  documentHub.emit("input", { target: feedback, inputType: "insertText" });
  tracker.emitAppEvent({
    formId: "catalog-search",
    type: "catalog.filtered",
    payload: { resultCount: 4 }
  });
  tracker.stop();

  const snapshot = tracker.exportData();
  assert.equal(snapshot.forms.length, 2);
  assert.equal(snapshot.events[0].formId, "catalog-search");
  assert.equal(snapshot.events[1].formId, "feedback");
  assert.equal(snapshot.events[0].payload.fieldKind, "search");
  assert.equal(snapshot.events[1].payload.fieldKind, "textarea");
  assert.equal(snapshot.events[2].type, "catalog.filtered");
  assert.deepEqual(snapshot.events[2].payload, { resultCount: 4 });
  const encoded = JSON.stringify(snapshot);
  assert.equal(encoded.includes("private search"), false);
  assert.equal(encoded.includes("private feedback"), false);
});
