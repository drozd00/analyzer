import type { PoolClient } from '@datastore/index.mjs'
import { createError } from 'h3'
import profile from '@datastore/profiles/service-request.json'

export const STUDY_ID = 'service-request'
export const STUDY_PROFILE = profile

/** Register the profile and verify that its stored collection configuration matches. */
export async function registerStudyProfile(client: PoolClient) {
  await client.query(
    'INSERT INTO raw.studies(id,protocol_version,title,configuration) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [STUDY_ID, profile.protocolVersion, profile.title, profile],
  )

  // Report rendering can change independently of the collection protocol.
  const registered = await client.query(
    `SELECT (configuration - 'reportAdapter') = ($3::jsonb - 'reportAdapter') AS matches
     FROM raw.studies WHERE id=$1 AND protocol_version=$2`,
    [STUDY_ID, profile.protocolVersion, profile],
  )
  const configurationMatches = registered.rows[0]?.matches

  if (!configurationMatches) {
    throw createError({
      statusCode: 409,
      message: 'Konfigurace této verze studie se změnila. Použijte novou verzi protokolu.',
    })
  }
}
