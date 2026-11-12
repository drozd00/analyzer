import { H3 } from 'h3'
import { createErrorResponse } from '@server/error'
import checkHealth from '@server/api/health.get'
import createSession from '@server/api/sessions.post'
import getCurrentSession from '@server/api/sessions/current.get'
import resumeSession from '@server/api/sessions/resume.post'
import withdrawSession from '@server/api/sessions/withdraw.post'
import closeSession from '@server/api/sessions/close.post'
import startTrial from '@server/api/trials/[id]/start.post'
import ingestTrialEvents from '@server/api/trials/[id]/events.post'
import submitTrial from '@server/api/trials/[id]/submit.post'
import abortTrial from '@server/api/trials/[id]/abort.post'

// Unit tests exercise handlers without the production migration startup plugin.
// Production uses Nitro's filesystem router; integration tests cover that output.
export function createDatastoreService(): H3 {
  const router = new H3({ onError: createErrorResponse })

  router.get('/api/health', checkHealth)
  router.post('/api/sessions', createSession)
  router.get('/api/sessions/current', getCurrentSession)
  router.post('/api/sessions/resume', resumeSession)
  router.post('/api/sessions/withdraw', withdrawSession)
  router.post('/api/sessions/close', closeSession)
  router.post('/api/trials/:id/start', startTrial)
  router.post('/api/trials/:id/events', ingestTrialEvents)
  router.post('/api/trials/:id/submit', submitTrial)
  router.post('/api/trials/:id/abort', abortTrial)

  return router
}
