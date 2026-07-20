import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider, useI18n } from '../i18n'
import { releaseCatalog } from '../release-notes'
import { ReleaseHistory, WhatsNewDialog } from './ReleaseNotes'

function LanguageButton() {
  const { language, setLanguage } = useI18n()
  return <button type="button" onClick={() => setLanguage(language === 'en' ? 'de' : 'en')}>{language}</button>
}

describe('release-note UI', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    } })
  })

  it('renders a modal dialog, traps focus, handles Escape, and changes language immediately', async () => {
    window.localStorage.setItem('apex:language', 'en')
    const container = document.createElement('div')
    document.body.append(container)
    const done = vi.fn(async () => {})
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><LanguageButton /><WhatsNewDialog releases={[releaseCatalog.releases[0]]} onDone={done} onViewAll={async () => {}} /></I18nProvider>))
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.textContent).toContain('Truthful, readable race-engineering surfaces')
    const buttons = [...container.querySelectorAll('button')]
    expect(document.activeElement).toBe(buttons[1])
    await act(async () => buttons[0].click())
    expect(container.textContent).toContain('Wahrheitsgetreue, lesbare Renningenieur-Ansichten')
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(done).toHaveBeenCalledOnce()
    await act(async () => root.unmount())
    container.remove()
  })

  it('keeps the complete bundled history available offline', async () => {
    window.localStorage.setItem('apex:language', 'en')
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><ReleaseHistory /></I18nProvider>))
    expect(container.querySelectorAll('details')).toHaveLength(releaseCatalog.releases.length)
    expect(container.textContent).toContain('v0.4.2')
    expect(container.textContent).toContain('v0.3.2')
    expect(container.textContent).toContain('v0.1.0')
    await act(async () => root.unmount())
    container.remove()
  })

  it('keeps the dialog open and reports an acknowledgement failure', async () => {
    window.localStorage.setItem('apex:language', 'en')
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><WhatsNewDialog releases={[releaseCatalog.releases[0]]} onDone={async () => { throw new Error('disk full') }} onViewAll={async () => {}} /></I18nProvider>))
    const done = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Done')!
    await act(async () => done.click())
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not save')
    await act(async () => root.unmount())
    container.remove()
  })
})
