import { z } from 'zod'

export type FieldOption = { value: string; label: string }

const objectTypeOptions: readonly FieldOption[] = [
  { value: 'byt', label: 'Byt' },
  { value: 'dum', label: 'Rodinny dum' },
  { value: 'kancelar', label: 'Kancelar' },
  { value: 'provozovna', label: 'Provozovna' },
]

const issueCategoryOptions: readonly FieldOption[] = [
  { value: 'topeni', label: 'Topeni' },
  { value: 'voda', label: 'Voda a odpad' },
  { value: 'elektro', label: 'Elektroinstalace' },
  { value: 'zabezpeceni', label: 'Zabezpeceni' },
]

const priorityOptions: readonly FieldOption[] = [
  { value: 'urgentni', label: 'Urgentni' },
  { value: 'standard', label: 'Standardni' },
  { value: 'nizka', label: 'Nizka' },
]

const timeWindowOptions: readonly FieldOption[] = [
  { value: '08-10', label: '8:00 az 10:00' },
  { value: '10-12', label: '10:00 az 12:00' },
  { value: '13-15', label: '13:00 az 15:00' },
  { value: '15-17', label: '15:00 az 17:00' },
]

function isOptionValue(options: readonly FieldOption[], value: string): boolean {
  for (const option of options) {
    if (option.value === value) {
      return true
    }
  }

  return false
}

const answerText = z.string()
const requiredAnswer = answerText.min(1, { error: 'required' })

export const serviceRequestSchema = z.object({
  fullName: requiredAnswer,
  phone: requiredAnswer.regex(/^\+420\d{9}$/, { error: 'phone-format' }),
  email: requiredAnswer.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { error: 'email-format' }),
  street: requiredAnswer,
  houseNumber: requiredAnswer,
  zipCode: requiredAnswer.regex(/^\d{5}$/, { error: 'zip-code-format' }),
  city: requiredAnswer,
  objectType: requiredAnswer.refine((value) => isOptionValue(objectTypeOptions, value), {
    error: 'option-value',
  }),
  issueCategory: requiredAnswer.refine((value) => isOptionValue(issueCategoryOptions, value), {
    error: 'option-value',
  }),
  priority: requiredAnswer.refine((value) => isOptionValue(priorityOptions, value), {
    error: 'option-value',
  }),
  preferredDate: requiredAnswer.refine((value) => parsePreferredDate(value) !== null, {
    error: 'date-format',
  }),
  timeWindow: requiredAnswer.refine((value) => isOptionValue(timeWindowOptions, value), {
    error: 'option-value',
  }),
})

export type ServiceRequest = z.infer<typeof serviceRequestSchema>

export type FieldId = keyof ServiceRequest

export type FieldDefinition = {
  fieldId: FieldId
  label: string
  kind: 'text' | 'tel' | 'email' | 'select' | 'radio' | 'date' | 'textarea'
  required: boolean
  options?: readonly FieldOption[]
}

export type ValidationIssue = {
  fieldId: FieldId
  ruleId: string
  message: string
}

const validationMessages: Record<string, string> = {
  required: 'Vyplňte toto pole.',
  'phone-format': 'Zadejte 9 číslic, případně s předvolbou +420 nebo 00420.',
  'zip-code-format': 'PSČ musí obsahovat 5 číslic.',
  'email-format': 'Zadejte platnou e-mailovou adresu.',
  'date-format': 'Zadejte existující datum včetně roku, např. 15. 4. 2026.',
  'option-value': 'Vyberte jednu z nabízených možností.',
  'scenario-mismatch': 'Údaj neodpovídá zadání. Zkontrolujte jej prosím.',
}

export const FIELD_DEFINITIONS: readonly FieldDefinition[] = [
  { fieldId: 'fullName', label: 'Jméno a příjmení', kind: 'text', required: true },
  { fieldId: 'phone', label: 'Telefon', kind: 'tel', required: true },
  { fieldId: 'email', label: 'E-mail', kind: 'email', required: true },
  { fieldId: 'street', label: 'Ulice', kind: 'text', required: true },
  { fieldId: 'houseNumber', label: 'Číslo domu', kind: 'text', required: true },
  { fieldId: 'zipCode', label: 'PSČ', kind: 'text', required: true },
  { fieldId: 'city', label: 'Město', kind: 'text', required: true },
  {
    fieldId: 'objectType',
    label: 'Typ objektu',
    kind: 'select',
    required: true,
    options: objectTypeOptions,
  },
  {
    fieldId: 'issueCategory',
    label: 'Kategorie problému',
    kind: 'select',
    required: true,
    options: issueCategoryOptions,
  },
  {
    fieldId: 'priority',
    label: 'Priorita',
    kind: 'radio',
    required: true,
    options: priorityOptions,
  },
  { fieldId: 'preferredDate', label: 'Preferované datum', kind: 'date', required: true },
  {
    fieldId: 'timeWindow',
    label: 'Časové okno',
    kind: 'select',
    required: true,
    options: timeWindowOptions,
  },
]

export function createEmptyServiceRequest(): ServiceRequest {
  return {
    fullName: '',
    phone: '',
    email: '',
    street: '',
    houseNumber: '',
    zipCode: '',
    city: '',
    objectType: '',
    issueCategory: '',
    priority: '',
    preferredDate: '',
    timeWindow: '',
  }
}

export function normalizeOptionText(value: string): string {
  const decomposed = value.normalize('NFD')
  const withoutAccents = decomposed.replace(/[\u0300-\u036f]/g, '')
  const lowerCase = withoutAccents.toLowerCase()

  return lowerCase.trim()
}

export function parsePreferredDate(value: string): string | null {
  const trimmed = value.trim()
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  const czechMatch = /^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/.exec(trimmed)

  let year: number
  let month: number
  let day: number

  if (isoMatch) {
    year = Number(isoMatch[1])
    month = Number(isoMatch[2])
    day = Number(isoMatch[3])
  } else if (czechMatch) {
    day = Number(czechMatch[1])
    month = Number(czechMatch[2])
    year = Number(czechMatch[3])
  } else {
    return null
  }

  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return null
  }

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonths = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const maximumDay = daysInMonths[month - 1] ?? 0

  if (day > maximumDay) {
    return null
  }

  const formattedYear = String(year).padStart(4, '0')
  const formattedMonth = String(month).padStart(2, '0')
  const formattedDay = String(day).padStart(2, '0')

  return `${formattedYear}-${formattedMonth}-${formattedDay}`
}

function findFieldDefinition(fieldId: FieldId): FieldDefinition | undefined {
  for (const definition of FIELD_DEFINITIONS) {
    if (definition.fieldId === fieldId) {
      return definition
    }
  }

  return undefined
}

export function normalizeFieldValue(fieldId: FieldId, value: string): string {
  const trimmed = value.trim()

  if (fieldId === 'phone') {
    const compact = trimmed.replace(/[\s()-]/g, '')

    if (/^\d{9}$/.test(compact)) {
      return `+420${compact}`
    }

    if (/^00420\d{9}$/.test(compact)) {
      return `+${compact.slice(2)}`
    }

    if (/^\+420\d{9}$/.test(compact)) {
      return compact
    }

    return trimmed
  }

  if (fieldId === 'zipCode') {
    return trimmed.replace(/\s/g, '')
  }

  if (fieldId === 'email') {
    return trimmed.toLowerCase()
  }

  if (fieldId === 'preferredDate') {
    return parsePreferredDate(trimmed) ?? trimmed
  }

  const definition = findFieldDefinition(fieldId)
  if (!definition?.options) {
    return trimmed.replace(/\s+/g, ' ')
  }

  const normalizedValue = normalizeOptionText(trimmed)
  for (const option of definition.options) {
    const normalizedCode = normalizeOptionText(option.value)
    const normalizedLabel = normalizeOptionText(option.label)

    if (normalizedValue === normalizedCode || normalizedValue === normalizedLabel) {
      return option.value
    }
  }

  return trimmed
}

export function normalizeServiceRequest(input: unknown): ServiceRequest {
  const normalized = createEmptyServiceRequest()

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return normalized
  }

  const record = input as Record<string, unknown>
  for (const field of FIELD_DEFINITIONS) {
    const value = record[field.fieldId]

    if (typeof value === 'string') {
      normalized[field.fieldId] = normalizeFieldValue(field.fieldId, value)
    }
  }

  return normalized
}

export function validateServiceRequest(
  values: ServiceRequest,
  expected?: Partial<ServiceRequest>,
): ValidationIssue[] {
  const normalized = normalizeServiceRequest(values)
  const issues: ValidationIssue[] = []
  const invalidRules = new Map<FieldId, string>()
  const parsed = serviceRequestSchema.safeParse(normalized)

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const fieldId = issue.path[0] as FieldId
      if (!invalidRules.has(fieldId)) {
        invalidRules.set(fieldId, issue.message)
      }
    }
  }

  for (const field of FIELD_DEFINITIONS) {
    const fieldId = field.fieldId
    const value = normalized[fieldId]
    let ruleId = invalidRules.get(fieldId)

    if (!ruleId && expected && typeof expected[fieldId] === 'string') {
      const expectedValue = normalizeFieldValue(fieldId, expected[fieldId])

      if (value !== expectedValue) {
        ruleId = 'scenario-mismatch'
      }
    }

    if (ruleId) {
      const message = validationMessages[ruleId]!
      issues.push({ fieldId, ruleId, message })
    }
  }

  return issues
}
