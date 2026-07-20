export const LIVE_LAYOUT_STORAGE_KEY = 'apex:live-layout:v1'

export type LiveModuleId = 'track-map' | 'fuel' | 'standings' | 'car-state' | 'events'
export type LiveModuleSpan = 'compact' | 'wide'

export interface LiveDashboardModule {
  readonly id: LiveModuleId
  readonly visible: boolean
  readonly span: LiveModuleSpan
}

export interface LiveDashboardLayoutV1 {
  readonly version: 1
  readonly modules: readonly LiveDashboardModule[]
}

export interface LiveModuleDescriptor {
  readonly id: LiveModuleId
  readonly titleKey: 'trackMap' | 'fuel' | 'standings' | 'carState' | 'events'
  readonly defaultVisible: boolean
  readonly defaultSpan: LiveModuleSpan
  readonly canHide: boolean
  readonly canResize: boolean
}

export type LiveLayoutRecoveryReason = 'invalid-json' | 'invalid-root' | 'unsupported-version' | 'invalid-modules' | 'storage-read'

export interface LoadedLiveDashboardLayout {
  readonly layout: LiveDashboardLayoutV1
  readonly recoveredFrom: LiveLayoutRecoveryReason | null
}

export const LIVE_MODULE_DESCRIPTORS: readonly LiveModuleDescriptor[] = [
  { id: 'track-map', titleKey: 'trackMap', defaultVisible: true, defaultSpan: 'compact', canHide: true, canResize: true },
  { id: 'fuel', titleKey: 'fuel', defaultVisible: true, defaultSpan: 'compact', canHide: true, canResize: true },
  { id: 'standings', titleKey: 'standings', defaultVisible: true, defaultSpan: 'wide', canHide: true, canResize: true },
  { id: 'car-state', titleKey: 'carState', defaultVisible: true, defaultSpan: 'compact', canHide: true, canResize: true },
  { id: 'events', titleKey: 'events', defaultVisible: true, defaultSpan: 'compact', canHide: true, canResize: true },
]

export const LIVE_MODULE_DEFAULTS: readonly LiveDashboardModule[] = LIVE_MODULE_DESCRIPTORS.map((descriptor) => ({
  id: descriptor.id,
  visible: descriptor.defaultVisible,
  span: descriptor.defaultSpan,
}))

const knownIds = new Set<LiveModuleId>(LIVE_MODULE_DEFAULTS.map((module) => module.id))

function defaults(): LiveDashboardLayoutV1 {
  return { version: 1, modules: LIVE_MODULE_DEFAULTS.map((module) => ({ ...module })) }
}

function recovered(recoveredFrom: LiveLayoutRecoveryReason): LoadedLiveDashboardLayout {
  return { layout: defaults(), recoveredFrom }
}

export function parseLiveDashboardLayout(raw: string | null): LoadedLiveDashboardLayout {
  if (raw === null) return { layout: defaults(), recoveredFrom: null }

  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return recovered('invalid-json') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return recovered('invalid-root')

  const record = parsed as Record<string, unknown>
  if (record.version !== 1) return recovered('unsupported-version')
  if (!Array.isArray(record.modules)) return recovered('invalid-modules')

  const seenIds = new Set<string>()
  const seen = new Set<LiveModuleId>()
  const modules: LiveDashboardModule[] = []
  for (const candidate of record.modules) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return recovered('invalid-modules')
    const module = candidate as Record<string, unknown>
    if (typeof module.id !== 'string') return recovered('invalid-modules')
    if (seenIds.has(module.id)) return recovered('invalid-modules')
    seenIds.add(module.id)
    if (!knownIds.has(module.id as LiveModuleId)) continue

    const id = module.id as LiveModuleId
    if (typeof module.visible !== 'boolean' || (module.span !== 'compact' && module.span !== 'wide')) return recovered('invalid-modules')
    seen.add(id)
    modules.push({ id, visible: module.visible, span: module.span })
  }

  for (const module of LIVE_MODULE_DEFAULTS) {
    if (!seen.has(module.id)) modules.push({ ...module })
  }
  return { layout: { version: 1, modules }, recoveredFrom: null }
}

export function loadLiveDashboardLayout(storage: Pick<Storage, 'getItem'> = window.localStorage): LoadedLiveDashboardLayout {
  try { return parseLiveDashboardLayout(storage.getItem(LIVE_LAYOUT_STORAGE_KEY)) }
  catch { return recovered('storage-read') }
}

export function saveLiveDashboardLayout(layout: LiveDashboardLayoutV1, storage: Pick<Storage, 'setItem'> = window.localStorage) {
  storage.setItem(LIVE_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}

export function resetLiveDashboardLayout(storage: Pick<Storage, 'removeItem'> = window.localStorage): LiveDashboardLayoutV1 {
  storage.removeItem(LIVE_LAYOUT_STORAGE_KEY)
  return defaults()
}

export function updateLiveDashboardModule(layout: LiveDashboardLayoutV1, id: LiveModuleId, patch: Partial<Pick<LiveDashboardModule, 'visible' | 'span'>>): LiveDashboardLayoutV1 {
  return { version: 1, modules: layout.modules.map((module) => module.id === id ? { ...module, ...patch } : module) }
}

export function moveLiveDashboardModule(layout: LiveDashboardLayoutV1, id: LiveModuleId, toIndex: number): LiveDashboardLayoutV1 {
  const fromIndex = layout.modules.findIndex((module) => module.id === id)
  if (fromIndex < 0) return layout
  const boundedIndex = Math.max(0, Math.min(layout.modules.length - 1, toIndex))
  if (fromIndex === boundedIndex) return layout
  const modules = [...layout.modules]
  const [module] = modules.splice(fromIndex, 1)
  modules.splice(boundedIndex, 0, module!)
  return { version: 1, modules }
}

export function isDefaultLiveDashboardLayout(layout: LiveDashboardLayoutV1) {
  return layout.modules.length === LIVE_MODULE_DEFAULTS.length && layout.modules.every((module, index) => {
    const expected = LIVE_MODULE_DEFAULTS[index]
    return expected?.id === module.id && expected.visible === module.visible && expected.span === module.span
  })
}
