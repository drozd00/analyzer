import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { runMigrations } from '../lib/run-migrations.mjs'

const LOCK_SQL = 'SELECT pg_advisory_lock($1)'
const UNLOCK_SQL = 'SELECT pg_advisory_unlock($1)'
const READ_HISTORY_SQL = 'SELECT sha256 FROM public.schema_migrations WHERE name=$1'
const WRITE_HISTORY_SQL = 'INSERT INTO public.schema_migrations(name,sha256) VALUES ($1,$2)'

function createDatabaseState() {
  return { history: new Map(), appliedSql: [] }
}

function createClient(state = createDatabaseState(), failures = new Map()) {
  const operations = []
  let transaction

  async function connect() {
    operations.push({ sql: 'CONNECT', values: [] })
    if (failures.has('CONNECT')) {
      throw failures.get('CONNECT')
    }
  }

  async function query(sql, values = []) {
    const trimmedSql = sql.trim()
    const statement = trimmedSql.replace(/\s+/g, ' ')
    operations.push({ sql: statement, values })
    if (failures.has(statement)) {
      throw failures.get(statement)
    }

    if (statement === 'BEGIN') {
      assert.equal(transaction, undefined, 'transactions must not overlap')
      transaction = { history: new Map(state.history), appliedSql: [] }
    } else if (statement === 'COMMIT') {
      assert.ok(transaction, 'commit requires a transaction')
      state.history = transaction.history
      state.appliedSql.push(...transaction.appliedSql)
      transaction = undefined
    } else if (statement === 'ROLLBACK') {
      assert.ok(transaction, 'rollback requires a transaction')
      transaction = undefined
    } else if (statement === READ_HISTORY_SQL) {
      const sha256 = state.history.get(values[0])
      return { rows: sha256 === undefined ? [] : [{ sha256 }] }
    } else if (statement === WRITE_HISTORY_SQL) {
      assert.ok(transaction, 'migration history must be written transactionally')
      transaction.history.set(values[0], values[1])
    } else if (
      statement !== LOCK_SQL &&
      statement !== UNLOCK_SQL &&
      !statement.startsWith('CREATE TABLE IF NOT EXISTS public.schema_migrations')
    ) {
      assert.ok(transaction, 'migration SQL must run transactionally')
      transaction.appliedSql.push(sql)
    }
    return { rows: [] }
  }

  async function end() {
    operations.push({ sql: 'END', values: [] })
    if (failures.has('END')) {
      throw failures.get('END')
    }
  }

  return { connect, query, end, operations, state }
}

async function createMigrationDirectory(context, files) {
  const directory = await mkdtemp(join(tmpdir(), 'datastore-migrations-'))
  context.after(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(directory, name), contents)
  }
  return pathToFileURL(`${directory}${sep}`)
}

function collectOperations(client) {
  const statements = []

  for (const operation of client.operations) {
    statements.push(operation.sql)
  }

  return statements
}

function calculateChecksum(sql) {
  const hash = createHash('sha256')
  hash.update(sql)
  return hash.digest('hex')
}

test('migrations run in filename order with transactional history under one advisory lock', async (context) => {
  const firstSql = 'CREATE TABLE first (id integer);\n'
  const secondSql = 'CREATE TABLE second (id integer);\n'
  const directory = await createMigrationDirectory(context, {
    '010_second.sql': secondSql,
    '001 first.sql': firstSql,
    'README.md': 'This is not a migration.',
  })
  await mkdir(new URL('005_directory.sql', directory))
  const client = createClient()
  const logs = []

  await runMigrations(client, { directory, log: (message) => logs.push(message) })

  assert.deepEqual(client.state.appliedSql, [firstSql, secondSql])
  assert.deepEqual(
    client.state.history,
    new Map([
      ['001 first.sql', calculateChecksum(firstSql)],
      ['010_second.sql', calculateChecksum(secondSql)],
    ]),
  )
  assert.deepEqual(logs, ['Applied: 001 first.sql', 'Applied: 010_second.sql'])
  const operations = collectOperations(client)
  assert.deepEqual(operations.slice(0, 2), ['CONNECT', LOCK_SQL])
  assert.deepEqual(operations.slice(3), [
    READ_HISTORY_SQL,
    'BEGIN',
    firstSql.trim(),
    WRITE_HISTORY_SQL,
    'COMMIT',
    READ_HISTORY_SQL,
    'BEGIN',
    secondSql.trim(),
    WRITE_HISTORY_SQL,
    'COMMIT',
    UNLOCK_SQL,
    'END',
  ])
  assert.deepEqual(client.operations[1].values, client.operations.at(-2).values)
  assert.equal(client.operations[1].values.length, 1)
})

test('a subsequent run skips identical migrations and applies only new files', async (context) => {
  const directory = await createMigrationDirectory(context, { '001_initial.sql': 'SELECT 1;\n' })
  const state = createDatabaseState()
  await runMigrations(createClient(state), { directory, log: () => {} })
  await writeFile(new URL('002_next.sql', directory), 'SELECT 2;\n')
  const client = createClient(state)
  const logs = []

  await runMigrations(client, { directory, log: (message) => logs.push(message) })

  assert.deepEqual(state.appliedSql, ['SELECT 1;\n', 'SELECT 2;\n'])
  assert.deepEqual(logs, ['Already applied: 001_initial.sql', 'Applied: 002_next.sql'])
  const operations = collectOperations(client)
  assert.equal(operations.filter((sql) => sql === 'BEGIN').length, 1)
  assert.equal(operations.includes('SELECT 1;'), false)
  assert.equal(state.history.size, 2)
})

test('changing an applied migration is rejected before any later migration runs', async (context) => {
  const directory = await createMigrationDirectory(context, { '001_initial.sql': 'SELECT 1;\n' })
  const state = createDatabaseState()
  await runMigrations(createClient(state), { directory, log: () => {} })
  await writeFile(new URL('001_initial.sql', directory), 'SELECT 1;\n\n')
  await writeFile(new URL('002_next.sql', directory), 'SELECT 2;\n')
  const client = createClient(state)

  await assert.rejects(
    runMigrations(client, { directory, log: () => {} }),
    /Applied migration changed: 001_initial\.sql/,
  )

  assert.deepEqual(state.appliedSql, ['SELECT 1;\n'])
  assert.equal(state.history.size, 1)
  const operations = collectOperations(client)
  assert.equal(operations.includes('BEGIN'), false)
  assert.deepEqual(operations.slice(-2), [UNLOCK_SQL, 'END'])
})

test('a failed migration rolls back and stops while retaining earlier committed migrations', async (context) => {
  const directory = await createMigrationDirectory(context, {
    '001_first.sql': 'SELECT 1;',
    '002_broken.sql': 'SELECT broken;',
    '003_later.sql': 'SELECT 3;',
  })
  const failure = new Error('Invalid SQL')
  const client = createClient(createDatabaseState(), new Map([['SELECT broken;', failure]]))

  await assert.rejects(
    runMigrations(client, { directory, log: () => {} }),
    (error) => error === failure,
  )

  assert.deepEqual(client.state.appliedSql, ['SELECT 1;'])
  assert.deepEqual([...client.state.history.keys()], ['001_first.sql'])
  const operations = collectOperations(client)
  assert.equal(operations.includes('SELECT 3;'), false)
  assert.deepEqual(operations.slice(-3), ['ROLLBACK', UNLOCK_SQL, 'END'])
})

test('migration SQL and its history both roll back when committing fails', async (context) => {
  const directory = await createMigrationDirectory(context, { '001_initial.sql': 'SELECT 1;' })
  const failure = new Error('Commit failed')
  const client = createClient(createDatabaseState(), new Map([['COMMIT', failure]]))

  await assert.rejects(
    runMigrations(client, { directory, log: () => {} }),
    (error) => error === failure,
  )

  assert.deepEqual(client.state.appliedSql, [])
  assert.equal(client.state.history.size, 0)
  const operations = collectOperations(client)
  assert.deepEqual(operations.slice(-5), [
    WRITE_HISTORY_SQL,
    'COMMIT',
    'ROLLBACK',
    UNLOCK_SQL,
    'END',
  ])
})

test('rollback and cleanup failures retain the original migration error and attempt all cleanup', async (context) => {
  const directory = await createMigrationDirectory(context, { '001_initial.sql': 'SELECT broken;' })
  const migrationError = new Error('Migration failed')
  const rollbackError = new Error('Rollback failed')
  const unlockError = new Error('Unlock failed')
  const closeError = new Error('Close failed')
  const failures = new Map([
    ['SELECT broken;', migrationError],
    ['ROLLBACK', rollbackError],
    [UNLOCK_SQL, unlockError],
    ['END', closeError],
  ])
  const client = createClient(createDatabaseState(), failures)

  await assert.rejects(runMigrations(client, { directory, log: () => {} }), (error) => {
    assert.ok(error instanceof AggregateError)
    assert.equal(error.errors.length, 3)
    const rollbackFailure = error.errors[0]
    assert.ok(rollbackFailure instanceof AggregateError)
    assert.equal(rollbackFailure.cause, migrationError)
    assert.deepEqual(rollbackFailure.errors, [migrationError, rollbackError])
    assert.equal(error.cause, rollbackFailure)
    assert.equal(error.errors[1], unlockError)
    assert.equal(error.errors[2], closeError)
    return true
  })

  const operations = collectOperations(client)
  assert.deepEqual(operations.slice(-3), ['ROLLBACK', UNLOCK_SQL, 'END'])
})

test('connection and lock failures close the client without releasing an unacquired lock', async (context) => {
  const directory = await createMigrationDirectory(context, {})
  for (const operation of ['CONNECT', LOCK_SQL]) {
    const failure = new Error(`${operation} failed`)
    const client = createClient(createDatabaseState(), new Map([[operation, failure]]))

    await assert.rejects(
      runMigrations(client, { directory, log: () => {} }),
      (error) => error === failure,
    )

    const operations = collectOperations(client)
    const expected = operation === 'CONNECT' ? ['CONNECT', 'END'] : ['CONNECT', LOCK_SQL, 'END']
    assert.deepEqual(operations, expected)
  }
})

test('cleanup errors are reported even when all migrations committed successfully', async (context) => {
  const directory = await createMigrationDirectory(context, { '001_initial.sql': 'SELECT 1;' })
  const failure = new Error('Unlock failed')
  const client = createClient(createDatabaseState(), new Map([[UNLOCK_SQL, failure]]))

  await assert.rejects(
    runMigrations(client, { directory, log: () => {} }),
    (error) => error === failure,
  )

  assert.deepEqual(client.state.appliedSql, ['SELECT 1;'])
  assert.equal(client.state.history.size, 1)
  const operations = collectOperations(client)
  assert.deepEqual(operations.slice(-2), [UNLOCK_SQL, 'END'])
})

test('bundled SQL matches filesystem checksums and skips already applied migrations', async (context) => {
  const firstSql = "SELECT 'Příliš žluťoučký';\r\n"
  const secondSql = 'SELECT 2;\n\n'
  const directory = await createMigrationDirectory(context, {
    '001_initial.sql': firstSql,
    '002_next.sql': secondSql,
  })
  const state = createDatabaseState()
  await runMigrations(createClient(state), { directory, log: () => {} })
  const client = createClient(state)
  const logs = []

  await runMigrations(client, {
    directory: new URL('missing/', directory),
    load: async () => [
      { name: '002_next.sql', sql: secondSql },
      { name: '001_initial.sql', sql: firstSql },
    ],
    log: (message) => logs.push(message),
  })

  assert.deepEqual(logs, ['Already applied: 001_initial.sql', 'Already applied: 002_next.sql'])
  assert.deepEqual(state.appliedSql, [firstSql, secondSql])
  assert.equal(collectOperations(client).includes('BEGIN'), false)
})

test('bundled migrations apply in filename order without reading a filesystem directory', async () => {
  const client = createClient()
  await runMigrations(client, {
    load: async () => [
      { name: '010_last.sql', sql: 'SELECT 10;' },
      { name: '002_first.sql', sql: 'SELECT 2;' },
    ],
    log: () => {},
  })
  assert.deepEqual(client.state.appliedSql, ['SELECT 2;', 'SELECT 10;'])
})

test('a failed bundled loader releases the migration lock and closes the connection', async () => {
  const client = createClient()
  const failure = new Error('Bundled SQL missing')
  await assert.rejects(
    runMigrations(client, {
      load: async () => {
        throw failure
      },
      log: () => {},
    }),
    (error) => error === failure,
  )
  assert.deepEqual(collectOperations(client).slice(-2), [UNLOCK_SQL, 'END'])
})

test('duplicate bundled migration names are rejected before any migration runs', async () => {
  const client = createClient()
  await assert.rejects(
    runMigrations(client, {
      load: async () => [
        { name: '001_initial.sql', sql: 'SELECT 1;' },
        { name: '001_initial.sql', sql: 'SELECT 2;' },
      ],
      log: () => {},
    }),
    /Duplicate migration/,
  )
  assert.equal(collectOperations(client).includes('BEGIN'), false)
  assert.deepEqual(collectOperations(client).slice(-2), [UNLOCK_SQL, 'END'])
})
