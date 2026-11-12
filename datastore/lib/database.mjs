import { Pool } from 'pg'

/** Create a pool without opening a connection until the first query. */
export function createDatabase(options) {
  const connectionString = options?.connectionString

  if (typeof connectionString !== 'string' || connectionString.trim() === '') {
    throw new Error('A PostgreSQL connection string is required.')
  }

  return new Pool({ max: 5, connectionTimeoutMillis: 5000, ...options })
}

/** Commit an action atomically and always release its checked-out connection. */
export async function runTransaction(database, action) {
  const client = await database.connect()
  let discardClient = false

  try {
    await client.query('BEGIN')
    const result = await action(client)
    await client.query('COMMIT')

    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      discardClient = true
      // oxlint-disable-next-line preserve-caught-error -- Both errors are retained; the original failure stays the primary cause.
      throw new AggregateError([error, rollbackError], 'Transaction rollback failed.', {
        cause: error,
      })
    }

    throw error
  } finally {
    client.release(discardClient)
  }
}
