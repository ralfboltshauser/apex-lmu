import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './i18n'

describe('post-update reveal integration', () => {
  beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
  afterAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false })

  it('waits until onboarding is complete, then acknowledges the highest displayed version only after Done', async () => {
    const storage = new Map<string, string>([['apex:language', 'en'], ['apex:onboarded', 'true']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() { return storage.size },
    } })
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() })
    const acknowledge = vi.fn(async (version: string) => ({ ok: true, state: { schemaVersion: 1 as const, currentVersion: version, firstSeenVersion: version, lastAcknowledgedVersion: version } }))
    window.apexDesktop = {
      getWhatsNewState: vi.fn(async () => ({ schemaVersion: 1 as const, currentVersion: '0.1.14', firstSeenVersion: '0.1.12', lastAcknowledgedVersion: '0.1.12' })),
      acknowledgeWhatsNew: acknowledge,
      getEnvironment: vi.fn(async () => ({ platform: 'linux', version: '0.1.14', userDataPath: '/tmp/apex-test', bridgeAvailable: false, defaultLmuPath: '' })),
      stopTelemetry: vi.fn(async () => ({ ok: true })),
      onUpdateState: vi.fn(() => () => {}),
      reportError: vi.fn(async () => ({ ok: true })),
    } as unknown as ApexDesktopApi
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><App /></I18nProvider>))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(container.querySelector('.whats-new-backdrop[role="dialog"]')).not.toBeNull()
    expect(container.textContent).toContain('2 new releases')
    expect(acknowledge).not.toHaveBeenCalled()
    const done = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Done')!
    await act(async () => done.click())
    expect(acknowledge).toHaveBeenCalledWith('0.1.14')
    expect(container.querySelector('.whats-new-backdrop[role="dialog"]')).toBeNull()
    await act(async () => root.unmount())
    delete window.apexDesktop
    container.remove()
  })
})
