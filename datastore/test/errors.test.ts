import assert from 'node:assert/strict'
import test from 'node:test'
import { HTTPError } from 'h3'
import { createErrorResponse } from '@server/error'

test('expected application errors retain status and field feedback', async () => {
  const data = { issues: [{ fieldId: 'phone', ruleId: 'required', message: 'Vyplňte toto pole.' }] }
  const error = new HTTPError({ status: 422, message: 'Odpovědi neodpovídají zadání.', data })
  const response = createErrorResponse(error)
  assert.equal(response.status, 422)
  const body = await response.json()
  assert.equal(body.statusCode, 422)
  assert.equal(body.message, error.message)
  assert.deepEqual(body.data, data)
})

test('schema validation errors do not echo submitted keys, values, or issue details', async () => {
  const error = new HTTPError({
    status: 400,
    statusText: 'Validation failed',
    message: 'Unrecognized key: forbidden-raw-text',
    data: { issues: [{ message: 'Unrecognized key: forbidden-raw-text' }] },
  })
  const response = createErrorResponse(error)
  assert.equal(response.status, 400)
  const text = await response.text()
  assert.doesNotMatch(text, /forbidden-raw-text|issues/)
  assert.equal(JSON.parse(text).statusCode, 400)
})

test('internal failures hide SQL and connection details', async () => {
  const error = new HTTPError({
    status: 500,
    message: 'SELECT secret FROM raw.events failed at postgresql://secret',
    data: { query: 'SELECT secret FROM raw.events' },
  })
  const response = createErrorResponse(error)
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), {
    statusCode: 500,
    statusMessage: 'Internal Server Error',
    message: 'Internal Server Error',
  })
})

test('routing error headers remain available to the client', async () => {
  const error = new HTTPError({ status: 405, headers: { allow: 'GET, HEAD' } })
  const response = createErrorResponse(error)
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'GET, HEAD')
})
