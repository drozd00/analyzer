import assert from 'node:assert/strict'
import test from 'node:test'
import profile from '@datastore/profiles/service-request.json'
import {
  createTrialSchedule,
  GROUP_CODES,
  ESTIMATED_SESSION_MINUTES,
  MEASURED_RUNS_PER_VARIANT,
  PAUSE_BETWEEN_BLOCKS_MS,
  PROTOCOL_VERSION,
  RUNS_PER_VARIANT,
} from '@server/utils/study'
import { FIELD_DEFINITIONS, validateServiceRequest } from '@server/validation/service-request'

test('all four counterbalanced schedules contain identical questions and valid scenarios', () => {
  for (const group of GROUP_CODES) {
    const trials = createTrialSchedule(group)
    assert.equal(trials.length, 6)
    assert.equal(trials[0]?.phase, 'familiarization')
    assert.equal(trials[3]?.phase, 'familiarization')
    for (const variant of ['A', 'B']) {
      const measured = trials.filter(
        (trial) => trial.variant === variant && trial.phase === 'measured',
      )
      assert.deepEqual(
        measured.map((trial) => trial.repetition),
        [1, 2],
      )
    }
    for (const trial of trials) {
      const fieldIds = FIELD_DEFINITIONS.map((field) => field.fieldId)
      assert.deepEqual(Object.keys(trial.scenario.values), fieldIds)
      assert.deepEqual(validateServiceRequest(trial.scenario.values), [])
      for (const value of Object.values(trial.scenario.values)) {
        assert.match(value, /^[\x20-\x7e]+$/, `${trial.scenario_id}: ${value}`)
      }
    }
    assert.equal(trials[0]?.variant, group[0])
    assert.equal(trials[3]?.variant, group[3])
  }
})

test('the server schedule agrees with its registered study profile', () => {
  assert.equal(profile.protocolVersion, PROTOCOL_VERSION)
  const profileFields = profile.fields.map((field) => field.id)
  const answerFields = FIELD_DEFINITIONS.map((field) => field.fieldId)
  assert.deepEqual(profileFields, answerFields)
  assert.equal(profile.procedure.trialsPerVariant, RUNS_PER_VARIANT)
  assert.equal(profile.procedure.measuredPerVariant, MEASURED_RUNS_PER_VARIANT)
  assert.equal(profile.procedure.betweenBlockPauseSeconds * 1000, PAUSE_BETWEEN_BLOCKS_MS)
  assert.equal(profile.procedure.estimatedSessionMinutes, ESTIMATED_SESSION_MINUTES)
  assert.equal('sessionLimitSeconds' in profile.procedure, false)
  for (const group of GROUP_CODES) {
    const schedule = createTrialSchedule(group)
    const registeredGroup = profile.groups.find((item) => item.id === group)
    assert.ok(registeredGroup)
    assert.deepEqual(
      [schedule[0]!.variant, schedule[RUNS_PER_VARIANT]!.variant],
      registeredGroup.variantOrder,
    )
    for (const variant of ['A', 'B']) {
      const familiarization = schedule.filter(
        (trial) => trial.variant === variant && trial.phase === 'familiarization',
      )
      assert.equal(familiarization.length, profile.procedure.familiarizationPerVariant)
      const measured = schedule.filter(
        (trial) => trial.variant === variant && trial.phase === 'measured',
      )
      for (const run of measured) {
        assert.notDeepEqual(run.scenario.values, familiarization[0]!.scenario.values)
      }
    }
  }
})
