import { createError, defineEventHandler } from 'h3'
import { ingestBatch } from '@server/utils/ingest'
import { runTransaction } from '@server/utils/database'
import { lockTrial, readBoundedBody } from '@server/utils/requests'
import { normalizeServiceRequest, validateServiceRequest } from '@server/validation/service-request'
import { submitTrialRequestSchema } from '@server/validation/requests'

export default defineEventHandler(async (event) => {
  const body = await readBoundedBody(event, submitTrialRequestSchema)
  const batch = body.batch

  return runTransaction(async (client) => {
    const trial = await lockTrial(event, client)
    const answers = normalizeServiceRequest(body.answers)
    const issues = validateServiceRequest(answers, trial.scenario.values)

    if (issues.length > 0) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Odpovědi neodpovídají zadání.',
        data: { issues },
      })
    }

    return ingestBatch(client, trial, batch, 'completed')
  })
})
