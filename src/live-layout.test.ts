import {
  LIVE_LAYOUT_STORAGE_KEY,
  LIVE_MODULE_DEFAULTS,
  isDefaultLiveDashboardLayout,
  loadLiveDashboardLayout,
  moveLiveDashboardModule,
  parseLiveDashboardLayout,
  resetLiveDashboardLayout,
  saveLiveDashboardLayout,
  updateLiveDashboardModule,
} from './live-layout'

describe('Live dashboard layout persistence', () => {
  it('ships a valid default with each known module exactly once', () => {
    const loaded = parseLiveDashboardLayout(null)
    expect(loaded.recoveredFrom).toBeNull()
    expect(loaded.layout.version).toBe(1)
    expect(new Set(loaded.layout.modules.map((module) => module.id)).size).toBe(LIVE_MODULE_DEFAULTS.length)
    expect(isDefaultLiveDashboardLayout(loaded.layout)).toBe(true)
  })

  it('round-trips order, visibility and span', () => {
    let layout = parseLiveDashboardLayout(null).layout
    layout = moveLiveDashboardModule(layout, 'events', 0)
    layout = updateLiveDashboardModule(layout, 'fuel', { visible: false, span: 'wide' })
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    saveLiveDashboardLayout(layout, storage)
    expect(loadLiveDashboardLayout(storage)).toEqual({ layout, recoveredFrom: null })
  })

  it.each([
    ['invalid-json', '{'],
    ['invalid-root', '[]'],
    ['unsupported-version', JSON.stringify({ version: 2, modules: [] })],
    ['invalid-modules', JSON.stringify({ version: 1, modules: 'nope' })],
    ['invalid-modules', JSON.stringify({ version: 1, modules: [{ id: 'fuel', visible: true, span: 'compact' }, { id: 'fuel', visible: false, span: 'wide' }] })],
    ['invalid-modules', JSON.stringify({ version: 1, modules: [{ id: 'future-card' }, { id: 'future-card' }] })],
    ['invalid-modules', JSON.stringify({ version: 1, modules: [{ id: 'fuel', visible: 'yes', span: 'compact' }] })],
    ['invalid-modules', JSON.stringify({ version: 1, modules: [{ id: 'fuel', visible: true, span: 'huge' }] })],
  ])('recovers defaults for %s input', (reason, raw) => {
    const loaded = parseLiveDashboardLayout(raw)
    expect(loaded.recoveredFrom).toBe(reason)
    expect(isDefaultLiveDashboardLayout(loaded.layout)).toBe(true)
  })

  it('ignores unknown future IDs and appends missing current defaults', () => {
    const loaded = parseLiveDashboardLayout(JSON.stringify({ version: 1, modules: [
      { id: 'future-weather', visible: 'unknown fields are ignored' },
      { id: 'fuel', visible: false, span: 'wide' },
    ] }))
    expect(loaded.recoveredFrom).toBeNull()
    expect(loaded.layout.modules.map((module) => module.id)).toEqual(['fuel', 'track-map', 'standings', 'car-state', 'events'])
    expect(loaded.layout.modules[0]).toEqual({ id: 'fuel', visible: false, span: 'wide' })
  })

  it('reset removes only the versioned Live layout key', () => {
    const values = new Map([[LIVE_LAYOUT_STORAGE_KEY, 'layout'], ['apex:other', 'keep']])
    const layout = resetLiveDashboardLayout({ removeItem: (key) => values.delete(key) })
    expect(values.get(LIVE_LAYOUT_STORAGE_KEY)).toBeUndefined()
    expect(values.get('apex:other')).toBe('keep')
    expect(isDefaultLiveDashboardLayout(layout)).toBe(true)
  })
})
