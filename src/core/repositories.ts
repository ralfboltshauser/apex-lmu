import {
  VersionedLocalRepository,
  type RepositoryIssue,
  type StorageLike,
} from './storage'
import type {
  AppSettings,
  RecordedSession,
  SessionListItem,
  SetupDocument,
  SetupMetadata,
  SetupRevision,
} from './types'

export const SETTINGS_STORAGE_KEY = 'apex-lmu.settings'
export const SESSIONS_STORAGE_KEY = 'apex-lmu.sessions'
export const SETUPS_STORAGE_KEY = 'apex-lmu.setups'
export const SETTINGS_SCHEMA_VERSION = 2
export const SESSIONS_SCHEMA_VERSION = 2
export const SETUPS_SCHEMA_VERSION = 1

export const DEFAULT_SETTINGS: AppSettings = Object.freeze<AppSettings>({
  theme: 'dark',
  units: 'metric',
  telemetry: {
    autoRecord: true,
    sampleRateHz: 20,
    retainSessions: 40,
    recordOpponentSnapshots: true,
  },
  overlays: {
    enabled: true,
    clickThrough: true,
    widgets: [
      widget('relative', 'relative', 28, 160, 420, 330),
      widget('radar', 'radar', 680, 580, 300, 180),
      widget('fuel-energy', 'fuel-energy', 1_460, 210, 350, 250),
      widget('delta', 'delta', 760, 28, 400, 92),
    ],
  },
  coaching: {
    enabled: true,
    minimumConfidence: 0.72,
    voicePrompts: false,
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    colorVision: 'default',
  },
  privacy: {
    localOnly: true,
    diagnosticsEnabled: false,
  },
})

export interface RepositoryDependencies {
  readonly storage?: StorageLike
  readonly now?: () => Date
}

export class SettingsRepository {
  private readonly repository: VersionedLocalRepository<AppSettings>

  constructor(dependencies: RepositoryDependencies = {}) {
    this.repository = new VersionedLocalRepository<AppSettings>({
      key: SETTINGS_STORAGE_KEY,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      defaultValue: cloneDefaultSettings,
      validate: isAppSettings,
      migrations: {
        0: normaliseSettings,
        1: normaliseSettings,
      },
      ...dependencies,
    })
  }

  load(): AppSettings {
    return this.repository.load()
  }

  save(settings: AppSettings): AppSettings {
    return this.repository.save(settings)
  }

  update(updater: (settings: AppSettings) => AppSettings): AppSettings {
    return this.repository.update(updater)
  }

  reset(): AppSettings {
    this.repository.clear()
    return this.load()
  }

  subscribe(listener: (settings: AppSettings) => void): () => void {
    return this.repository.subscribe(listener)
  }

  exportJson(): string {
    return this.repository.exportJson()
  }

  importJson(serialized: string): AppSettings {
    return this.repository.importJson(serialized)
  }

  getLastIssue(): RepositoryIssue | null {
    return this.repository.getLastIssue()
  }
}

interface SessionStore {
  readonly order: readonly string[]
  readonly sessions: Readonly<Record<string, RecordedSession>>
}

export class SessionRepository {
  private readonly repository: VersionedLocalRepository<SessionStore>

  constructor(dependencies: RepositoryDependencies = {}) {
    this.repository = new VersionedLocalRepository<SessionStore>({
      key: SESSIONS_STORAGE_KEY,
      schemaVersion: SESSIONS_SCHEMA_VERSION,
      defaultValue: emptySessionStore,
      validate: isSessionStore,
      migrations: {
        0: migrateSessionArray,
        1: normaliseSessionStore,
      },
      ...dependencies,
    })
  }

  list(): readonly SessionListItem[] {
    const store = this.repository.load()
    return store.order.flatMap((id) => {
      const session = store.sessions[id]
      return session === undefined ? [] : [toSessionListItem(session)]
    })
  }

  get(id: string): RecordedSession | null {
    return this.repository.load().sessions[id] ?? null
  }

  save(session: RecordedSession): RecordedSession {
    if (!isRecordedSession(session)) throw new TypeError('Cannot save an invalid recorded session')
    this.repository.update((current) => {
      const sessions = { ...current.sessions, [session.descriptor.id]: session }
      const order = Object.values(sessions)
        .sort((left, right) => Date.parse(right.descriptor.startedAt) - Date.parse(left.descriptor.startedAt))
        .map((entry) => entry.descriptor.id)
      return { order, sessions }
    })
    return this.get(session.descriptor.id)!
  }

  delete(id: string): boolean {
    const current = this.repository.load()
    if (current.sessions[id] === undefined) return false
    const sessions = { ...current.sessions }
    delete sessions[id]
    this.repository.save({
      order: current.order.filter((sessionId) => sessionId !== id),
      sessions,
    })
    return true
  }

  /** Removes oldest sessions after the newest `maximumCount` entries. */
  prune(maximumCount: number): readonly string[] {
    if (!Number.isInteger(maximumCount) || maximumCount < 0) {
      throw new RangeError('maximumCount must be a non-negative integer')
    }
    const current = this.repository.load()
    const removedIds = current.order.slice(maximumCount)
    if (removedIds.length === 0) return []
    const retained = new Set(current.order.slice(0, maximumCount))
    const sessions = Object.fromEntries(
      Object.entries(current.sessions).filter(([id]) => retained.has(id)),
    )
    this.repository.save({ order: current.order.slice(0, maximumCount), sessions })
    return removedIds
  }

  clear(): void {
    this.repository.clear()
  }

  subscribe(listener: (sessions: readonly SessionListItem[]) => void): () => void {
    return this.repository.subscribe((store) => {
      listener(store.order.flatMap((id) => {
        const session = store.sessions[id]
        return session === undefined ? [] : [toSessionListItem(session)]
      }))
    })
  }

  exportJson(): string {
    return this.repository.exportJson()
  }

  importJson(serialized: string): readonly SessionListItem[] {
    this.repository.importJson(serialized)
    return this.list()
  }

  getLastIssue(): RepositoryIssue | null {
    return this.repository.getLastIssue()
  }
}

interface SetupStore {
  readonly order: readonly string[]
  readonly setups: Readonly<Record<string, SetupDocument>>
  readonly revisions: Readonly<Record<string, readonly SetupRevision[]>>
}

export class SetupRepository {
  private readonly repository: VersionedLocalRepository<SetupStore>

  constructor(dependencies: RepositoryDependencies = {}) {
    this.repository = new VersionedLocalRepository<SetupStore>({
      key: SETUPS_STORAGE_KEY,
      schemaVersion: SETUPS_SCHEMA_VERSION,
      defaultValue: emptySetupStore,
      validate: isSetupStore,
      ...dependencies,
    })
  }

  list(): readonly SetupMetadata[] {
    const store = this.repository.load()
    return store.order.flatMap((id) => {
      const setup = store.setups[id]
      return setup === undefined ? [] : [setup.metadata]
    })
  }

  get(id: string): SetupDocument | null {
    return this.repository.load().setups[id] ?? null
  }

  save(setup: SetupDocument): SetupDocument {
    if (!isSetupDocument(setup)) throw new TypeError('Cannot save an invalid setup document')
    this.repository.update((current) => {
      const setups = { ...current.setups, [setup.metadata.id]: setup }
      const order = Object.values(setups)
        .sort((left, right) => Date.parse(right.metadata.updatedAt) - Date.parse(left.metadata.updatedAt))
        .map((entry) => entry.metadata.id)
      return { ...current, order, setups }
    })
    return this.get(setup.metadata.id)!
  }

  delete(id: string): boolean {
    const current = this.repository.load()
    if (current.setups[id] === undefined) return false
    const setups = { ...current.setups }
    const revisions = { ...current.revisions }
    delete setups[id]
    delete revisions[id]
    this.repository.save({
      order: current.order.filter((setupId) => setupId !== id),
      setups,
      revisions,
    })
    return true
  }

  addRevision(revision: SetupRevision): readonly SetupRevision[] {
    if (!isSetupRevision(revision)) throw new TypeError('Cannot save an invalid setup revision')
    const current = this.repository.load()
    if (current.setups[revision.setupId] === undefined) {
      throw new Error(`Setup ${revision.setupId} does not exist`)
    }
    const next = [...(current.revisions[revision.setupId] ?? []), revision]
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    this.repository.save({
      ...current,
      revisions: { ...current.revisions, [revision.setupId]: next },
    })
    return this.revisionsFor(revision.setupId)
  }

  revisionsFor(setupId: string): readonly SetupRevision[] {
    return this.repository.load().revisions[setupId] ?? []
  }

  clear(): void {
    this.repository.clear()
  }

  getLastIssue(): RepositoryIssue | null {
    return this.repository.getLastIssue()
  }
}

export function isAppSettings(value: unknown): value is AppSettings {
  if (!isRecord(value)) return false
  const telemetry = value.telemetry
  const overlays = value.overlays
  const coaching = value.coaching
  const accessibility = value.accessibility
  const privacy = value.privacy
  return (
    (value.theme === 'dark' || value.theme === 'system')
    && (value.units === 'metric' || value.units === 'imperial')
    && isRecord(telemetry)
    && typeof telemetry.autoRecord === 'boolean'
    && [10, 20, 50, 100].includes(telemetry.sampleRateHz as number)
    && Number.isInteger(telemetry.retainSessions)
    && (telemetry.retainSessions as number) >= 0
    && typeof telemetry.recordOpponentSnapshots === 'boolean'
    && isRecord(overlays)
    && typeof overlays.enabled === 'boolean'
    && typeof overlays.clickThrough === 'boolean'
    && Array.isArray(overlays.widgets)
    && overlays.widgets.every(isOverlayWidgetSettings)
    && isRecord(coaching)
    && typeof coaching.enabled === 'boolean'
    && typeof coaching.minimumConfidence === 'number'
    && coaching.minimumConfidence >= 0
    && coaching.minimumConfidence <= 1
    && typeof coaching.voicePrompts === 'boolean'
    && isRecord(accessibility)
    && typeof accessibility.reducedMotion === 'boolean'
    && typeof accessibility.highContrast === 'boolean'
    && ['default', 'deuteranopia', 'protanopia', 'tritanopia'].includes(accessibility.colorVision as string)
    && isRecord(privacy)
    && privacy.localOnly === true
    && typeof privacy.diagnosticsEnabled === 'boolean'
  )
}

function normaliseSettings(value: unknown): AppSettings {
  const root = isRecord(value) ? value : {}
  const telemetry = isRecord(root.telemetry) ? root.telemetry : {}
  const overlays = isRecord(root.overlays) ? root.overlays : {}
  const coaching = isRecord(root.coaching) ? root.coaching : {}
  const accessibility = isRecord(root.accessibility) ? root.accessibility : {}
  const privacy = isRecord(root.privacy) ? root.privacy : {}
  const sampleRateCandidate = telemetry.sampleRateHz ?? root.sampleRateHz
  const sampleRateHz = [10, 20, 50, 100].includes(sampleRateCandidate as number)
    ? sampleRateCandidate as 10 | 20 | 50 | 100
    : DEFAULT_SETTINGS.telemetry.sampleRateHz
  const widgets = Array.isArray(overlays.widgets) && overlays.widgets.every(isOverlayWidgetSettings)
    ? overlays.widgets
    : cloneDefaultSettings().overlays.widgets
  return {
    theme: root.theme === 'system' ? 'system' : 'dark',
    units: root.units === 'imperial' ? 'imperial' : 'metric',
    telemetry: {
      autoRecord: booleanOr(telemetry.autoRecord ?? root.autoRecord, DEFAULT_SETTINGS.telemetry.autoRecord),
      sampleRateHz,
      retainSessions: integerOr(telemetry.retainSessions, DEFAULT_SETTINGS.telemetry.retainSessions, 0),
      recordOpponentSnapshots: booleanOr(
        telemetry.recordOpponentSnapshots,
        DEFAULT_SETTINGS.telemetry.recordOpponentSnapshots,
      ),
    },
    overlays: {
      enabled: booleanOr(overlays.enabled, DEFAULT_SETTINGS.overlays.enabled),
      clickThrough: booleanOr(overlays.clickThrough, DEFAULT_SETTINGS.overlays.clickThrough),
      widgets,
    },
    coaching: {
      enabled: booleanOr(coaching.enabled, DEFAULT_SETTINGS.coaching.enabled),
      minimumConfidence: numberInRangeOr(
        coaching.minimumConfidence,
        DEFAULT_SETTINGS.coaching.minimumConfidence,
        0,
        1,
      ),
      voicePrompts: booleanOr(coaching.voicePrompts, DEFAULT_SETTINGS.coaching.voicePrompts),
    },
    accessibility: {
      reducedMotion: booleanOr(accessibility.reducedMotion, DEFAULT_SETTINGS.accessibility.reducedMotion),
      highContrast: booleanOr(accessibility.highContrast, DEFAULT_SETTINGS.accessibility.highContrast),
      colorVision: isColorVision(accessibility.colorVision)
        ? accessibility.colorVision
        : DEFAULT_SETTINGS.accessibility.colorVision,
    },
    privacy: {
      localOnly: true,
      diagnosticsEnabled: booleanOr(privacy.diagnosticsEnabled, false),
    },
  }
}

function isSessionStore(value: unknown): value is SessionStore {
  if (!isRecord(value) || !Array.isArray(value.order) || !isRecord(value.sessions)) return false
  if (!value.order.every((id) => typeof id === 'string')) return false
  return Object.values(value.sessions).every(isRecordedSession)
}

function isRecordedSession(value: unknown): value is RecordedSession {
  if (!isRecord(value) || !isRecord(value.descriptor) || !isRecord(value.playerCar)) return false
  const descriptor = value.descriptor
  return (
    typeof descriptor.id === 'string'
    && typeof descriptor.eventName === 'string'
    && typeof descriptor.startedAt === 'string'
    && Number.isFinite(Date.parse(descriptor.startedAt))
    && typeof value.notes === 'string'
    && Array.isArray(value.drivers)
    && Array.isArray(value.laps)
    && Array.isArray(value.stints)
    && Array.isArray(value.samples)
    && Array.isArray(value.events)
    && Array.isArray(value.setupIds)
  )
}

function migrateSessionArray(value: unknown): SessionStore {
  if (!Array.isArray(value)) return emptySessionStore()
  const valid = value.filter(isRecordedSession)
  return {
    order: valid.map((session) => session.descriptor.id),
    sessions: Object.fromEntries(valid.map((session) => [session.descriptor.id, session])),
  }
}

function normaliseSessionStore(value: unknown): SessionStore {
  if (!isRecord(value) || !isRecord(value.sessions)) return emptySessionStore()
  const sessions = Object.fromEntries(
    Object.entries(value.sessions).filter((entry): entry is [string, RecordedSession] => isRecordedSession(entry[1])),
  )
  const order = Object.values(sessions)
    .sort((left, right) => Date.parse(right.descriptor.startedAt) - Date.parse(left.descriptor.startedAt))
    .map((session) => session.descriptor.id)
  return { order, sessions }
}

function toSessionListItem(session: RecordedSession): SessionListItem {
  const validLapTimes = session.laps
    .filter((lap) => lap.valid)
    .map((lap) => lap.durationMs)
  return {
    id: session.descriptor.id,
    eventName: session.descriptor.eventName,
    kind: session.descriptor.kind,
    trackName: session.descriptor.track.name,
    carName: `${session.playerCar.manufacturer} ${session.playerCar.model}`,
    startedAt: session.descriptor.startedAt,
    endedAt: session.endedAt,
    lapCount: session.laps.length,
    bestLapMs: validLapTimes.length === 0 ? null : Math.min(...validLapTimes),
  }
}

function isSetupStore(value: unknown): value is SetupStore {
  if (!isRecord(value) || !Array.isArray(value.order) || !isRecord(value.setups) || !isRecord(value.revisions)) {
    return false
  }
  return (
    value.order.every((id) => typeof id === 'string')
    && Object.values(value.setups).every(isSetupDocument)
    && Object.values(value.revisions).every(
      (revisions) => Array.isArray(revisions) && revisions.every(isSetupRevision),
    )
  )
}

function isSetupDocument(value: unknown): value is SetupDocument {
  if (!isRecord(value) || !isRecord(value.metadata) || !isRecord(value.groups)) return false
  const metadata = value.metadata
  return (
    typeof metadata.id === 'string'
    && typeof metadata.name === 'string'
    && typeof metadata.carId === 'string'
    && typeof metadata.trackId === 'string'
    && typeof metadata.createdAt === 'string'
    && Number.isFinite(Date.parse(metadata.createdAt))
    && typeof metadata.updatedAt === 'string'
    && Number.isFinite(Date.parse(metadata.updatedAt))
    && typeof value.checksum === 'string'
  )
}

function isSetupRevision(value: unknown): value is SetupRevision {
  return (
    isRecord(value)
    && typeof value.id === 'string'
    && typeof value.setupId === 'string'
    && typeof value.createdAt === 'string'
    && Number.isFinite(Date.parse(value.createdAt))
    && typeof value.reason === 'string'
    && Array.isArray(value.changes)
  )
}

function emptySessionStore(): SessionStore {
  return { order: [], sessions: {} }
}

function emptySetupStore(): SetupStore {
  return { order: [], setups: {}, revisions: {} }
}

function cloneDefaultSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    telemetry: { ...DEFAULT_SETTINGS.telemetry },
    overlays: {
      ...DEFAULT_SETTINGS.overlays,
      widgets: DEFAULT_SETTINGS.overlays.widgets.map((entry) => ({ ...entry })),
    },
    coaching: { ...DEFAULT_SETTINGS.coaching },
    accessibility: { ...DEFAULT_SETTINGS.accessibility },
    privacy: { ...DEFAULT_SETTINGS.privacy },
  }
}

function widget(
  id: string,
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number,
): AppSettings['overlays']['widgets'][number] {
  return { id, kind, enabled: true, x, y, width, height, opacity: 0.96, scale: 1 }
}

function isOverlayWidgetSettings(value: unknown): value is AppSettings['overlays']['widgets'][number] {
  return (
    isRecord(value)
    && typeof value.id === 'string'
    && typeof value.kind === 'string'
    && typeof value.enabled === 'boolean'
    && finiteNumber(value.x)
    && finiteNumber(value.y)
    && finiteNumber(value.width)
    && finiteNumber(value.height)
    && finiteNumber(value.opacity)
    && value.opacity >= 0
    && value.opacity <= 1
    && finiteNumber(value.scale)
    && value.scale > 0
  )
}

function isColorVision(value: unknown): value is AppSettings['accessibility']['colorVision'] {
  return ['default', 'deuteranopia', 'protanopia', 'tritanopia'].includes(value as string)
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function integerOr(value: unknown, fallback: number, minimum: number): number {
  return Number.isInteger(value) && (value as number) >= minimum ? value as number : fallback
}

function numberInRangeOr(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
