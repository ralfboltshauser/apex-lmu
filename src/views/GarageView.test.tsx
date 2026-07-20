import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { GarageView } from './GarageView'

const ready: ApexGarageStats = {
  status: 'ready', schemaVersion: 1, catalogVersion: 1, trackedSince: '2026-07-01T00:00:00Z', totalDistanceMm: 8_000_000, totalDrives: 3, omittedModels: 0,
  models: [{
    id: 'hypercar-porsche-963', recognized: true, name: 'Porsche 963', manufacturer: 'Porsche', className: 'Hypercar', distanceMm: 8_000_000,
    unattributedDistanceMm: 500_000, drives: 3, firstDrivenAt: '2026-07-01T00:00:00Z', lastDrivenAt: '2026-07-04T00:00:00Z', variantCount: 2, trackCount: 2, omittedTracks: 0,
    tracks: [
      { name: 'Circuit de la Sarthe with a deliberately long localized layout label', distanceMm: 4_000_000, drives: 1, firstDrivenAt: '2026-07-04T00:00:00Z', lastDrivenAt: '2026-07-04T00:00:00Z' },
      { name: 'Spa-Francorchamps', distanceMm: 3_500_000, drives: 2, firstDrivenAt: '2026-07-01T00:00:00Z', lastDrivenAt: '2026-07-02T00:00:00Z' },
    ],
  }, {
    id: 'raw:unknown', recognized: false, name: 'Future Private Prototype', manufacturer: null, className: 'Hypercar', distanceMm: 0,
    unattributedDistanceMm: 0, drives: 0, firstDrivenAt: '2026-07-05T00:00:00Z', lastDrivenAt: '2026-07-05T00:00:00Z', variantCount: 1, trackCount: 0, omittedTracks: 0, tracks: [],
  }],
}

describe('GarageView', () => {
  afterEach(() => { delete window.apexDesktop; document.body.innerHTML = '' })

  it('renders reconciled models, reviewed grouping, unknown truth and track details', async () => {
    const values = new Map<string, string>([['apex:language', 'en']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
    window.apexDesktop = { getGarageStats: vi.fn(async () => ready), reportError: vi.fn(async () => ({ ok: true })) } as unknown as ApexDesktopApi
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><GarageView onOpenSettings={() => {}} /></I18nProvider>))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(container.textContent).toContain('8 km')
    expect(container.textContent).toContain('Porsche 963')
    expect(container.textContent).toContain('2 recorded variants grouped')
    expect(container.textContent).toContain('Future Private Prototype')
    expect(container.textContent).toContain('Unrecognized LMU label')
    expect(container.textContent).toContain('Circuit de la Sarthe with a deliberately long localized layout label')
    expect(container.textContent).toContain('Unattributed ledger adjustment: 0.5 km')
    expect(container.querySelector('[data-feedback-redact="measured-lifetime-stats"]')).not.toBeNull()
    const modelButton = container.querySelector<HTMLButtonElement>('.garage-model__toggle')!
    expect(modelButton.getAttribute('aria-expanded')).toBe('true')
    await act(async () => modelButton.click())
    expect(modelButton.getAttribute('aria-expanded')).toBe('false')
    await act(async () => root.unmount())
  })

  it('keeps future-schema state read-only and links to recovery controls', async () => {
    window.apexDesktop = { getGarageStats: vi.fn(async () => ({ ...ready, status: 'future-schema' as const, schemaVersion: 99, totalDistanceMm: 0, totalDrives: 0, models: [] })), reportError: vi.fn(async () => ({ ok: true })) } as unknown as ApexDesktopApi
    const openSettings = vi.fn()
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><GarageView onOpenSettings={openSettings} /></I18nProvider>))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(container.textContent).toContain('newer Apex version')
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Data & storage'))!
    await act(async () => button.click())
    expect(openSettings).toHaveBeenCalledOnce()
    await act(async () => root.unmount())
  })

  it('contains an incompatible Garage response instead of crashing the view', async () => {
    const reportError = vi.fn(async () => ({ ok: true }))
    window.apexDesktop = {
      getGarageStats: vi.fn(async () => ({ ...ready, models: [{ ...ready.models[0], tracks: null }] })),
      reportError,
    } as unknown as ApexDesktopApi
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><GarageView onOpenSettings={() => {}} /></I18nProvider>))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(container.textContent).toContain('Garage history needs attention')
    expect(container.textContent).not.toContain('Porsche 963')
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ context: 'garage-stats' }))
    await act(async () => root.unmount())
  })

  it('contains an unexpected Garage render failure and keeps recovery controls usable', async () => {
    const reportError = vi.fn(async () => ({ ok: true }))
    let reads = 0
    const model = { ...ready.models[0] }
    Object.defineProperty(model, 'distanceMm', { enumerable: true, get: () => {
      reads += 1
      if (reads > 1) throw new Error('simulated Garage renderer failure')
      return ready.models[0].distanceMm
    } })
    window.apexDesktop = { getGarageStats: vi.fn(async () => ({ ...ready, models: [model] })), reportError } as unknown as ApexDesktopApi
    const openSettings = vi.fn()
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><GarageView onOpenSettings={openSettings} /></I18nProvider>))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(container.textContent).toContain('Garage history needs attention')
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Data & storage'))!
    await act(async () => button.click())
    expect(openSettings).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ context: 'garage-render' }))
    await act(async () => root.unmount())
  })
})
