import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { OverlaysView } from './OverlaysView'

const bounds = (x: number, width: number) => ({ x, y: 0, width, height: 1080 })
const widgetBounds = {
  relative: { x: 0.014, y: 0.025, width: 0.168, height: 0.23 },
  delta: { x: 0.436, y: 0.025, width: 0.128, height: 0.105 },
  inputs: { x: 0.826, y: 0.855, width: 0.16, height: 0.12 },
  fuel: { x: 0.826, y: 0.025, width: 0.16, height: 0.13 },
}

describe('overlay studio desktop contract', () => {
  it('lists real display geometry and only persists supported controls', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const values = new Map<string, string>([['apex:language', 'en']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size } } })
    const setConfig = vi.fn(async (patch) => ({ version: 1 as const, displayId: '2', displayFingerprint: null, opacity: 0.92, clickThrough: true, widgets: (['relative', 'delta', 'inputs', 'fuel'] as const).map((id) => ({ id, enabled: true, bounds: widgetBounds[id] })), ...patch }))
    const closeOverlay = vi.fn(async () => ({ ok: true, state: { status: 'closed' as const, displayId: null, message: '', fallbackFrom: null } }))
    window.apexDesktop = {
      getDisplays: vi.fn(async () => [
        { id: '1', label: 'Primary', bounds: bounds(0, 1920), workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1, rotation: 0 as const, primary: true },
        { id: '2', label: 'Portrait', bounds: bounds(-1440, 1440), workArea: { x: -1440, y: 0, width: 1440, height: 1040 }, scaleFactor: 1.5, rotation: 90 as const, primary: false },
      ]),
      getOverlayConfig: vi.fn(async () => ({ version: 1 as const, displayId: '1', displayFingerprint: null, opacity: 0.92, clickThrough: true, widgets: (['relative', 'delta', 'inputs', 'fuel'] as const).map((id) => ({ id, enabled: true, bounds: widgetBounds[id] })) })),
      getOverlayState: vi.fn(async () => ({ status: 'ready' as const, displayId: '1', message: '', fallbackFrom: null })),
      setOverlayConfig: setConfig,
      closeOverlay,
      onDisplaysChanged: vi.fn(() => () => {}),
      onOverlayState: vi.fn(() => () => {}),
      onOverlayConfig: vi.fn(() => () => {}),
    } as unknown as ApexDesktopApi
    const openOverlay = vi.fn()
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><OverlaysView onOpenOverlay={openOverlay} /></I18nProvider>))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

    const select = container.querySelector<HTMLSelectElement>('.overlay-display-select select')!
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Primary · 1920×1080 · 100% · 0° · Primary',
      'Portrait · 1440×1080 · 150% · 90°',
    ])
    await act(async () => { select.value = '2'; select.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve() })
    expect(setConfig).toHaveBeenCalledWith({ displayId: '2' })

    const radar = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Radar'))!
    expect(radar.querySelector('[role="switch"]')?.getAttribute('aria-disabled')).toBe('true')
    expect(radar.textContent).toContain('Unavailable: LMU does not expose a validated data source yet')

    const guidance = container.querySelector('.overlay-guidance')!
    expect(guidance.textContent).toContain('Overlay only visible after Alt+Tab?')
    expect(guidance.textContent).toContain('set LMU to Borderless (recommended) or Windowed, then reopen the overlay')
    expect(guidance.textContent).toContain('a local non-injected overlay cannot appear there')

    const show = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Show overlay'))!
    await act(async () => show.click())
    expect(openOverlay).toHaveBeenCalledOnce()
    const close = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Close overlay'))!
    await act(async () => { close.click(); await Promise.resolve() })
    expect(closeOverlay).toHaveBeenCalledOnce()

    await act(async () => root.unmount())
    delete window.apexDesktop
    container.remove()
  })
})
