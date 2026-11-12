import { z } from 'zod'
import { eventBatchSchema } from '@server/validation/event-batch'

const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const sessionIdText = z.string()
export const sessionIdSchema = sessionIdText.regex(sessionIdPattern)

export const sessionRequestSchema = z.looseObject({ sessionId: sessionIdSchema })

const pageIdText = z.string()
const nonemptyPageId = pageIdText.min(1)
const pageIdSchema = nonemptyPageId.max(200)

export const startTrialRequestSchema = z.looseObject({ pageId: pageIdSchema })

export const submitTrialRequestSchema = z.looseObject({
  batch: eventBatchSchema,
  answers: z.optional(z.unknown()),
})

const interruptionSchema = z.looseObject({ reason: z.enum(['reload', 'withdrawal']) })
const abortBatchSchema = z.looseObject({ batch: eventBatchSchema })
export const abortTrialRequestSchema = z.union([interruptionSchema, abortBatchSchema])
