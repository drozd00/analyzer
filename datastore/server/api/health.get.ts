import { defineEventHandler } from 'h3'
import { getDatabase } from '@server/utils/database'

function readDatasetKind(): 'preflight' | 'pilot' {
  return process.env.STUDY_DATASET_KIND === 'pilot' ? 'pilot' : 'preflight'
}

export default defineEventHandler(async () => {
  const database = getDatabase()
  await database.query('SELECT 1 FROM raw.sessions LIMIT 1')

  return {
    status: 'ok',
    datasetKind: readDatasetKind(),
  }
})
