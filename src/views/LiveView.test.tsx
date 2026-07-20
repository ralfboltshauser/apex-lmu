import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { takeSimulationFrames } from '../core/simulation'
import { LIVE_LAYOUT_STORAGE_KEY } from '../live-layout'
import { LiveView } from './LiveView'

type StorageHarness = ReturnType<typeof installStorage>

function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
    values,
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  return storage
}

async function renderLive(storage: StorageHarness, props: Partial<Parameters<typeof LiveView>[0]> = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(<I18nProvider><LiveView source="demo" tick={1} onStartDemo={() => {}} onTroubleshoot={() => {}} {...props} /></I18nProvider>)
  })
  return {
    container,
    root,
    storage,
    unmount: async () => { await act(async () => root.unmount()); container.remove() },
  }
}

function moduleOrder(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-live-module]')].map((module) => module.dataset.liveModule)
}

async function click(element: Element | null) {
  if (!(element instanceof HTMLElement)) throw new Error('Expected a clickable element.')
  await act(async () => element.click())
}

describe('truthful measured Live view', () => {
  it('renders an unavailable session kind as Session instead of inventing Race', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const storage = installStorage({ 'apex:language': 'de' })
    const simulated = takeSimulationFrames(1, { sessionId: 'unknown-session' })[0]!
    const frame = {
      ...simulated,
      source: 'lmu-shared-memory' as const,
      sourceState: 'session-only' as const,
      session: { ...simulated.session, kind: 'unknown' as const },
    }
    const view = await renderLive(storage, { source: 'live', frame })

    expect(view.container.querySelector('.live-titlebar__identity p')?.textContent).toContain('· Sitzung ·')
    expect(view.container.querySelector('.live-titlebar__identity p')?.textContent).not.toContain('· Rennen ·')
    expect(view.container.textContent).toContain('Verfügbar, sobald LMU das Spielerfahrzeug aktiviert')
    expect(view.container.textContent).toContain('Warte auf Auto')
    expect(view.container.querySelector('.live-titlebar [data-live-module]')).toBeNull()

    await view.unmount()
  })
})

describe('customizable Live dashboard', () => {
  beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
  afterEach(() => { delete window.apexDesktop; document.body.innerHTML = '' })

  it('reorders with keyboard controls, persists DOM order and follows focus', async () => {
    const storage = installStorage({ 'apex:language': 'en' })
    const view = await renderLive(storage)
    await click([...view.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Edit layout')) ?? null)

    expect(moduleOrder(view.container)).toEqual(['track-map', 'fuel', 'standings', 'car-state', 'events'])
    await click(view.container.querySelector('[aria-label="Move Track map after"]'))

    expect(moduleOrder(view.container)).toEqual(['fuel', 'track-map', 'standings', 'car-state', 'events'])
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Drag Track map to reorder')
    expect(view.container.querySelector('[aria-live]')?.textContent).toContain('Track map, position 2 of 5')
    expect(JSON.parse(storage.values.get(LIVE_LAYOUT_STORAGE_KEY)!).modules.map((module: { id: string }) => module.id)).toEqual(['fuel', 'track-map', 'standings', 'car-state', 'events'])

    await view.unmount()
    const restarted = await renderLive(storage)
    expect(moduleOrder(restarted.container)).toEqual(['fuel', 'track-map', 'standings', 'car-state', 'events'])
    expect(restarted.container.querySelector('.live-module-controls')).toBeNull()
    await restarted.unmount()
  })

  it('reorders only after a completed pointer gesture', async () => {
    const storage = installStorage({ 'apex:language': 'en' })
    const view = await renderLive(storage)
    await click([...view.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Edit layout')) ?? null)
    const handle = view.container.querySelector('[aria-label="Drag Track map to reorder"]')!
    const target = view.container.querySelector('[data-live-module="standings"]')!
    const originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = vi.fn(() => target)
    const pointer = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, { pointerId: { value: 1 }, button: { value: 0 }, clientX: { value: 10 }, clientY: { value: 10 } })
      return event
    }

    await act(async () => handle.dispatchEvent(pointer('pointerdown')))
    await act(async () => handle.dispatchEvent(pointer('pointermove')))
    expect(moduleOrder(view.container)).toEqual(['track-map', 'fuel', 'standings', 'car-state', 'events'])
    expect(storage.values.get(LIVE_LAYOUT_STORAGE_KEY)).toBeUndefined()
    await act(async () => handle.dispatchEvent(pointer('pointerup')))

    expect(moduleOrder(view.container)).toEqual(['fuel', 'standings', 'track-map', 'car-state', 'events'])
    expect(storage.setItem.mock.calls.filter(([key]) => key === LIVE_LAYOUT_STORAGE_KEY)).toHaveLength(1)
    document.elementFromPoint = originalElementFromPoint
    await view.unmount()
  })

  it('resizes, hides, restores and atomically resets a card', async () => {
    const storage = installStorage({ 'apex:language': 'en' })
    const view = await renderLive(storage)
    await click([...view.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Edit layout')) ?? null)
    await click(view.container.querySelector('[aria-label="Make Fuel wide"]'))
    expect(view.container.querySelector('[data-live-module="fuel"]')?.getAttribute('data-span')).toBe('wide')

    await click(view.container.querySelector('[aria-label="Hide Fuel"]'))
    expect(view.container.querySelector('[data-live-module="fuel"]')).toBeNull()
    expect(view.container.textContent).toContain('Hidden cards')
    await click([...view.container.querySelectorAll('.live-hidden-modules button')].find((button) => button.textContent?.includes('Restore Fuel')) ?? null)
    expect(view.container.querySelector('[data-live-module="fuel"]')).not.toBeNull()

    await click([...view.container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Reset') ?? null)
    expect(view.container.textContent).toContain('Restore the shipped Live layout?')
    await click([...view.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Restore default')) ?? null)
    expect(storage.removeItem).toHaveBeenCalledWith(LIVE_LAYOUT_STORAGE_KEY)
    expect(view.container.querySelector('[data-live-module="fuel"]')?.getAttribute('data-span')).toBe('compact')
    expect(moduleOrder(view.container)).toEqual(['track-map', 'fuel', 'standings', 'car-state', 'events'])
    await view.unmount()
  })

  it('uses one stored order for demo and measured renderers without changing provenance', async () => {
    const stored = { version: 1, modules: [
      { id: 'events', visible: true, span: 'wide' },
      { id: 'fuel', visible: false, span: 'compact' },
      { id: 'track-map', visible: true, span: 'compact' },
      { id: 'car-state', visible: true, span: 'compact' },
      { id: 'standings', visible: true, span: 'wide' },
    ] }
    const storage = installStorage({ 'apex:language': 'en', [LIVE_LAYOUT_STORAGE_KEY]: JSON.stringify(stored) })
    const demo = await renderLive(storage)
    expect(moduleOrder(demo.container)).toEqual(['events', 'track-map', 'car-state', 'standings'])
    expect(demo.container.textContent).toContain('Generated demo')
    await demo.unmount()

    const frame = { ...takeSimulationFrames(1)[0]!, source: 'lmu-shared-memory' as const }
    const measured = await renderLive(storage, { source: 'live', frame })
    expect(moduleOrder(measured.container)).toEqual(['events', 'track-map', 'car-state', 'standings'])
    expect(measured.container.textContent).toContain('Measured live data')
    expect(measured.container.textContent).not.toContain('Generated demo')
    await measured.unmount()
  })

  it('recovers corrupted storage with a bounded diagnostic that excludes the payload', async () => {
    const privatePayload = '{private-driver-name'
    const storage = installStorage({ 'apex:language': 'en', [LIVE_LAYOUT_STORAGE_KEY]: privatePayload })
    const reportError = vi.fn(async () => ({ ok: true }))
    window.apexDesktop = { reportError } as unknown as ApexDesktopApi
    const view = await renderLive(storage)

    expect(moduleOrder(view.container)).toEqual(['track-map', 'fuel', 'standings', 'car-state', 'events'])
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ context: 'live-layout-storage' }))
    expect(JSON.stringify(reportError.mock.calls)).not.toContain(privatePayload)
    await view.unmount()
  })
})
