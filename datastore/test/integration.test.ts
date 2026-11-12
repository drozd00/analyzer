import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { IngestAck, SessionResponse, Trial } from '@server/utils/study'
import type { EventBatch } from '@server/validation/event-batch'

type StoredSession = Omit<SessionResponse, 'trials'> & {
  trials: (Trial & { final_sequence: number | null })[]
}

const datastoreUrl = process.env.TEST_DATASTORE_URL

function readSessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  assert.ok(setCookie)
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Strict/i)
  const sessionCookie = setCookie.split(';', 1)[0]
  assert.ok(sessionCookie)
  return sessionCookie
}

test(
  'HTTP sessions and event batches persist across close and resume',
  {
    skip: !datastoreUrl && 'Set TEST_DATASTORE_URL to a disposable preflight datastore or app.',
    timeout: 60_000,
  },
  async () => {
    assert.ok(datastoreUrl)
    let cookie: string | undefined

    async function requestJson<T>(path: string, expectedStatus: number, body?: unknown) {
      const url = new URL(path, datastoreUrl)
      const headers: Record<string, string> = {}
      if (cookie) {
        headers.Cookie = cookie
      }

      if (body !== undefined) {
        headers['Content-Type'] = 'application/json'
      }
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
        redirect: 'manual',
      })
      const text = await response.text()
      assert.equal(response.status, expectedStatus, `${path}: ${text}`)
      assert.match(response.headers.get('content-type') ?? '', /application\/json/)
      if (expectedStatus >= 400) {
        assert.doesNotMatch(
          text,
          /(?:SELECT\s|INSERT\s+INTO|UPDATE\s+raw\.|DELETE\s+FROM|postgres(?:ql)?:\/\/|node_modules\/pg)/i,
        )
        assert.doesNotMatch(text, /forbidden-raw-text/)
      }
      const result = JSON.parse(text) as T
      return { response, body: result }
    }

    const health = await requestJson<{ status: string; datasetKind: string }>('/api/health', 200)
    assert.equal(health.body.status, 'ok')
    assert.equal(
      health.body.datasetKind,
      'preflight',
      'Use a disposable preflight service for integration tests.',
    )

    const sessionId = randomUUID()
    const created = await requestJson<StoredSession>('/api/sessions', 200, { sessionId })
    cookie = readSessionCookie(created.response)
    assert.equal(cookie, `study-session=${sessionId}`)
    assert.equal(created.body.session.id, sessionId)
    assert.equal(created.body.session.dataset_kind, 'preflight')
    assert.equal(created.body.trials.length, 6)

    const current = await requestJson<StoredSession>('/api/sessions/current', 200)
    assert.equal(current.body.session.id, sessionId)
    assert.deepEqual(current.body.trials, created.body.trials)
    const trial = current.body.trials[0]
    assert.ok(trial)
    assert.equal(trial.status, 'ready')
    const pageId = `integration-${randomUUID()}`
    const trialPath = `/api/trials/${trial.id}`

    const started = await requestJson<{ started: boolean }>(`${trialPath}/start`, 200, { pageId })
    assert.equal(started.body.started, true)
    const startBatch: EventBatch = {
      schemaVersion: 1,
      batchId: randomUUID(),
      trialId: trial.id,
      events: [
        {
          schemaVersion: 1,
          eventId: `${pageId}:1`,
          sessionId,
          pageId,
          sequence: 1,
          ts: 0,
          source: 'app',
          type: 'trial.started',
          formId: 'service-request',
          payload: {},
        },
      ],
    }
    const accepted = await requestJson<IngestAck>(`${trialPath}/events`, 200, startBatch)
    assert.deepEqual(accepted.body, { batchId: startBatch.batchId, accepted: 1 })
    const repeated = await requestJson<IngestAck>(`${trialPath}/events`, 200, startBatch)
    assert.deepEqual(repeated.body, accepted.body)

    const conflictingBatch = structuredClone(startBatch)
    conflictingBatch.events[0]!.ts = 1
    const conflict = await requestJson<{ statusCode: number }>(
      `${trialPath}/events`,
      409,
      conflictingBatch,
    )
    assert.equal(conflict.body.statusCode, 409)

    const malformedBatch = {
      ...startBatch,
      batchId: randomUUID(),
      events: [{ ...startBatch.events[0]!, payload: { value: 'forbidden-raw-text' } }],
    }
    const invalid = await requestJson<{ statusCode: number }>(
      `${trialPath}/events`,
      400,
      malformedBatch,
    )
    assert.equal(invalid.body.statusCode, 400)

    const abortBatch: EventBatch = {
      schemaVersion: 1,
      batchId: randomUUID(),
      trialId: trial.id,
      events: [
        {
          schemaVersion: 1,
          eventId: `${pageId}:2`,
          sessionId,
          pageId,
          sequence: 2,
          ts: 5,
          source: 'app',
          type: 'trial.aborted',
          formId: 'service-request',
          payload: { reason: 'integration-test' },
        },
      ],
    }
    const aborted = await requestJson<IngestAck>(`${trialPath}/abort`, 200, { batch: abortBatch })
    assert.deepEqual(aborted.body, { batchId: abortBatch.batchId, accepted: 1 })
    const afterAbort = await requestJson<StoredSession>('/api/sessions/current', 200)
    assert.equal(afterAbort.body.trials[0]?.status, 'aborted')
    assert.equal(afterAbort.body.trials[0]?.page_id, pageId)
    assert.equal(afterAbort.body.trials[0]?.final_sequence, 2)

    const closed = await requestJson<{ closed: boolean }>('/api/sessions/close', 200, {})
    assert.equal(closed.body.closed, true)
    assert.match(closed.response.headers.get('set-cookie') ?? '', /^study-session=;/)
    assert.match(closed.response.headers.get('set-cookie') ?? '', /Max-Age=0/i)
    cookie = undefined
    await requestJson('/api/sessions/current', 404)

    const resumed = await requestJson<{ resumed: boolean }>('/api/sessions/resume', 200, {
      sessionId,
    })
    assert.equal(resumed.body.resumed, true)
    cookie = readSessionCookie(resumed.response)
    assert.equal(cookie, `study-session=${sessionId}`)
    const restored = await requestJson<StoredSession>('/api/sessions/current', 200)
    assert.deepEqual(restored.body, afterAbort.body)

    // A retry remains idempotent after the trial has entered a terminal state.
    const repeatedAbort = await requestJson<IngestAck>(`${trialPath}/abort`, 200, {
      batch: abortBatch,
    })
    assert.deepEqual(repeatedAbort.body, aborted.body)
  },
)
