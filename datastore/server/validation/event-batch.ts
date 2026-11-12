import { z } from 'zod'

/** Count Unicode code points, so astral characters use one character of the limit. */
function createTextSchema(minimum: number, maximum: number) {
  const text = z.string()
  return text.refine(
    (value) => {
      const length = Array.from(value).length
      return length >= minimum && length <= maximum
    },
    { message: 'Invalid text length.' },
  )
}

function createIntegerSchema(minimum = -Infinity, maximum = Infinity) {
  const number = z.number()
  return number.refine((value) => Number.isInteger(value) && value >= minimum && value <= maximum, {
    message: 'Invalid integer.',
  })
}

function createTimestampSchema() {
  const number = z.number()
  return number.refine((value) => value >= 0 && value <= 1_000_000_000_000, {
    message: 'Invalid timestamp.',
  })
}

const uuidText = z.string()
const uuidSchema = uuidText.regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
)
const identifierSchema = createTextSchema(1, 160)
const wallTimeText = z.string()
const wallTimeSchema = wallTimeText.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)

const browserPayloadObject = z.strictObject({
  valueLength: z.optional(createIntegerSchema(0)),
  lengthDelta: z.optional(createIntegerSchema()),
  checked: z.optional(z.boolean()),
  selectedCount: z.optional(createIntegerSchema(0)),
  elementTag: z.optional(createTextSchema(0, 64)),
  controlType: z.optional(createTextSchema(0, 64)),
  fieldKind: z.optional(createTextSchema(0, 64)),
  fieldPath: z.optional(createTextSchema(0, 160)),
  relatedFieldId: z.optional(identifierSchema),
  relatedFormId: z.optional(identifierSchema),
  selectionStart: z.optional(createIntegerSchema(0)),
  selectionEnd: z.optional(createIntegerSchema(0)),
  inputType: z.optional(createTextSchema(0, 80)),
  isComposing: z.optional(z.boolean()),
  ctrlKey: z.optional(z.boolean()),
  metaKey: z.optional(z.boolean()),
  shiftKey: z.optional(z.boolean()),
  altKey: z.optional(z.boolean()),
  repeat: z.optional(z.boolean()),
  commandLike: z.optional(z.boolean()),
  keyCategory: z.optional(z.enum(['command', 'non-printable', 'content-like'])),
  key: z.optional(createTextSchema(0, 40)),
  code: z.optional(createTextSchema(0, 40)),
  shortcut: z.optional(createTextSchema(0, 80)),
  commandId: z.optional(createTextSchema(0, 80)),
  pointerType: z.optional(z.enum(['', 'mouse', 'touch', 'pen'])),
  button: z.optional(createIntegerSchema()),
  clientX: z.optional(z.number()),
  clientY: z.optional(z.number()),
  defaultPrevented: z.optional(z.boolean()),
  visibilityState: z.optional(z.enum(['visible', 'hidden'])),
  persisted: z.optional(z.boolean()),
})

const browserPayloadSchema = browserPayloadObject.refine(
  (payload) => {
    if (payload.keyCategory !== 'content-like') {
      return true
    }

    return !('key' in payload) && !('code' in payload) && !('shortcut' in payload)
  },
  { message: 'Content-like keyboard events cannot contain key, code, or shortcut.' },
)

const eventShape = {
  schemaVersion: z.literal(1),
  eventId: identifierSchema,
  sessionId: uuidSchema,
  pageId: identifierSchema,
  sequence: createIntegerSchema(1, 2_147_483_647),
  ts: createTimestampSchema(),
  wallTime: z.optional(wallTimeSchema),
  formId: z.optional(identifierSchema),
  fieldId: z.optional(identifierSchema),
}

const browserEventSchema = z.strictObject({
  ...eventShape,
  source: z.literal('browser'),
  type: z.enum([
    'focusin',
    'focusout',
    'keydown',
    'keyup',
    'beforeinput',
    'input',
    'change',
    'compositionstart',
    'compositionend',
    'pointerdown',
    'pointerup',
    'click',
    'pointermove.sampled',
    'submit',
    'reset',
    'visibilitychange',
    'pagehide',
  ]),
  payload: browserPayloadSchema,
})

const startedEventSchema = z.strictObject({
  ...eventShape,
  source: z.literal('app'),
  type: z.literal('trial.started'),
  payload: z.strictObject({}),
})

const ruleIdsArray = z.array(identifierSchema)
const boundedRuleIds = ruleIdsArray.max(16)
const ruleIdsSchema = boundedRuleIds.refine(
  (values) => {
    const distinctValues = new Set(values)
    return distinctValues.size === values.length
  },
  { message: 'Rule identifiers must be unique.' },
)

const validationEventSchema = z.strictObject({
  ...eventShape,
  source: z.literal('app'),
  type: z.literal('validation.result'),
  fieldId: identifierSchema,
  payload: z.strictObject({
    trigger: z.enum(['blur', 'enter', 'submit']),
    valid: z.boolean(),
    ruleIds: ruleIdsSchema,
  }),
})

const submitEventSchema = z.strictObject({
  ...eventShape,
  source: z.literal('app'),
  type: z.enum(['submit.attempted', 'submit.rejected']),
  payload: z.strictObject({ attemptId: identifierSchema }),
})

const completedEventSchema = z.strictObject({
  ...eventShape,
  source: z.literal('app'),
  type: z.literal('trial.completed'),
  payload: z.strictObject({ attemptId: identifierSchema, submitTs: createTimestampSchema() }),
})

const abortedEventSchema = z.strictObject({
  ...eventShape,
  source: z.literal('app'),
  type: z.literal('trial.aborted'),
  payload: z.strictObject({ reason: createTextSchema(1, 80) }),
})

const eventSchema = z.union([
  browserEventSchema,
  startedEventSchema,
  validationEventSchema,
  submitEventSchema,
  completedEventSchema,
  abortedEventSchema,
])
const eventArray = z.array(eventSchema)
const nonemptyEvents = eventArray.min(1)
const boundedEvents = nonemptyEvents.max(200)

export const eventBatchSchema = z.strictObject({
  schemaVersion: z.literal(1),
  batchId: uuidSchema,
  trialId: uuidSchema,
  events: boundedEvents,
})

export type EventBatch = z.infer<typeof eventBatchSchema>
