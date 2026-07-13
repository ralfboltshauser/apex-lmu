import { formatNumericValue, parseNumericDraft } from './numeric-field'

describe('numeric draft parser', () => {
  it.each(['', ' ', '\t'])('keeps empty text as an explicit draft: %j', (value) => expect(parseNumericDraft(value, 'en')).toEqual({ kind: 'empty' }))
  it.each(['-', '+', '.', '1.', '.5', '1e3', 'NaN', 'Infinity', '1,2.3'])('rejects incomplete or unsupported syntax: %s', (value) => expect(parseNumericDraft(value, 'en')).toEqual({ kind: 'invalid', reason: 'syntax' }))
  it('parses English dot and German comma without coercion', () => {
    expect(parseNumericDraft('3.46', 'en')).toEqual({ kind: 'valid', value: 3.46 })
    expect(parseNumericDraft('3,46', 'de')).toEqual({ kind: 'valid', value: 3.46 })
    expect(parseNumericDraft('3,46', 'en')).toEqual({ kind: 'invalid', reason: 'syntax' })
  })
  it('applies min, max, integer, and step constraints', () => {
    expect(parseNumericDraft('0', 'en', { min: 1 })).toEqual({ kind: 'invalid', reason: 'below-min' })
    expect(parseNumericDraft('11', 'en', { max: 10 })).toEqual({ kind: 'invalid', reason: 'above-max' })
    expect(parseNumericDraft('2.5', 'en', { integer: true })).toEqual({ kind: 'invalid', reason: 'integer' })
    expect(parseNumericDraft('2.55', 'en', { step: 0.1 })).toEqual({ kind: 'invalid', reason: 'step' })
    expect(parseNumericDraft('2.5', 'en', { step: 0.1 })).toEqual({ kind: 'valid', value: 2.5 })
  })
  it('round-trips representative values in both languages', () => {
    for (const value of [3.46, 124.1, 90, 2]) for (const language of ['en', 'de'] as const) {
      const formatted = formatNumericValue(value, language, 0.01)
      expect(parseNumericDraft(formatted, language)).toEqual({ kind: 'valid', value })
    }
  })
})
