import { defineEventHandler } from 'h3'
import { ingestBatch } from '@server/utils/ingest'
import { runTransaction } from '@server/utils/database'
import { lockTrial, readBoundedBody } from '@server/utils/requests'
import { eventBatchSchema } from '@server/validation/event-batch'

export default defineEventHandler(async (event) => {
  const batch = await readBoundedBody(event, eventBatchSchema)

  return runTransaction(async (client) => {
    const trial = await lockTrial(event, client)
    return ingestBatch(client, trial, batch)
  })
})
