import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { SettingsView } from './SettingsView'

describe('lifetime statistics settings', () => {
  it('shows truthful tracked-since totals, per-model sessions, coverage, and verified backup feedback', async () => {
    const values = new Map<string, string>([['apex:language', 'en'], ['apex:settings-section', 'data']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size } } })
    const backup = vi.fn(async () => ({ ok: true, backup: { file: 'apex-manual.sqlite3', bytes: 4096, sha256: 'abc', createdAt: '2026-07-12T20:00:00Z' } }))
    window.apexDesktop = {
      getEnvironment: vi.fn(async () => ({ platform: 'win32', version: '0.1.14', userDataPath: 'C:\\Apex', bridgeAvailable: true, defaultLmuPath: '' })),
      discoverLmu: vi.fn(async () => ({ found: null, attempts: [], trace: [], expectations: { appId: '2399420', manifest: '', installFolder: '', executables: [] } })),
      getDiagnostics: vi.fn(async () => ({ generatedAt: '2026-07-12T20:00:00Z', checks: [], logs: '' })),
      getLifetimeStats: vi.fn(async () => ({ status: 'ready' as const, schemaVersion: 1, algorithmVersion: 'v1', trackedSince: '2026-07-01T00:00:00Z', totalDistanceMm: 12_345_000, vehicles: [{ id: 'vehicle-1', name: 'Lexus RC F GT3', className: 'GT3', distanceMm: 12_345_000, sessions: 3, firstSeenAt: '2026-07-01T00:00:00Z', lastSeenAt: '2026-07-12T00:00:00Z' }] })),
      getLifetimeStatsHealth: vi.fn(async () => ({ status: 'ready' as const, schemaVersion: 1, algorithmVersion: 'v1', path: 'C:\\Apex\\data\\apex.sqlite3', lastBackup: { file: 'apex-schema.sqlite3', bytes: 2048, sha256: '0123456789abcdef', createdAt: '2026-07-01T00:00:00Z' } })),
      backupLifetimeStats: backup,
      getUpdateState: vi.fn(async () => ({ status: 'idle', currentVersion: '0.1.14', availableVersion: null, progress: null, message: '', releaseNotes: '', releaseUrl: '' })),
      onUpdateState: vi.fn(() => () => {}),
      getRecordingState: vi.fn(async () => ({ status: 'idle', path: null, frames: 0, bytes: 0, durationSeconds: 0, message: '' })),
      onRecordingState: vi.fn(() => () => {}),
      getDisplays: vi.fn(async () => [{ id: '1', label: 'Primary display', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1, rotation: 0, primary: true }]),
      getOverlayState: vi.fn(async () => ({ status: 'closed' as const, displayId: '1', message: '', fallbackFrom: null })),
      onDisplaysChanged: vi.fn(() => () => {}),
      onOverlayState: vi.fn(() => () => {}),
    } as unknown as ApexDesktopApi
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><SettingsView /></I18nProvider>))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(container.textContent).toContain('12.35 km')
    expect(container.textContent).toContain('Lexus RC F GT3')
    expect(container.textContent).toContain('3 local sessions')
    expect(container.textContent).toContain('Last driven')
    expect(container.textContent).toContain('C:\\Apex\\data\\apex.sqlite3')
    expect(container.textContent).toContain('apex-schema.sqlite3')
    expect(container.textContent).toContain('0123456789ab…')
    expect(container.textContent).toContain('Demo, self-test, replay, AI, remote control')
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Create verified backup'))!
    await act(async () => button.click())
    expect(backup).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('Verified backup created: apex-manual.sqlite3')
    await act(async () => root.unmount()); delete window.apexDesktop; container.remove()
  })
})
