import { defineEventHandler } from 'h3'
import { clearStudySessionCookie } from '@server/utils/requests'

export default defineEventHandler((event) => {
  clearStudySessionCookie(event)
  return { closed: true }
})
