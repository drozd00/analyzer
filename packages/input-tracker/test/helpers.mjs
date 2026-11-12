import { createInputTracker } from "../dist/index.js";

export function createFormDefinition() {
  return {
    formId: "signup-form",
    fields: [
      { fieldId: "name", order: 1, fieldKind: "text", shortcuts: { enterIsCommand: true } },
      { fieldId: "email", order: 2, fieldKind: "email", shortcuts: { enterIsCommand: true } },
      { fieldId: "notes", order: 3, fieldKind: "textarea", shortcuts: { enterIsCommand: false } },
      {
        fieldId: "zip",
        order: 4,
        fieldKind: "text",
        shortcuts: { enterIsCommand: true, pasteIsCommand: true }
      }
    ]
  };
}

export function createEvent({
  eventId,
  ts,
  type,
  fieldId,
  formId = "signup-form",
  source = "browser",
  payload = {}
}) {
  return {
    eventId: eventId ?? `${type}-${ts}`,
    sessionId: "session-1",
    pageId: "page-1",
    ts,
    wallTime: new Date(0).toISOString(),
    source,
    formId,
    fieldId,
    type,
    payload
  };
}

export function createKeyboardEvent(overrides = {}) {
  return {
    key: "",
    code: undefined,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    ...overrides
  };
}

export class MockEventHub {
  constructor() {
    this.listeners = new Map();
    this.registrations = new Map();
    this.visibilityState = "visible";
  }

  addEventListener(type, listener, options) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);

    const registrations = this.registrations.get(type) ?? [];
    registrations.push({ listener, options });
    this.registrations.set(type, registrations);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener)
    );

    const registrations = this.registrations.get(type) ?? [];
    this.registrations.set(
      type,
      registrations.filter((registration) => registration.listener !== listener)
    );
  }

  getListenerCount(type) {
    const listeners = this.listeners.get(type) ?? [];
    return listeners.length;
  }

  get totalListenerCount() {
    let total = 0;

    for (const listeners of this.listeners.values()) {
      total += listeners.length;
    }

    return total;
  }

  emit(type, event = {}) {
    const listeners = this.listeners.get(type) ?? [];
    const payload = {
      type,
      defaultPrevented: false,
      ...event
    };

    for (const listener of listeners) {
      listener(payload);
    }
  }
}

/**
 * Creates a DOM-like control for black-box tracker tests.
 *
 * `null` explicitly disables an otherwise defaulted attribute so tests can
 * exercise closest-form lookup, field-only targets, and custom resolvers.
 */
export function createElement({
  fieldId,
  formId = "signup-form",
  closestFormId,
  closestForm = true,
  closestFormNode,
  tagName = "input",
  type = "text",
  value = "",
  checked,
  selectionStart,
  selectionEnd,
  textContent,
  isContentEditable = false,
  selectedOptions,
  selectedValues,
  name,
  id,
  attributes = {},
  dataset = {}
} = {}) {
  const resolvedFieldId = fieldId ?? undefined;
  const resolvedFormId = formId ?? undefined;
  const resolvedType = type ?? undefined;
  const attributeMap = { ...attributes };
  const datasetMap = { ...dataset };
  let resolvedClosestFormId;

  if (closestFormId === undefined) {
    resolvedClosestFormId = resolvedFormId;
  } else {
    resolvedClosestFormId = closestFormId ?? undefined;
  }

  if (resolvedFieldId !== undefined) {
    attributeMap["data-track-field-id"] = resolvedFieldId;
    datasetMap.trackFieldId = resolvedFieldId;
  }

  if (resolvedFormId !== undefined) {
    attributeMap["data-track-form-id"] = resolvedFormId;
    datasetMap.trackFormId = resolvedFormId;
  }

  if (resolvedType !== undefined) {
    attributeMap.type = resolvedType;
  }

  if (name !== undefined) {
    attributeMap.name = name;
  }

  if (id !== undefined) {
    attributeMap.id = id;
  }

  const defaultFormNode = {
    dataset: resolvedClosestFormId !== undefined ? { trackFormId: resolvedClosestFormId } : {},
    getAttribute(attributeName) {
      if (attributeName === "data-track-form-id") {
        return resolvedClosestFormId;
      }

      if (attributeName === "id") {
        return resolvedClosestFormId;
      }

      return undefined;
    }
  };

  return {
    dataset: datasetMap,
    tagName: tagName.toUpperCase(),
    type: resolvedType,
    value: value ?? undefined,
    checked,
    selectionStart,
    selectionEnd,
    textContent,
    isContentEditable,
    selectedOptions,
    selectedValues,
    name,
    id,
    getAttribute(attributeName) {
      return attributeMap[attributeName];
    },
    closest(selector) {
      if (selector === "form" && closestForm) {
        return closestFormNode ?? defaultFormNode;
      }

      return undefined;
    }
  };
}

/**
 * Starts a tracker wired to fresh mock document and window hubs.
 */
export function createStartedTracker(options = {}, definition = createFormDefinition()) {
  const documentHub = options.document ?? new MockEventHub();
  const windowHub = options.window ?? new MockEventHub();
  const tracker = createInputTracker({ document: documentHub, window: windowHub, ...options });

  if (definition) {
    tracker.registerForm(definition);
  }

  tracker.start();

  return { tracker, documentHub, windowHub };
}
