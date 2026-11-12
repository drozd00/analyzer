import { defineEventHandler } from 'h3'
import { runTransaction } from '@server/utils/database'
import { requireStudySession } from '@server/utils/requests'

export default defineEventHandler(async (event) => {
  const sessionId = requireStudySession(event)

  await runTransaction(async (client) => {
    await client.query(
      "UPDATE raw.trials SET status='aborted', ended_at=now() WHERE session_id=$1 AND status IN ('ready','running')",
      [sessionId],
    )
  })

  return { saved: true }
})
