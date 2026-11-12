import type { ServiceRequest } from '@server/validation/service-request'

export const PROTOCOL_VERSION = 'pilot-v1'
export const MEASURED_RUNS_PER_VARIANT = 2
export const RUNS_PER_VARIANT = MEASURED_RUNS_PER_VARIANT + 1
export const PAUSE_BETWEEN_BLOCKS_MS = 30_000
export const ESTIMATED_SESSION_MINUTES = 15
export const GROUP_CODES = ['AX_BY', 'AY_BX', 'BX_AY', 'BY_AX'] as const

export type GroupCode = (typeof GROUP_CODES)[number]
export type Variant = 'A' | 'B'
export type TrialStatus = 'ready' | 'running' | 'completed' | 'aborted' | 'interrupted'

export interface Scenario {
  label: string
  values: ServiceRequest
}

export interface Trial {
  id: string
  session_id: string
  ordinal: number
  variant: Variant
  phase: 'familiarization' | 'measured'
  repetition: number
  scenario_id: string
  scenario: Scenario
  status: TrialStatus
  page_id?: string
  started_at?: string
  ended_at?: string
}

export interface StudySession {
  id: string
  participant_code: string
  group_code: GroupCode
  protocol_version: string
  dataset_kind: 'preflight' | 'pilot'
  study_id: string
}

export interface SessionResponse {
  session: StudySession
  trials: Trial[]
}

export interface IngestAck {
  batchId: string
  accepted: number
}

const givenNames = ['Adam', 'Petr', 'Jana']
const otherNames = ['Ivan', 'Oleg', 'Dana']
const familyNames = ['Urban', 'Benda', 'Winter']
const streets = ['U Lesa', 'Na Valech', 'U Parku']
const otherStreets = ['U Pole', 'Pod Lesem', 'U Sadu']
const cities = ['Praha', 'Brno', 'Most']
const zipCodes = ['13000', '60200', '43401']
const objectTypes = ['byt', 'dum', 'kancelar', 'provozovna']
const issues = ['topeni', 'voda', 'elektro', 'zabezpeceni']
const priorities = ['urgentni', 'standard', 'nizka']
const times = ['08-10', '10-12', '13-15', '15-17']

/** Both sets use identical questions; paired scenarios have matching formats and options. */
export function createScenario(
  set: 'X' | 'Y',
  repetition: number,
  familiarization = false,
): Scenario {
  const index = familiarization ? MEASURED_RUNS_PER_VARIANT : repetition - 1

  const names = set === 'X' ? givenNames : otherNames
  const streetNames = set === 'X' ? streets : otherStreets
  const phoneOffset = set === 'X' ? 1 : 2
  const formattedRepetition = String(repetition).padStart(2, '0')

  const name = names[index]!
  const familyName = familyNames[index]!
  const street = streetNames[index]!
  const zipCode = zipCodes[index]!
  const city = cities[index]!
  const objectType = objectTypes[index % objectTypes.length]!
  const issueCategory = issues[index % issues.length]!
  const priority = priorities[index % priorities.length]!
  const timeWindow = times[index % times.length]!

  const month = familiarization ? '03' : '04'
  const day = String(10 + index + phoneOffset).padStart(2, '0')
  const preferredDate = `2027-${month}-${day}`
  const label = familiarization
    ? `Seznamovací zadání ${set}`
    : `Servisní zásah ${set}${formattedRepetition}`

  return {
    label,
    values: {
      fullName: `${name} ${familyName}`,
      phone: `+42077760${phoneOffset}${formattedRepetition}0`,
      email: `kontakt.${set.toLowerCase()}${formattedRepetition}@example.test`,
      street,
      houseNumber: `${230 + index}/${10 + phoneOffset}`,
      zipCode,
      city,
      objectType,
      issueCategory,
      priority,
      preferredDate,
      timeWindow,
    },
  }
}

export function createTrialSchedule(
  group: GroupCode,
): Omit<Trial, 'id' | 'session_id' | 'status'>[] {
  const blocks = group.split('_')
  const schedule: Omit<Trial, 'id' | 'session_id' | 'status'>[] = []

  for (const block of blocks) {
    const variant = block[0] as Variant
    const set = block[1] as 'X' | 'Y'

    for (let repetition = 0; repetition <= MEASURED_RUNS_PER_VARIANT; repetition += 1) {
      const familiarization = repetition === 0
      const ordinal = schedule.length + 1
      const scenarioId = familiarization
        ? `familiarization-${set}`
        : `${set}${String(repetition).padStart(2, '0')}`

      schedule.push({
        ordinal,
        variant,
        phase: familiarization ? 'familiarization' : 'measured',
        repetition,
        scenario_id: scenarioId,
        scenario: createScenario(set, repetition, familiarization),
      })
    }
  }

  return schedule
}
