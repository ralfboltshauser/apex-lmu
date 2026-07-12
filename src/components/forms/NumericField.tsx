import { useEffect, useId, useState, type ReactNode } from 'react'
import { defineMessages, useI18n, useMessages } from '../../i18n'
import { formatNumericValue, parseNumericDraft, type NumericConstraints } from './numeric-field'

const messages = defineMessages({
  empty: 'Enter a value. The calculation still uses the last valid value.',
  syntax: 'Use digits and one decimal separator. Exponents and mixed separators are not supported.',
  belowMin: 'Enter {min} or more.', aboveMax: 'Enter {max} or less.', step: 'Use increments of {step}.', integer: 'Enter a whole number.',
}, {
  empty: 'Gib einen Wert ein. Die Berechnung verwendet weiterhin den letzten gültigen Wert.',
  syntax: 'Verwende Ziffern und ein Dezimaltrennzeichen. Exponenten und gemischte Trennzeichen werden nicht unterstützt.',
  belowMin: 'Gib mindestens {min} ein.', aboveMax: 'Gib höchstens {max} ein.', step: 'Verwende Schritte von {step}.', integer: 'Gib eine ganze Zahl ein.',
})

type Props = NumericConstraints & Readonly<{
  label: string
  value: number
  unit: string
  onCommit: (value: number) => void
  help?: ReactNode
  disabled?: boolean
  required?: boolean
  id?: string
}>

function replace(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (token, key) => key in values ? String(values[key]) : token)
}

export function NumericField({ label, value, unit, onCommit, help, disabled = false, required = true, id, min, max, step, integer }: Props) {
  const { language } = useI18n()
  const m = useMessages(messages)
  const generated = useId()
  const inputId = id || `numeric-${generated}`
  const errorId = `${inputId}-error`
  const [draft, setDraft] = useState(() => formatNumericValue(value, language, step))
  const parsed = parseNumericDraft(draft, language, { min, max, step, integer })
  const invalid = !disabled && parsed.kind !== 'valid' && (required || parsed.kind !== 'empty')

  useEffect(() => { setDraft(formatNumericValue(value, language, step)) }, [language, step, value])

  const restore = () => setDraft(formatNumericValue(value, language, step))
  const commit = () => {
    const result = parseNumericDraft(draft, language, { min, max, step, integer })
    if (result.kind !== 'valid') return
    onCommit(result.value)
    setDraft(formatNumericValue(result.value, language, step))
  }
  const error = parsed.kind === 'empty' ? m.empty : parsed.kind === 'invalid'
    ? parsed.reason === 'syntax' ? m.syntax
      : parsed.reason === 'below-min' ? replace(m.belowMin, { min: formatNumericValue(min!, language, step) })
        : parsed.reason === 'above-max' ? replace(m.aboveMax, { max: formatNumericValue(max!, language, step) })
          : parsed.reason === 'step' ? replace(m.step, { step: formatNumericValue(step!, language, step) })
            : m.integer
    : ''

  return <label className={`number-input ${invalid ? 'is-invalid' : ''}`} htmlFor={inputId}>
    <span>{label}{help}</span>
    <div><input id={inputId} type="text" inputMode={integer ? 'numeric' : 'decimal'} value={draft} disabled={disabled} required={required} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); commit() }
      if (event.key === 'Escape') { event.preventDefault(); restore() }
    }} /><em>{unit}</em></div>
    {invalid && <small className="number-input__error" id={errorId} role="status">{error}</small>}
  </label>
}
