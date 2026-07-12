export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PersistedEnvelope<T> {
  readonly schemaVersion: number
  readonly writtenAt: string
  readonly data: T
}

export type RepositoryIssueCode =
  | 'invalid-json'
  | 'invalid-envelope'
  | 'unsupported-version'
  | 'missing-migration'
  | 'invalid-data'
  | 'storage-read-failed'
  | 'storage-write-failed'

export interface RepositoryIssue {
  readonly code: RepositoryIssueCode
  readonly message: string
  readonly cause?: unknown
}

export class RepositoryWriteError extends Error {
  readonly issue: RepositoryIssue

  constructor(issue: RepositoryIssue) {
    super(issue.message)
    this.name = 'RepositoryWriteError'
    this.issue = issue
  }
}

export interface VersionedRepositoryOptions<T> {
  readonly key: string
  readonly schemaVersion: number
  readonly defaultValue: () => T
  readonly validate: (value: unknown) => value is T
  /** Each entry migrates the version matching its numeric key to key + 1. */
  readonly migrations?: Readonly<Record<number, (value: unknown) => unknown>>
  readonly storage?: StorageLike
  readonly now?: () => Date
}

export type RepositoryListener<T> = (value: T) => void

/**
 * Small, dependency-free versioned persistence primitive. Invalid or future
 * data is never overwritten automatically; callers receive defaults and can
 * inspect `getLastIssue()` to surface a recovery action in the UI.
 */
export class VersionedLocalRepository<T> {
  readonly key: string
  readonly schemaVersion: number

  private readonly storage: StorageLike
  private readonly defaultValue: () => T
  private readonly validate: (value: unknown) => value is T
  private readonly migrations: Readonly<Record<number, (value: unknown) => unknown>>
  private readonly now: () => Date
  private readonly listeners = new Set<RepositoryListener<T>>()
  private lastIssue: RepositoryIssue | null = null

  constructor(options: VersionedRepositoryOptions<T>) {
    if (!Number.isInteger(options.schemaVersion) || options.schemaVersion < 1) {
      throw new RangeError('schemaVersion must be a positive integer')
    }
    this.key = options.key
    this.schemaVersion = options.schemaVersion
    this.storage = options.storage ?? resolveLocalStorage()
    this.defaultValue = options.defaultValue
    this.validate = options.validate
    this.migrations = options.migrations ?? {}
    this.now = options.now ?? (() => new Date())
  }

  load(): T {
    this.lastIssue = null
    let raw: string | null
    try {
      raw = this.storage.getItem(this.key)
    } catch (cause) {
      this.lastIssue = {
        code: 'storage-read-failed',
        message: `Could not read ${this.key} from local storage`,
        cause,
      }
      return clone(this.defaultValue())
    }
    if (raw === null) return clone(this.defaultValue())

    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch (cause) {
      this.lastIssue = {
        code: 'invalid-json',
        message: `Stored value for ${this.key} is not valid JSON`,
        cause,
      }
      return clone(this.defaultValue())
    }

    const decoded = decodeEnvelope(parsed)
    if (decoded === null) {
      this.lastIssue = {
        code: 'invalid-envelope',
        message: `Stored value for ${this.key} does not have a valid schema envelope`,
      }
      return clone(this.defaultValue())
    }
    if (decoded.schemaVersion > this.schemaVersion) {
      this.lastIssue = {
        code: 'unsupported-version',
        message: `${this.key} uses schema ${decoded.schemaVersion}, but this build supports ${this.schemaVersion}`,
      }
      return clone(this.defaultValue())
    }

    let version = decoded.schemaVersion
    let value: unknown = decoded.data
    while (version < this.schemaVersion) {
      const migrate = this.migrations[version]
      if (migrate === undefined) {
        this.lastIssue = {
          code: 'missing-migration',
          message: `No migration from schema ${version} exists for ${this.key}`,
        }
        return clone(this.defaultValue())
      }
      value = migrate(value)
      version += 1
    }
    if (!this.validate(value)) {
      this.lastIssue = {
        code: 'invalid-data',
        message: `Stored value for ${this.key} failed schema ${this.schemaVersion} validation`,
      }
      return clone(this.defaultValue())
    }

    const result = clone(value)
    if (decoded.schemaVersion < this.schemaVersion) {
      // Persist a successful migration. A write error should be visible, but it
      // must not prevent the already migrated in-memory value from being used.
      try {
        this.writeEnvelope(result)
      } catch {
        // writeEnvelope records the detailed issue.
      }
    }
    return result
  }

  save(value: T): T {
    if (!this.validate(value)) {
      throw new TypeError(`Cannot save invalid schema ${this.schemaVersion} data to ${this.key}`)
    }
    const safeValue = clone(value)
    this.writeEnvelope(safeValue)
    this.lastIssue = null
    for (const listener of this.listeners) listener(clone(safeValue))
    return clone(safeValue)
  }

  update(updater: (current: T) => T): T {
    return this.save(updater(this.load()))
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key)
      this.lastIssue = null
    } catch (cause) {
      const issue: RepositoryIssue = {
        code: 'storage-write-failed',
        message: `Could not remove ${this.key} from local storage`,
        cause,
      }
      this.lastIssue = issue
      throw new RepositoryWriteError(issue)
    }
    const value = clone(this.defaultValue())
    for (const listener of this.listeners) listener(clone(value))
  }

  exportJson(pretty = true): string {
    const envelope: PersistedEnvelope<T> = {
      schemaVersion: this.schemaVersion,
      writtenAt: this.now().toISOString(),
      data: this.load(),
    }
    return JSON.stringify(envelope, null, pretty ? 2 : undefined)
  }

  importJson(serialized: string): T {
    let parsed: unknown
    try {
      parsed = JSON.parse(serialized) as unknown
    } catch (cause) {
      throw new TypeError(`Import for ${this.key} is not valid JSON`, { cause })
    }
    const envelope = decodeEnvelope(parsed)
    if (envelope === null || envelope.schemaVersion !== this.schemaVersion) {
      throw new TypeError(`Import for ${this.key} must use schema ${this.schemaVersion}`)
    }
    if (!this.validate(envelope.data)) {
      throw new TypeError(`Import for ${this.key} failed validation`)
    }
    return this.save(envelope.data)
  }

  subscribe(listener: RepositoryListener<T>): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getLastIssue(): RepositoryIssue | null {
    return this.lastIssue
  }

  private writeEnvelope(value: T): void {
    const envelope: PersistedEnvelope<T> = {
      schemaVersion: this.schemaVersion,
      writtenAt: this.now().toISOString(),
      data: value,
    }
    try {
      this.storage.setItem(this.key, JSON.stringify(envelope))
    } catch (cause) {
      const issue: RepositoryIssue = {
        code: 'storage-write-failed',
        message: `Could not write ${this.key} to local storage; the storage quota may be full`,
        cause,
      }
      this.lastIssue = issue
      throw new RepositoryWriteError(issue)
    }
  }
}

export class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  clear(): void {
    this.values.clear()
  }
}

function decodeEnvelope(value: unknown): PersistedEnvelope<unknown> | null {
  if (!isRecord(value)) return null
  if (!Number.isInteger(value.schemaVersion) || (value.schemaVersion as number) < 0) return null
  if (typeof value.writtenAt !== 'string' || !Number.isFinite(Date.parse(value.writtenAt))) return null
  if (!Object.prototype.hasOwnProperty.call(value, 'data')) return null
  return {
    schemaVersion: value.schemaVersion as number,
    writtenAt: value.writtenAt,
    data: value.data,
  }
}

function resolveLocalStorage(): StorageLike {
  try {
    const storage = globalThis.localStorage
    const probe = '__apex_lmu_storage_probe__'
    storage.setItem(probe, probe)
    storage.removeItem(probe)
    return storage
  } catch {
    return new MemoryStorage()
  }
}

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
