import { createHash } from 'node:crypto'
import { createError } from 'h3'
import type { PoolClient } from '@input-analyzer/datastore'
import type { Trial } from '@server/utils/study'
import type { EventBatch } from '@server/validation/event-batch'
import { eventBatchSchema } from '@server/validation/event-batch'

type TrialEvent = EventBatch['events'][number]
type TerminalStatus = 'completed' | 'aborted'

interface StoredBatch {
  trial_id: string
  content_hash: string
  event_count: number
}

interface StoredSubmission {
  ts: number
}

function stringifyCanonical(value: unknown): string {
  if (Array.isArray(value)) {
    const entries: string[] = []
    for (const item of value) {
      entries.push(stringifyCanonical(item))
    }

    return `[${entries.join(',')}]`
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const entries: string[] = []
    const keys = Object.keys(record).sort()

    for (const key of keys) {
      entries.push(`${JSON.stringify(key)}:${stringifyCanonical(record[key])}`)
    }

    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}

export function parseEventBatch(value: unknown): EventBatch {
  const parsed = eventBatchSchema.safeParse(value)
  if (!parsed.success) {
    throw createError({ status: 400, message: 'Dávka neodpovídá datovému kontraktu v1.' })
  }

  return parsed.data
}

function validateEventIdentity(
  event: TrialEvent,
  trial: Trial,
  expectedSequence: number,
  previousTimestamp: number,
): void {
  const hasExpectedIdentity = event.sessionId === trial.session_id && event.pageId === trial.page_id
  const hasExpectedOrder = event.sequence === expectedSequence + 1 && event.ts >= previousTimestamp

  if (!hasExpectedIdentity || !hasExpectedOrder) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Nesouhlasí identita, pořadí nebo čas událostí.',
    })
  }
}

function validateStartEvent(event: TrialEvent): void {
  const isFirstEvent = event.sequence === 1
  const isStartEvent = event.type === 'trial.started'

  if (isFirstEvent !== isStartEvent) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatný začátek měření.' })
  }
}

function validateEventReferences(event: TrialEvent, knownFields: string[]): void {
  if (event.formId && event.formId !== 'service-request') {
    throw createError({ statusCode: 400 })
  }

  if (event.fieldId && !knownFields.includes(event.fieldId)) {
    throw createError({ statusCode: 400, message: 'Pole není součástí tohoto zadání.' })
  }

  if (event.source !== 'browser') {
    return
  }

  if (event.payload.relatedFieldId && !knownFields.includes(event.payload.relatedFieldId)) {
    throw createError({ statusCode: 400, message: 'Související pole není součástí zadání.' })
  }

  if (event.payload.relatedFormId && event.payload.relatedFormId !== 'service-request') {
    throw createError({ statusCode: 400 })
  }
}

function isTerminalEvent(event: TrialEvent): boolean {
  return event.type === 'trial.completed' || event.type === 'trial.aborted'
}

function validateTerminalEventPosition(
  event: TrialEvent,
  index: number,
  events: EventBatch['events'],
  terminal: TerminalStatus | undefined,
): void {
  const isLastEvent = index === events.length - 1
  const expectedType = `trial.${terminal}`

  if (!isLastEvent || event.type !== expectedType) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatné ukončení měření.' })
  }
}

function validateKeyboardPrivacy(event: TrialEvent): void {
  const isBrowserKeyboardEvent =
    event.source === 'browser' && (event.type === 'keydown' || event.type === 'keyup')

  if (!isBrowserKeyboardEvent) {
    return
  }

  const key = event.payload.key
  if (typeof key !== 'string' || key.length !== 1) {
    return
  }

  const isExplicitCommand =
    event.payload.commandLike === true &&
    event.payload.ctrlKey === true &&
    event.payload.altKey === true

  if (!isExplicitCommand) {
    throw createError({ statusCode: 400, statusMessage: 'Událost obsahuje nepovolený znak.' })
  }
}

async function findSubmission(
  client: PoolClient,
  trialId: string,
  batch: EventBatch,
  completedEvent: Extract<TrialEvent, { type: 'trial.completed' }>,
): Promise<StoredSubmission | undefined> {
  for (const event of batch.events) {
    const isMatchingSubmission =
      event.type === 'submit.attempted' &&
      event.payload.attemptId === completedEvent.payload.attemptId

    if (isMatchingSubmission) {
      return { ts: event.ts }
    }
  }

  const previousSubmission = await client.query<StoredSubmission>(
    "SELECT ts_ms AS ts FROM raw.events WHERE trial_id=$1 AND type='submit.attempted' AND payload->>'attemptId'=$2",
    [trialId, completedEvent.payload.attemptId],
  )

  return previousSubmission.rows[0]
}

async function validateCompletedSubmission(
  client: PoolClient,
  trial: Trial,
  batch: EventBatch,
): Promise<void> {
  const completedEvent = batch.events[batch.events.length - 1]
  if (!completedEvent || completedEvent.type !== 'trial.completed') {
    throw createError({ statusCode: 400, statusMessage: 'Chybí ukončovací událost.' })
  }

  const submission = await findSubmission(client, trial.id, batch, completedEvent)
  const hasMatchingSubmission =
    submission !== undefined &&
    submission.ts === completedEvent.payload.submitTs &&
    submission.ts <= completedEvent.ts

  if (!hasMatchingSubmission) {
    throw createError({ statusCode: 400, statusMessage: 'Chybí odpovídající odeslání.' })
  }
}

async function insertEvents(
  client: PoolClient,
  trialId: string,
  batchId: string,
  events: EventBatch['events'],
): Promise<void> {
  for (const event of events) {
    await client.query(
      'INSERT INTO raw.events(event_id,trial_id,batch_id,page_id,sequence,ts_ms,wall_time,source,type,form_id,field_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [
        event.eventId,
        trialId,
        batchId,
        event.pageId,
        event.sequence,
        event.ts,
        event.wallTime ?? null,
        event.source,
        event.type,
        event.formId ?? null,
        event.fieldId ?? null,
        event.payload,
      ],
    )
  }
}

export async function ingestBatch(
  client: PoolClient,
  trial: Trial,
  batch: EventBatch,
  terminal?: TerminalStatus,
): Promise<{ batchId: string; accepted: number }> {
  if (batch.trialId !== trial.id) {
    throw createError({ statusCode: 409, statusMessage: 'Dávka patří jinému pokusu.' })
  }

  const hash = createHash('sha256')
  hash.update(stringifyCanonical(batch))
  const digest = hash.digest('hex')

  const duplicate = await client.query<StoredBatch>(
    'SELECT trial_id,content_hash,event_count FROM raw.batches WHERE id=$1',
    [batch.batchId],
  )
  const storedBatch = duplicate.rows[0]

  if (storedBatch) {
    const isSameBatch = storedBatch.trial_id === trial.id && storedBatch.content_hash === digest

    if (!isSameBatch) {
      throw createError({ statusCode: 409, statusMessage: 'Konflikt identifikátoru dávky.' })
    }

    return { batchId: batch.batchId, accepted: storedBatch.event_count }
  }

  if (trial.status !== 'running') {
    throw createError({ statusCode: 409, statusMessage: 'Pokus není aktivní.' })
  }

  const previous = await client.query<{ sequence: number; ts_ms: number }>(
    'SELECT sequence,ts_ms FROM raw.events WHERE trial_id=$1 ORDER BY sequence DESC LIMIT 1',
    [trial.id],
  )
  const previousEvent = previous.rows[0]

  let sequence = previousEvent?.sequence ?? 0
  let timestamp = previousEvent?.ts_ms ?? 0
  let terminalCount = 0
  const knownFields = Object.keys(trial.scenario.values)

  for (const [index, event] of batch.events.entries()) {
    validateEventIdentity(event, trial, sequence, timestamp)
    validateStartEvent(event)
    validateEventReferences(event, knownFields)

    if (isTerminalEvent(event)) {
      terminalCount += 1
      validateTerminalEventPosition(event, index, batch.events, terminal)
    }

    validateKeyboardPrivacy(event)

    sequence = event.sequence
    timestamp = event.ts
  }

  if (terminal && terminalCount !== 1) {
    throw createError({ statusCode: 400, statusMessage: 'Chybí ukončovací událost.' })
  }

  if (terminal === 'completed') {
    await validateCompletedSubmission(client, trial, batch)
  }

  await client.query(
    'INSERT INTO raw.batches(id,trial_id,content_hash,event_count) VALUES($1,$2,$3,$4)',
    [batch.batchId, trial.id, digest, batch.events.length],
  )

  await insertEvents(client, trial.id, batch.batchId, batch.events)

  if (terminal) {
    await client.query(
      'UPDATE raw.trials SET status=$2,ended_at=now(),final_sequence=$3 WHERE id=$1',
      [trial.id, terminal, sequence],
    )
  }

  return { batchId: batch.batchId, accepted: batch.events.length }
}
