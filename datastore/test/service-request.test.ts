import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEmptyServiceRequest,
  normalizeServiceRequest,
  parsePreferredDate,
  validateServiceRequest,
} from '@server/validation/service-request'
import { createScenario } from '@server/utils/study'

test('answer validation reports one required issue per field in form order', () => {
  const empty = createEmptyServiceRequest()
  const issues = validateServiceRequest(empty)
  assert.equal(issues.length, 12)
  assert.deepEqual(
    issues.map((issue) => issue.fieldId),
    Object.keys(empty),
  )
  assert.ok(
    issues.every((issue) => issue.ruleId === 'required' && issue.message === 'Vyplňte toto pole.'),
  )
})

test('answer normalization accepts equivalent Czech formats before scenario comparison', () => {
  const scenario = createScenario('X', 1)
  const values = {
    ...scenario.values,
    phone: '00420 777-601-010',
    preferredDate: '11. 4. 2027',
    objectType: 'Byt',
    zipCode: '130 00',
  }
  assert.deepEqual(validateServiceRequest(values, scenario.values), [])
  values.city = 'Brno'
  assert.deepEqual(validateServiceRequest(values, scenario.values), [
    {
      fieldId: 'city',
      ruleId: 'scenario-mismatch',
      message: 'Údaj neodpovídá zadání. Zkontrolujte jej prosím.',
    },
  ])
})

test('answer formats, options, and calendar dates remain strict', () => {
  const values = createScenario('X', 1).values
  values.phone = '+421777601010'
  values.email = 'invalid'
  values.zipCode = '1300'
  values.priority = 'st'
  values.preferredDate = '29. 2. 2027'
  const issues = validateServiceRequest(values)
  assert.deepEqual(
    issues.map((issue) => issue.ruleId),
    ['phone-format', 'email-format', 'zip-code-format', 'option-value', 'date-format'],
  )
  assert.equal(parsePreferredDate('29. 2. 2000'), '2000-02-29')
  assert.equal(parsePreferredDate('29. 2. 1900'), null)
  assert.equal(parsePreferredDate('0000-01-01'), null)
})

test('non-string transport values cannot become valid answers', () => {
  const normalized = normalizeServiceRequest({
    fullName: 42,
    phone: null,
    note: {},
    city: ' Praha 3 ',
  })
  assert.equal(normalized.fullName, '')
  assert.equal(normalized.phone, '')
  assert.equal('note' in normalized, false)
  assert.equal(normalized.city, 'Praha 3')
  assert.deepEqual(normalizeServiceRequest(null), createEmptyServiceRequest())
  assert.deepEqual(normalizeServiceRequest([]), createEmptyServiceRequest())
})
