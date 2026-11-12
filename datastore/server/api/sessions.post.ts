import { randomInt, randomUUID } from 'node:crypto'
import { defineEventHandler } from 'h3'
import type { PoolClient } from '@input-analyzer/datastore'
import { runTransaction } from '@server/utils/database'
import {
  createTrialSchedule,
  GROUP_CODES,
  PROTOCOL_VERSION,
  type GroupCode,
  type StudySession,
} from '@server/utils/study'
import { readBoundedBody, setStudySessionCookie } from '@server/utils/requests'
import { registerStudyProfile, STUDY_ID } from '@server/utils/study-profile'
import { sessionRequestSchema } from '@server/validation/requests'

type DatasetKind = 'preflight' | 'pilot'

interface GroupCountRow {
  group_code: GroupCode
  count: number
}

function readDatasetKind(): DatasetKind {
  return process.env.STUDY_DATASET_KIND === 'pilot' ? 'pilot' : 'preflight'
}

function chooseBalancedGroup(rows: GroupCountRow[]): GroupCode {
  let minimum = Number.POSITIVE_INFINITY
  let candidates: GroupCode[] = []

  for (const group of GROUP_CODES) {
    let count = 0

    for (const row of rows) {
      if (row.group_code === group) {
        count = row.count
        break
      }
    }

    if (count < minimum) {
      minimum = count
      candidates = []
    }

    if (count === minimum) {
      candidates.push(group)
    }
  }

  return candidates[randomInt(candidates.length)]!
}

function createParticipantCode(datasetKind: DatasetKind, sessionCount: number): string {
  const prefix = datasetKind === 'pilot' ? 'P' : 'E'
  const sequence = String(sessionCount + 1).padStart(3, '0')

  return `${prefix}${sequence}`
}

async function createTrials(
  client: PoolClient,
  sessionId: string,
  group: GroupCode,
): Promise<void> {
  const schedule = createTrialSchedule(group)

  for (const trial of schedule) {
    await client.query(
      'INSERT INTO raw.trials(id,session_id,ordinal,variant,phase,repetition,scenario_id,scenario) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        randomUUID(),
        sessionId,
        trial.ordinal,
        trial.variant,
        trial.phase,
        trial.repetition,
        trial.scenario_id,
        trial.scenario,
      ],
    )
  }
}

async function findOrCreateSession(
  client: PoolClient,
  sessionId: string,
  datasetKind: DatasetKind,
): Promise<StudySession> {
  const existing = await client.query<StudySession>('SELECT * FROM raw.sessions WHERE id=$1', [
    sessionId,
  ])
  if (existing.rows[0]) {
    return existing.rows[0]
  }

  const counts = await client.query<GroupCountRow>(
    'SELECT group_code, count(*)::int AS count FROM raw.sessions WHERE dataset_kind=$1 AND study_id=$2 AND protocol_version=$3 GROUP BY group_code',
    [datasetKind, STUDY_ID, PROTOCOL_VERSION],
  )
  const group = chooseBalancedGroup(counts.rows)

  const sessionCount = await client.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM raw.sessions WHERE dataset_kind=$1 AND study_id=$2 AND protocol_version=$3',
    [datasetKind, STUDY_ID, PROTOCOL_VERSION],
  )
  const participantCode = createParticipantCode(datasetKind, sessionCount.rows[0]!.count)

  const inserted = await client.query<StudySession>(
    'INSERT INTO raw.sessions(id,participant_code,protocol_version,group_code,dataset_kind,study_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [sessionId, participantCode, PROTOCOL_VERSION, group, datasetKind, STUDY_ID],
  )
  const session = inserted.rows[0]!

  await createTrials(client, sessionId, group)
  return session
}

export default defineEventHandler(async (event) => {
  const body = await readBoundedBody(event, sessionRequestSchema)
  const sessionId = body.sessionId
  const datasetKind = readDatasetKind()

  const response = await runTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(20261012)')
    await registerStudyProfile(client)

    const session = await findOrCreateSession(client, sessionId, datasetKind)
    const trials = await client.query(
      'SELECT * FROM raw.trials WHERE session_id=$1 ORDER BY ordinal',
      [sessionId],
    )

    return { session, trials: trials.rows }
  })

  setStudySessionCookie(event, sessionId)
  return response
})
