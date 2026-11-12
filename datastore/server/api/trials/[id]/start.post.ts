import { createError, defineEventHandler } from 'h3'
import { runTransaction } from '@server/utils/database'
import { lockTrial, readBoundedBody } from '@server/utils/requests'
import { startTrialRequestSchema } from '@server/validation/requests'

export default defineEventHandler(async (event) => {
  const body = await readBoundedBody(event, startTrialRequestSchema)

  return runTransaction(async (client) => {
    const trial = await lockTrial(event, client)
    const sessionResult = await client.query('SELECT * FROM raw.sessions WHERE id=$1', [
      trial.session_id,
    ])
    const session = sessionResult.rows[0]

    if (trial.status === 'running' && trial.page_id === body.pageId) {
      return { started: true, session }
    }

    if (trial.status !== 'ready') {
      throw createError({ statusCode: 409, message: 'Běh již byl zahájen.' })
    }

    const unfinished = await client.query(
      "SELECT id FROM raw.trials WHERE session_id=$1 AND ordinal<$2 AND status IN ('ready','running')",
      [trial.session_id, trial.ordinal],
    )
    if (unfinished.rowCount) {
      throw createError({ statusCode: 409, message: 'Nejprve dokončete předchozí běh.' })
    }

    await client.query(
      "UPDATE raw.trials SET status='running',page_id=$2,started_at=now() WHERE id=$1",
      [trial.id, body.pageId],
    )

    return { started: true, session }
  })
})
