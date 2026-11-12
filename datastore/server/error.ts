import { STATUS_CODES } from 'node:http'
import { defineErrorHandler } from 'nitro'
import { HTTPError } from 'h3'
import type { HTTPEvent } from 'h3'

interface ErrorResponseBody {
  statusCode: number
  statusMessage: string
  message: string
  data?: unknown
}

function isValidationFailure(
  statusCode: number,
  details: unknown,
  statusText: string | undefined,
): boolean {
  const hasValidationIssues = details !== null && typeof details === 'object' && 'issues' in details

  return statusCode === 400 && (hasValidationIssues || statusText === 'Validation failed')
}

/** Preserve the app's error contract without exposing database or submitted input details. */
export function createErrorResponse(error: HTTPError, _event?: HTTPEvent): Response {
  const handled = HTTPError.isError(error) && error.unhandled !== true

  let statusCode = handled ? error.status : 500
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    statusCode = 500
  }

  const statusMessage = STATUS_CODES[statusCode] ?? 'Error'
  const body: ErrorResponseBody = { statusCode, statusMessage, message: statusMessage }

  if (handled && statusCode < 500) {
    body.statusMessage = error.statusText || statusMessage
    body.message = error.message || body.statusMessage

    if (error.data !== undefined) {
      body.data = error.data
    }

    const details = error.data
    if (isValidationFailure(statusCode, details, error.statusText)) {
      body.statusMessage = 'Validation failed'
      body.message = 'Neplatný požadavek.'
      delete body.data
    }
  }

  const headers = new Headers(handled ? error.headers : undefined)
  headers.set('content-type', 'application/json; charset=utf-8')

  return new Response(JSON.stringify(body), { status: statusCode, headers })
}

export default defineErrorHandler(createErrorResponse)
