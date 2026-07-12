import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { SettingsView } from './SettingsView'

describe('overlay settings evidence', () => {
  it('shows live display/window health and truthful permission/fullscreen guidance', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const values = new Map<string, string>([['apex:language', 'en'], ['apex:settings-section', 'connection']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size } } })
    window.apexDesktop = {
      getEnvironment: vi.fn(async () => ({ platform: 'win32', version: '0.1.14', userDataPath: 'C:\\Apex', bridgeAvailable: true, defaultLmuPath: '' })),
      discoverLmu: vi.fn(async () => ({ found: null, attempts: [], trace: [], expectations: { appId: '2399420', manifest: '', installFolder: '', executables: [] } })),
      getDiagnostics: vi.fn(async () => ({ generatedAt: '2026-07-13T00:00:00Z', checks: [], logs: '' })),
      getLifetimeStats: vi.fn(async () => ({ status: 'ready' as const, schemaVersion: 1, trackedSince: '2026-07-13T00:00:00Z', totalDistanceMm: 0, vehicles: [] })),
      getLifetimeStatsHealth: vi.fn(async () => ({ status: 'ready' as const, schemaVersion: 1, path: 'C:\\Apex\\data\\apex.sqlite3', lastBackup: null })),
      getUpdateState: vi.fn(async () => ({ status: 'idle' as const, currentVersion: '0.1.14', availableVersion: null, progress: null, message: '', releaseNotes: '', releaseUrl: '' })),
      onUpdateState: vi.fn(() => () => {}),
      getRecordingState: vi.fn(async () => ({ status: 'idle' as const, path: null, frames: 0, bytes: 0, durationSeconds: 0, message: '' })),
      onRecordingState: vi.fn(() => () => {}),
      getDisplays: vi.fn(async () => [
        { id: '1', label: 'Primary', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1, rotation: 0 as const, primary: true },
        { id: '2', label: 'Portrait', bounds: { x: -1440, y: 0, width: 1440, height: 2560 }, workArea: { x: -1440, y: 0, width: 1440, height: 2520 }, scaleFactor: 1.5, rotation: 90 as const, primary: false },
      ]),
      getOverlayState: vi.fn(async () => ({ status: 'ready' as const, displayId: '2', message: '', fallbackFrom: null })),
      onDisplaysChanged: vi.fn(() => () => {}),
      onOverlayState: vi.fn(() => () => {}),
    } as unknown as ApexDesktopApi

    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><SettingsView /></I18nProvider>))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(container.textContent).toContain('No capture permission needed')
    expect(container.textContent).toContain('2 detected')
    expect(container.textContent).toContain('Target: Portrait')
    expect(container.textContent).toContain('Visible')
    expect(container.textContent).toContain('Use borderless or windowed LMU')

    await act(async () => root.unmount())
    delete window.apexDesktop
    container.remove()
  })
})
