import { defineEventHandler } from 'h3'
import { ingestBatch, parseEventBatch } from '@server/utils/ingest'
import { runTransaction } from '@server/utils/database'
import { lockTrial, readBoundedBody } from '@server/utils/requests'
import { abortTrialRequestSchema } from '@server/validation/requests'

export default defineEventHandler(async (event) => {
  const body = await readBoundedBody(event, abortTrialRequestSchema)

  return runTransaction(async (client) => {
    const trial = await lockTrial(event, client)

    if (body.reason === 'reload' || body.reason === 'withdrawal') {
      const isActive = trial.status === 'running' || trial.status === 'ready'

      if (isActive) {
        const status = body.reason === 'reload' ? 'interrupted' : 'aborted'
        await client.query('UPDATE raw.trials SET status=$2,ended_at=now() WHERE id=$1', [
          trial.id,
          status,
        ])
      }

      return { saved: true }
    }

    const batch = parseEventBatch(body.batch)
    return ingestBatch(client, trial, batch, 'aborted')
  })
})
