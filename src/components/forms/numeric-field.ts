import type { Language } from '../../i18n'

export type NumericDraft =
  | { kind: 'empty' }
  | { kind: 'invalid'; reason: 'syntax' | 'below-min' | 'above-max' | 'step' | 'integer' }
  | { kind: 'valid'; value: number }

export type NumericConstraints = Readonly<{
  min?: number
  max?: number
  step?: number
  integer?: boolean
}>

export function parseNumericDraft(draft: string, language: Language, constraints: NumericConstraints = {}): NumericDraft {
  const trimmed = draft.trim()
  if (!trimmed) return { kind: 'empty' }
  if (/e|nan|infinity/i.test(trimmed) || (trimmed.includes(',') && trimmed.includes('.'))) return { kind: 'invalid', reason: 'syntax' }
  const decimal = language === 'de' ? '[,.]' : '\\.'
  if (!new RegExp(`^[+-]?(?:\\d+|\\d+${decimal}\\d+)$`).test(trimmed)) return { kind: 'invalid', reason: 'syntax' }
  const value = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(value)) return { kind: 'invalid', reason: 'syntax' }
  if (constraints.min !== undefined && value < constraints.min) return { kind: 'invalid', reason: 'below-min' }
  if (constraints.max !== undefined && value > constraints.max) return { kind: 'invalid', reason: 'above-max' }
  if (constraints.integer && !Number.isInteger(value)) return { kind: 'invalid', reason: 'integer' }
  if (constraints.step !== undefined) {
    if (!Number.isFinite(constraints.step) || constraints.step <= 0) throw new Error('Numeric field step must be positive and finite')
    const origin = constraints.min ?? 0
    const steps = (value - origin) / constraints.step
    if (Math.abs(steps - Math.round(steps)) > 1e-8) return { kind: 'invalid', reason: 'step' }
  }
  return { kind: 'valid', value }
}

function decimalPlaces(value: number) {
  const text = String(value).toLowerCase()
  if (text.includes('e-')) return Number(text.split('e-')[1])
  return text.includes('.') ? text.split('.')[1].length : 0
}

export function formatNumericValue(value: number, language: Language, step?: number) {
  if (!Number.isFinite(value)) throw new Error('Numeric field value must be finite')
  const digits = Math.min(8, Math.max(decimalPlaces(value), step === undefined ? 0 : decimalPlaces(step)))
  return new Intl.NumberFormat(language, { useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value)
}
