import type { H3Event } from 'h3'
import {
  assertBodySize,
  createError,
  deleteCookie,
  getCookie,
  getRouterParam,
  readValidatedBody,
  setCookie,
} from 'h3'
import { z } from 'zod'
import type { PoolClient } from '@input-analyzer/datastore'
import type { Trial } from '@server/utils/study'
import { sessionIdSchema } from '@server/validation/requests'

const STUDY_SESSION_COOKIE = 'study-session'
const STUDY_SESSION_MAX_AGE_SECONDS = 86_400

export function requireUuid(value: unknown): string {
  const parsed = sessionIdSchema.safeParse(value)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatný identifikátor.' })
  }

  return parsed.data
}

export function requireStudySession(event: H3Event): string {
  const value = getCookie(event, STUDY_SESSION_COOKIE)
  if (!value) {
    throw createError({ statusCode: 404, statusMessage: 'Žádná aktivní relace.' })
  }

  return requireUuid(value)
}

export function setStudySessionCookie(event: H3Event, sessionId: string): void {
  setCookie(event, STUDY_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: STUDY_SESSION_MAX_AGE_SECONDS,
  })
}

export function clearStudySessionCookie(event: H3Event): void {
  deleteCookie(event, STUDY_SESSION_COOKIE, { path: '/' })
}

export async function lockTrial(event: H3Event, client: PoolClient): Promise<Trial> {
  const id = requireUuid(getRouterParam(event, 'id'))
  const sessionId = requireStudySession(event)

  // All state transitions acquire the session before its trials.
  await client.query('SELECT id FROM raw.sessions WHERE id=$1 FOR UPDATE', [sessionId])

  const result = await client.query(
    'SELECT * FROM raw.trials WHERE id=$1 AND session_id=$2 FOR UPDATE',
    [id, sessionId],
  )
  if (!result.rows[0]) {
    throw createError({ statusCode: 404, statusMessage: 'Pokus nenalezen.' })
  }

  return result.rows[0] as Trial
}

export async function readBoundedBody<T>(event: H3Event, schema: z.ZodType<T>): Promise<T> {
  assertBodySize(event, 512_000)

  const nonemptySchema = z.preprocess((value) => {
    if (value === undefined) {
      throw createError({ status: 413, message: 'Neplatná velikost požadavku.' })
    }

    return value
  }, schema)

  return readValidatedBody(event, nonemptySchema, {
    type: 'json',
    // Do not echo telemetry or submitted answers in validation diagnostics.
    onError: () => ({ status: 400, message: 'Požadavek neodpovídá datovému kontraktu.' }),
  })
}
