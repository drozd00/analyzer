import { loadMigrations, prepareMigrations } from './load-migrations.mjs'

const MIGRATION_LOCK_ID = 2026101201
const DEFAULT_DIRECTORY = new URL('../migrations/', import.meta.url)

async function loadMigrationSources(directory, load) {
  if (load) {
    const sources = await load()
    return prepareMigrations(sources)
  }

  return loadMigrations(directory)
}

async function releaseMigrationLock(client, errors) {
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID])
  } catch (error) {
    errors.push(error)
  }
}

async function closeMigrationClient(client, errors) {
  try {
    await client.end()
  } catch (error) {
    errors.push(error)
  }
}

function throwCollectedErrors(errors) {
  if (errors.length === 0) {
    return
  }

  if (errors.length === 1) {
    throw errors[0]
  }

  throw new AggregateError(errors, 'Migration runner encountered multiple errors.', {
    cause: errors[0],
  })
}

/** Apply migrations using a dedicated client, then release its lock and connection. */
export async function runMigrations(
  client,
  { directory = DEFAULT_DIRECTORY, load, log = console.log } = {},
) {
  const errors = []
  let locked = false

  try {
    await client.connect()
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID])
    locked = true

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        name text PRIMARY KEY,
        sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const migrations = await loadMigrationSources(directory, load)
    for (const migration of migrations) {
      const applied = await applyMigration(client, migration)

      if (applied) {
        log(`Applied: ${migration.name}`)
      } else {
        log(`Already applied: ${migration.name}`)
      }
    }
  } catch (error) {
    errors.push(error)
  }

  // Attempt both cleanup steps even if the migration or lock release failed.
  if (locked) {
    await releaseMigrationLock(client, errors)
  }

  await closeMigrationClient(client, errors)
  throwCollectedErrors(errors)
}

async function applyMigration(client, migration) {
  const previous = await client.query('SELECT sha256 FROM public.schema_migrations WHERE name=$1', [
    migration.name,
  ])
  const recorded = previous.rows[0]

  if (recorded) {
    if (recorded.sha256 !== migration.sha256) {
      throw new Error(`Applied migration changed: ${migration.name}. Add a new migration instead.`)
    }

    return false
  }

  await client.query('BEGIN')
  try {
    await client.query(migration.sql)
    await client.query('INSERT INTO public.schema_migrations(name,sha256) VALUES ($1,$2)', [
      migration.name,
      migration.sha256,
    ])
    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      // oxlint-disable-next-line preserve-caught-error -- Both errors are retained; the original failure stays the primary cause.
      throw new AggregateError(
        [error, rollbackError],
        `Migration rollback failed: ${migration.name}.`,
        { cause: error },
      )
    }

    throw error
  }

  return true
}
