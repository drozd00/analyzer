import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'
import { toNodeHandler } from 'h3/node'
import { createDatastoreService } from './helpers/create-service'

const originalDatabaseUrl = process.env.DATABASE_URL
let server: Server | undefined
let baseUrl: string

before(async () => {
  delete process.env.DATABASE_URL
  const app = createDatastoreService()
  const listener = toNodeHandler(app)
  server = createServer(listener)
  const listening = once(server, 'listening')
  server.listen(0, '127.0.0.1')
  await listening
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  try {
    const activeServer = server
    if (activeServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        activeServer.close((error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
    }
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl
    }
  }
})

test('closing a session expires its cookie over HTTP', async () => {
  const response = await fetch(`${baseUrl}/api/sessions/close`, {
    method: 'POST',
    headers: { cookie: 'study-session=00000000-0000-4000-8000-000000000001' },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { closed: true })
  const cookie = response.headers.get('set-cookie')
  assert.ok(cookie)
  assert.match(cookie, /^study-session=;/)
  assert.match(cookie, /Max-Age=0/i)
  assert.match(cookie, /Path=\//i)
})

test('invalid session identifiers are rejected before connecting to PostgreSQL', async () => {
  for (const path of ['/api/sessions', '/api/sessions/resume']) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'invalid' }),
    })

    assert.equal(response.status, 400, path)
    const body = await response.json()
    assert.equal(body.statusCode, 400)
  }
})

test('session lookup and withdrawal require a session cookie', async () => {
  const routes = [
    { path: '/api/sessions/current', method: 'GET' },
    { path: '/api/sessions/withdraw', method: 'POST' },
  ]
  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route.path}`, { method: route.method })

    assert.equal(response.status, 404, route.path)
    const body = await response.json()
    assert.equal(body.statusCode, 404)
  }
})

test('unknown routes and unsupported HTTP methods return routing errors', async () => {
  const unknown = await fetch(`${baseUrl}/api/unknown`)
  assert.equal(unknown.status, 404)
  await unknown.json()

  const wrongMethod = await fetch(`${baseUrl}/api/sessions/close`)
  assert.equal(wrongMethod.status, 404)
  assert.equal(wrongMethod.headers.get('set-cookie'), null)
  await wrongMethod.json()
})

test('trial event routes reject invalid batches before connecting to PostgreSQL', async () => {
  const trialId = '00000000-0000-4000-8000-000000000001'
  const routes = [
    { path: `/api/trials/${trialId}/events`, body: {} },
    { path: `/api/trials/${trialId}/submit`, body: { batch: {} } },
  ]
  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(route.body),
    })

    assert.equal(response.status, 400, route.path)
    const body = await response.json()
    assert.equal(body.statusCode, 400)
  }
})

test('health reports an unconfigured PostgreSQL connection as unavailable', async () => {
  const response = await fetch(`${baseUrl}/api/health`)

  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.statusCode, 503)
})
