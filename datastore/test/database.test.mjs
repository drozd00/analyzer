import assert from 'node:assert/strict'
import test from 'node:test'
import { createDatabase, runTransaction } from '../index.mjs'

function createTransactionHarness(failures = new Map()) {
  const calls = []
  const client = {
    async query(sql) {
      calls.push(sql)
      if (failures.has(sql)) {
        throw failures.get(sql)
      }

      return { rows: [{ id: 'saved-row' }] }
    },
    release(discard) {
      calls.push({ release: discard })
    },
  }
  const database = {
    async connect() {
      calls.push('connect')
      return client
    },
  }
  return { calls, client, database }
}

test('creating a database pool is lazy and supplies bounded defaults', async () => {
  const database = createDatabase({ connectionString: 'postgresql://unused.invalid/study' })
  try {
    assert.equal(database.totalCount, 0)
    assert.equal(database.idleCount, 0)
    assert.equal(database.waitingCount, 0)
    assert.equal(database.options.max, 5)
    assert.equal(database.options.connectionTimeoutMillis, 5000)
  } finally {
    await database.end()
  }
})

test('database configuration accepts explicit pool limits', async () => {
  const database = createDatabase({
    connectionString: 'postgresql://unused.invalid/study',
    max: 2,
    connectionTimeoutMillis: 1000,
    application_name: 'datastore-test',
  })
  try {
    assert.equal(database.options.max, 2)
    assert.equal(database.options.connectionTimeoutMillis, 1000)
    assert.equal(database.options.application_name, 'datastore-test')
  } finally {
    await database.end()
  }
})

test('database configuration rejects missing or empty connection strings', () => {
  for (const options of [undefined, {}, { connectionString: '' }, { connectionString: ' \n ' }]) {
    assert.throws(() => createDatabase(options), /PostgreSQL connection string is required/)
  }
})

test('a transaction returns the action result after committing and releases its connection', async () => {
  const harness = createTransactionHarness()
  const expected = { saved: true }
  const result = await runTransaction(harness.database, async (client) => {
    assert.equal(client, harness.client)
    await client.query('INSERT observation')
    return expected
  })
  assert.equal(result, expected)
  assert.deepEqual(harness.calls, [
    'connect',
    'BEGIN',
    'INSERT observation',
    'COMMIT',
    { release: false },
  ])
})

test('an action failure rolls back, preserves the original error, and releases its connection', async () => {
  const failure = new Error('observation rejected')
  const harness = createTransactionHarness()
  await assert.rejects(
    runTransaction(harness.database, async (client) => {
      await client.query('INSERT observation')
      throw failure
    }),
    (error) => error === failure,
  )
  assert.deepEqual(harness.calls, [
    'connect',
    'BEGIN',
    'INSERT observation',
    'ROLLBACK',
    { release: false },
  ])
})

test('a commit failure rolls back and does not return a successful action result', async () => {
  const failure = new Error('commit failed')
  const harness = createTransactionHarness(new Map([['COMMIT', failure]]))
  await assert.rejects(
    runTransaction(harness.database, async () => 'must not be returned'),
    (error) => error === failure,
  )
  assert.deepEqual(harness.calls, ['connect', 'BEGIN', 'COMMIT', 'ROLLBACK', { release: false }])
})

test('a begin failure skips the action and releases its connection after rollback', async () => {
  const failure = new Error('begin failed')
  const harness = createTransactionHarness(new Map([['BEGIN', failure]]))
  await assert.rejects(
    runTransaction(harness.database, async () => assert.fail('action must not run')),
    (error) => error === failure,
  )
  assert.deepEqual(harness.calls, ['connect', 'BEGIN', 'ROLLBACK', { release: false }])
})

test('a connection failure skips the action and propagates unchanged', async () => {
  const failure = new Error('database unavailable')
  const database = {
    async connect() {
      throw failure
    },
  }
  await assert.rejects(
    runTransaction(database, async () => assert.fail('action must not run')),
    (error) => error === failure,
  )
})

test('a rollback failure preserves both errors and discards the broken connection', async () => {
  const failure = new Error('observation rejected')
  const rollbackFailure = new Error('connection lost during rollback')
  const harness = createTransactionHarness(new Map([['ROLLBACK', rollbackFailure]]))
  await assert.rejects(
    runTransaction(harness.database, async () => {
      throw failure
    }),
    (error) => {
      assert.ok(error instanceof AggregateError)
      assert.equal(error.cause, failure)
      assert.deepEqual(error.errors, [failure, rollbackFailure])
      return true
    },
  )
  assert.deepEqual(harness.calls, ['connect', 'BEGIN', 'ROLLBACK', { release: true }])
})
