import { createError, defineEventHandler } from 'h3'
import { getDatabase } from '@server/utils/database'
import { requireStudySession } from '@server/utils/requests'

export default defineEventHandler(async (event) => {
  const id = requireStudySession(event)
  const database = getDatabase()

  const session = await database.query('SELECT * FROM raw.sessions WHERE id=$1', [id])
  if (!session.rows[0]) {
    throw createError({ statusCode: 404 })
  }

  const trials = await database.query(
    'SELECT * FROM raw.trials WHERE session_id=$1 ORDER BY ordinal',
    [id],
  )

  return { session: session.rows[0], trials: trials.rows }
})
