import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { takeSimulationFrames } from '../core/simulation'
import { LiveView } from './LiveView'

describe('truthful measured Live view', () => {
  it('renders an unavailable session kind as Session instead of inventing Race', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const values = new Map([['apex:language', 'de']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } })
    const simulated = takeSimulationFrames(1, { sessionId: 'unknown-session' })[0]!
    const frame = {
      ...simulated,
      source: 'lmu-shared-memory' as const,
      sourceState: 'session-only' as const,
      session: { ...simulated.session, kind: 'unknown' as const },
    }
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(
      <I18nProvider>
        <LiveView source="live" tick={1} frame={frame} onStartDemo={() => {}} onTroubleshoot={() => {}} />
      </I18nProvider>,
    ))

    expect(container.querySelector('.live-titlebar__identity p')?.textContent).toContain('· Sitzung ·')
    expect(container.querySelector('.live-titlebar__identity p')?.textContent).not.toContain('· Rennen ·')
    expect(container.textContent).toContain('Verfügbar, sobald LMU das Spielerfahrzeug aktiviert')
    expect(container.textContent).toContain('Warte auf Auto')

    await act(async () => root.unmount()); container.remove()
  })
})
