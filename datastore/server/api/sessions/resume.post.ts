import { createError, defineEventHandler } from 'h3'
import { getDatabase } from '@server/utils/database'
import { readBoundedBody, setStudySessionCookie } from '@server/utils/requests'
import { sessionRequestSchema } from '@server/validation/requests'

export default defineEventHandler(async (event) => {
  const body = await readBoundedBody(event, sessionRequestSchema)
  const sessionId = body.sessionId
  const database = getDatabase()

  const session = await database.query('SELECT id FROM raw.sessions WHERE id=$1', [sessionId])
  if (!session.rows[0]) {
    throw createError({ statusCode: 404, message: 'Relace nebyla nalezena.' })
  }

  setStudySessionCookie(event, sessionId)
  return { resumed: true }
})
