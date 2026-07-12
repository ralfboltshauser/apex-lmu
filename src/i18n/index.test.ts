import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { defineMessages, I18nProvider, useI18n } from './index'

describe('translation contracts', () => {
  it('accepts resources with matching shape and placeholders', () => {
    expect(defineMessages(
      { title: 'Lap {lap}', rows: ['One', 'Two'] } as const,
      { title: 'Runde {lap}', rows: ['Eins', 'Zwei'] },
    ).de.title).toBe('Runde {lap}')
  })

  it('rejects placeholder drift even when TypeScript shape parity passes', () => {
    expect(() => defineMessages(
      { status: '{passed} of {total} passed' },
      { status: '{passed} bestanden' },
    )).toThrow(/placeholder mismatch/)
  })

  it('rejects runtime resources with missing nested keys', () => {
    expect(() => defineMessages(
      { nested: { title: 'Title', body: 'Body' } },
      { nested: { title: 'Titel' } } as never,
    )).toThrow(/key mismatch/)
  })

  it('switches immediately, persists the choice, and updates document language', async () => {
    const storage = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    } })
    window.localStorage.setItem('apex:language', 'en')
    const container = document.createElement('div')
    document.body.append(container)
    const Probe = () => {
      const { language, setLanguage } = useI18n()
      return createElement('button', { type: 'button', onClick: () => setLanguage('de') }, language)
    }
    const root = createRoot(container)
    await act(async () => root.render(createElement(I18nProvider, null, createElement(Probe))))
    expect(container.textContent).toBe('en')
    await act(async () => container.querySelector('button')!.click())
    expect(container.textContent).toBe('de')
    expect(document.documentElement.lang).toBe('de')
    expect(window.localStorage.getItem('apex:language')).toBe('de')
    await act(async () => root.unmount())
    container.remove()
  })
})
