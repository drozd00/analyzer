import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { H3 } from 'h3'
import { eventBatchSchema } from '@server/validation/event-batch'
import { sessionRequestSchema } from '@server/validation/requests'
import { parseEventBatch } from '@server/utils/ingest'
import { readBoundedBody } from '@server/utils/requests'

const fixturePath = new URL('./fixtures/event-batches.json', import.meta.url)
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  name: string
  valid: boolean
  batch: { events: Record<string, unknown>[] }
}[]
const baseline = fixtures[0]!.batch
const browserEvent = baseline.events[1]!
const appEvent = baseline.events[0]!

function createBatch(event: Record<string, unknown>) {
  return { ...baseline, events: [event] }
}

function verifyContract(value: unknown, expected: boolean, label: string) {
  const parsed = eventBatchSchema.safeParse(value)
  assert.equal(parsed.success, expected, `Zod: ${label}`)

  if (parsed.success) {
    assert.deepEqual(parsed.data, value, `Validation must preserve data: ${label}`)
  }
}

test('local event validation accepts metadata and rejects invalid or private content', () => {
  for (const fixture of fixtures) {
    verifyContract(fixture.batch, fixture.valid, fixture.name)
  }
})

test('batch and event boundaries remain strict without transforming valid data', () => {
  verifyContract({ ...baseline, events: [] }, false, 'empty batch')
  verifyContract({ ...baseline, events: Array(200).fill(browserEvent) }, true, '200 events')
  verifyContract({ ...baseline, events: Array(201).fill(browserEvent) }, false, '201 events')
  verifyContract(
    { ...baseline, batchId: '00000000-0000-0000-0000-000000000000' },
    true,
    'contract UUID pattern',
  )
  verifyContract({ ...baseline, trialId: 'not-a-uuid' }, false, 'invalid UUID')
  verifyContract(createBatch({ ...browserEvent, extra: 'forbidden' }), false, 'unknown event key')

  for (const field of ['eventId', 'pageId', 'formId', 'fieldId']) {
    verifyContract(createBatch({ ...browserEvent, [field]: '' }), false, `${field} empty`)
    verifyContract(
      createBatch({ ...browserEvent, [field]: '😀'.repeat(160) }),
      true,
      `${field} code points`,
    )
    verifyContract(
      createBatch({ ...browserEvent, [field]: '😀'.repeat(161) }),
      false,
      `${field} too long`,
    )
  }
  for (const [sequence, valid] of [
    [0, false],
    [1, true],
    [1.5, false],
    [2_147_483_647, true],
    [2_147_483_648, false],
  ] as const) {
    verifyContract(createBatch({ ...browserEvent, sequence }), valid, `sequence ${sequence}`)
  }
  for (const [ts, valid] of [
    [-1, false],
    [0, true],
    [1_000_000_000_000, true],
    [1_000_000_000_001, false],
    [Infinity, false],
    [NaN, false],
  ] as const) {
    verifyContract(createBatch({ ...browserEvent, ts }), valid, `timestamp ${ts}`)
  }
  verifyContract(
    createBatch({ ...browserEvent, wallTime: '2026-11-12T12:00:00.123Z' }),
    true,
    'wall clock pattern',
  )
  verifyContract(
    createBatch({ ...browserEvent, wallTime: '2026-11-12' }),
    false,
    'invalid wall clock pattern',
  )
})

test('browser payload metadata keeps its numeric, boolean, text, and privacy limits', () => {
  const integerFields = ['valueLength', 'selectedCount', 'selectionStart', 'selectionEnd']
  for (const field of integerFields) {
    for (const [value, valid] of [
      [0, true],
      [2 ** 60, true],
      [-1, false],
      [0.5, false],
    ] as const) {
      const event = { ...browserEvent, payload: { [field]: value } }
      verifyContract(createBatch(event), valid, `${field} ${value}`)
    }
  }
  for (const field of ['lengthDelta', 'button']) {
    verifyContract(
      createBatch({ ...browserEvent, payload: { [field]: -5 } }),
      true,
      `${field} signed integer`,
    )
    verifyContract(
      createBatch({ ...browserEvent, payload: { [field]: 0.5 } }),
      false,
      `${field} fraction`,
    )
  }
  for (const field of ['clientX', 'clientY']) {
    verifyContract(
      createBatch({ ...browserEvent, payload: { [field]: -0.5 } }),
      true,
      `${field} fraction`,
    )
    verifyContract(
      createBatch({ ...browserEvent, payload: { [field]: Infinity } }),
      false,
      `${field} infinite`,
    )
  }
  const booleanFields = [
    'checked',
    'isComposing',
    'ctrlKey',
    'metaKey',
    'shiftKey',
    'altKey',
    'repeat',
    'commandLike',
    'defaultPrevented',
    'persisted',
  ]
  for (const field of booleanFields) {
    verifyContract(
      createBatch({ ...browserEvent, payload: { [field]: false } }),
      true,
      `${field} boolean`,
    )
    verifyContract(
      createBatch({ ...browserEvent, payload: { [field]: 0 } }),
      false,
      `${field} number`,
    )
  }
  const textLimits: Record<string, number> = {
    elementTag: 64,
    controlType: 64,
    fieldKind: 64,
    fieldPath: 160,
    inputType: 80,
    key: 40,
    code: 40,
    shortcut: 80,
    commandId: 80,
  }
  for (const [field, limit] of Object.entries(textLimits)) {
    verifyContract(
      createBatch({ ...browserEvent, payload: { [field]: '' } }),
      true,
      `${field} empty metadata`,
    )
    verifyContract(
      createBatch({ ...browserEvent, payload: { [field]: '😀'.repeat(limit) } }),
      true,
      `${field} code point limit`,
    )
    verifyContract(
      createBatch({ ...browserEvent, payload: { [field]: '😀'.repeat(limit + 1) } }),
      false,
      `${field} overflow`,
    )
  }
  for (const field of ['key', 'code', 'shortcut']) {
    const payload = { keyCategory: 'content-like', [field]: '' }
    verifyContract(createBatch({ ...browserEvent, payload }), false, `${field} content leak`)
  }
  for (const field of ['value', 'text', 'data', 'clipboardData']) {
    verifyContract(
      createBatch({ ...browserEvent, payload: { [field]: 'forbidden-raw-text' } }),
      false,
      `${field} raw content`,
    )
  }
  verifyContract(
    createBatch({ ...browserEvent, payload: { pointerType: '' } }),
    true,
    'empty pointer type',
  )
  verifyContract(
    createBatch({ ...browserEvent, payload: { pointerType: 'trackpad' } }),
    false,
    'unknown pointer type',
  )
  verifyContract(
    createBatch({ ...browserEvent, payload: { visibilityState: 'prerender' } }),
    false,
    'unknown visibility state',
  )
  verifyContract(
    createBatch({ ...browserEvent, type: 'trial.started' }),
    false,
    'browser cannot emit application event',
  )
})

test('application event payloads enforce each required field and reject unknown properties', () => {
  const events = [
    { type: 'trial.started', payload: {} },
    {
      type: 'validation.result',
      fieldId: 'fullName',
      payload: { trigger: 'blur', valid: false, ruleIds: ['required'] },
    },
    { type: 'submit.attempted', payload: { attemptId: 'attempt-1' } },
    { type: 'submit.rejected', payload: { attemptId: 'attempt-1' } },
    { type: 'trial.completed', payload: { attemptId: 'attempt-1', submitTs: 0 } },
    { type: 'trial.aborted', payload: { reason: 'withdrawal' } },
  ]
  for (const event of events) {
    verifyContract(createBatch({ ...appEvent, ...event }), true, event.type)
    const payload = { ...event.payload, value: 'forbidden-raw-text' }
    verifyContract(
      createBatch({ ...appEvent, ...event, payload }),
      false,
      `${event.type} extra payload`,
    )
    for (const requiredField of Object.keys(event.payload)) {
      const incompletePayload: Record<string, unknown> = { ...event.payload }
      delete incompletePayload[requiredField]
      verifyContract(
        createBatch({ ...appEvent, ...event, payload: incompletePayload }),
        false,
        `${event.type} missing ${requiredField}`,
      )
    }
  }
  const validation = { ...appEvent, type: 'validation.result', fieldId: 'fullName' }
  verifyContract(
    createBatch({
      ...validation,
      payload: { trigger: 'blur', valid: false, ruleIds: ['required', 'required'] },
    }),
    false,
    'duplicate rule identifiers',
  )
  const ruleIds = Array.from({ length: 17 }, (_, index) => `rule-${index}`)
  verifyContract(
    createBatch({ ...validation, payload: { trigger: 'blur', valid: false, ruleIds } }),
    false,
    'too many rules',
  )
  verifyContract(
    createBatch({
      ...appEvent,
      type: 'validation.result',
      payload: { trigger: 'blur', valid: true, ruleIds: [] },
    }),
    false,
    'validation requires field',
  )
  verifyContract(
    createBatch({ ...appEvent, type: 'focusin' }),
    false,
    'application cannot emit browser event',
  )
  verifyContract(
    createBatch({ ...appEvent, type: 'trial.aborted', payload: { reason: '😀'.repeat(80) } }),
    true,
    'Unicode abort reason',
  )
})

test('invalid batch errors do not reveal payload content or Zod diagnostics', () => {
  const invalid = createBatch({ ...browserEvent, payload: { value: 'forbidden-raw-text' } })
  assert.throws(
    () => parseEventBatch(invalid),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.doesNotMatch(error.message, /forbidden-raw-text|ZodError/)
      assert.doesNotMatch(JSON.stringify(error), /forbidden-raw-text|invalid_union|issues/)
      return true
    },
  )
})

test('H3 reads JSON through Zod and preserves bounded-body error handling', async () => {
  const app = new H3()
  app.post('/', (event) => readBoundedBody(event, sessionRequestSchema))
  const sessionId = '00000000-0000-4000-8000-000000000001'
  const validRequest = new Request('http://localhost/', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  })
  const validResponse = await app.fetch(validRequest)
  assert.equal(validResponse.status, 200)
  assert.deepEqual(await validResponse.json(), { sessionId })

  const invalidBodies = [
    { body: '', status: 413 },
    { body: '{"secret":"forbidden-raw-text"', status: 400 },
    { body: '[]', status: 400 },
    { body: '{"sessionId":"forbidden-raw-text"}', status: 400 },
    { body: 'x'.repeat(512_001), status: 413 },
  ]
  for (const example of invalidBodies) {
    const request = new Request('http://localhost/', { method: 'POST', body: example.body })
    const response = await app.fetch(request)
    assert.equal(response.status, example.status)
    const responseBody = await response.text()
    assert.doesNotMatch(responseBody, /forbidden-raw-text|invalid_union|ZodError|issues/)
  }
})

test('the request size limit also rejects chunked bodies without Content-Length', async () => {
  const app = new H3()
  app.post('/', (event) => readBoundedBody(event, sessionRequestSchema))
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"sessionId":"'))
      controller.enqueue(encoder.encode('x'.repeat(512_001)))
      controller.enqueue(encoder.encode('"}'))
      controller.close()
    },
  })
  const options: RequestInit & { duplex: 'half' } = { method: 'POST', body, duplex: 'half' }
  const request = new Request('http://localhost/', options)
  assert.equal(request.headers.has('content-length'), false)
  const response = await app.fetch(request)
  assert.equal(response.status, 413)
})
