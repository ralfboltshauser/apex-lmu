import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider, useI18n } from '../../i18n'
import { NumericField } from './NumericField'

function storage(language: 'en' | 'de') {
  const values = new Map<string, string>([['apex:language', language]])
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function blur(input: HTMLInputElement) { await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))) }
async function key(input: HTMLInputElement, value: string) { await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }))) }

describe('NumericField', () => {
  beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
  afterAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false })

  it('never emits empty/invalid drafts and commits valid text on blur or Enter', async () => {
    storage('en')
    const commit = vi.fn()
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><NumericField label="Fuel" value={3.46} unit="L" min={0.01} max={100} step={0.01} onCommit={commit} /></I18nProvider>))
    const input = container.querySelector('input')!
    await type(input, '')
    expect(commit).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain('last valid value')
    await type(input, '1e3')
    await blur(input)
    expect(commit).not.toHaveBeenCalled()
    await type(input, '3.50')
    await blur(input)
    expect(commit).toHaveBeenLastCalledWith(3.5)
    await type(input, '4.25')
    await key(input, 'Enter')
    expect(commit).toHaveBeenLastCalledWith(4.25)
    await act(async () => root.unmount()); container.remove()
  })

  it('restores on Escape and resynchronizes after an external reset', async () => {
    storage('en')
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><NumericField label="Fuel" value={3.46} unit="L" step={0.01} onCommit={() => {}} /></I18nProvider>))
    const input = container.querySelector('input')!
    await type(input, '')
    await key(input, 'Escape')
    expect(input.value).toBe('3.46')
    await act(async () => root.render(<I18nProvider><NumericField label="Fuel" value={7.25} unit="L" step={0.01} onCommit={() => {}} /></I18nProvider>))
    expect(input.value).toBe('7.25')
    await act(async () => root.unmount()); container.remove()
  })

  it('accepts the German decimal comma and links accessible errors', async () => {
    storage('de')
    const commit = vi.fn()
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><NumericField label="Kraftstoff" value={3.46} unit="l" min={1} step={0.01} onCommit={commit} /></I18nProvider>))
    const input = container.querySelector('input')!
    expect(input.value).toBe('3,46')
    await type(input, '0,5')
    expect(input.getAttribute('aria-describedby')).toBe(container.querySelector('.number-input__error')?.id)
    await type(input, '4,25')
    await blur(input)
    expect(commit).toHaveBeenCalledWith(4.25)
    await act(async () => root.unmount()); container.remove()
  })

  it('discards an uncommitted draft and reformats the committed value when language changes', async () => {
    storage('en')
    const commit = vi.fn()
    function Harness() {
      const { language, setLanguage } = useI18n()
      return <><button type="button" onClick={() => setLanguage(language === 'en' ? 'de' : 'en')}>{language}</button><NumericField label="Fuel" value={3.46} unit="L" step={0.01} onCommit={commit} /></>
    }
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><Harness /></I18nProvider>))
    const input = container.querySelector('input')!
    await type(input, '9.99')
    await act(async () => container.querySelector('button')!.click())
    expect(input.value).toBe('3,46')
    expect(commit).not.toHaveBeenCalled()
    await act(async () => root.unmount()); container.remove()
  })
})
