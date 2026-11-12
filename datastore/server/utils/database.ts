import { createDatabase, runTransaction as runDatabaseTransaction } from '@datastore/index.mjs'
import type { Pool, PoolClient } from '@datastore/index.mjs'
import { createError } from 'h3'

let pool: Pool | undefined

export function getDatabase(): Pool {
  if (pool) {
    return pool
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw createError({ statusCode: 503, statusMessage: 'Databáze není nakonfigurována.' })
  }

  pool = createDatabase({ connectionString })
  return pool
}

export async function runTransaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const database = getDatabase()
  return runDatabaseTransaction(database, action)
}

export async function closeDatabase(): Promise<void> {
  const database = pool
  pool = undefined

  if (database) {
    await database.end()
  }
}
