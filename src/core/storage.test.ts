import { describe, expect, it, vi } from 'vitest'
import {
  MemoryStorage,
  RepositoryWriteError,
  VersionedLocalRepository,
  type StorageLike,
} from './storage'

interface ExampleData {
  readonly name: string
  readonly enabled: boolean
}

const isExampleData = (value: unknown): value is ExampleData => {
  return typeof value === 'object'
    && value !== null
    && typeof (value as Record<string, unknown>).name === 'string'
    && typeof (value as Record<string, unknown>).enabled === 'boolean'
}

describe('VersionedLocalRepository', () => {
  it('returns isolated defaults without creating storage entries', () => {
    const storage = new MemoryStorage()
    const repository = exampleRepository(storage)

    const first = repository.load()
    const second = repository.load()

    expect(first).toEqual({ name: 'default', enabled: true })
    expect(first).not.toBe(second)
    expect(storage.getItem('example')).toBeNull()
  })

  it('persists an explicit version envelope and notifies local subscribers', () => {
    const storage = new MemoryStorage()
    const repository = exampleRepository(storage)
    const listener = vi.fn()
    repository.subscribe(listener)

    repository.save({ name: 'race', enabled: false })
    const raw = JSON.parse(storage.getItem('example')!) as Record<string, unknown>

    expect(raw.schemaVersion).toBe(2)
    expect(raw.writtenAt).toBe('2026-01-02T03:04:05.000Z')
    expect(repository.load()).toEqual({ name: 'race', enabled: false })
    expect(listener).toHaveBeenCalledWith({ name: 'race', enabled: false })
  })

  it('migrates old data one version at a time and saves the result', () => {
    const storage = new MemoryStorage()
    storage.setItem('example', JSON.stringify({
      schemaVersion: 1,
      writtenAt: '2025-01-01T00:00:00.000Z',
      data: { title: 'legacy' },
    }))
    const repository = exampleRepository(storage)

    expect(repository.load()).toEqual({ name: 'legacy', enabled: true })
    expect(JSON.parse(storage.getItem('example')!).schemaVersion).toBe(2)
  })

  it('keeps corrupt and future data untouched while returning safe defaults', () => {
    const storage = new MemoryStorage()
    storage.setItem('example', '{broken')
    const repository = exampleRepository(storage)

    expect(repository.load()).toEqual({ name: 'default', enabled: true })
    expect(repository.getLastIssue()?.code).toBe('invalid-json')
    expect(storage.getItem('example')).toBe('{broken')

    const future = JSON.stringify({
      schemaVersion: 99,
      writtenAt: '2026-01-01T00:00:00.000Z',
      data: { name: 'future', enabled: false },
    })
    storage.setItem('example', future)
    expect(repository.load()).toEqual({ name: 'default', enabled: true })
    expect(repository.getLastIssue()?.code).toBe('unsupported-version')
    expect(storage.getItem('example')).toBe(future)
  })

  it('surfaces quota/storage failures as a typed error', () => {
    const failingStorage: StorageLike = {
      getItem: () => null,
      setItem: () => { throw new DOMException('full', 'QuotaExceededError') },
      removeItem: () => undefined,
    }
    const repository = exampleRepository(failingStorage)

    expect(() => repository.save({ name: 'large', enabled: true })).toThrow(RepositoryWriteError)
    expect(repository.getLastIssue()?.code).toBe('storage-write-failed')
  })

  it('round-trips a validated portable JSON export', () => {
    const source = exampleRepository(new MemoryStorage())
    source.save({ name: 'portable', enabled: false })
    const serialized = source.exportJson()
    const destination = exampleRepository(new MemoryStorage())

    expect(destination.importJson(serialized)).toEqual({ name: 'portable', enabled: false })
    expect(destination.load()).toEqual({ name: 'portable', enabled: false })
  })
})

function exampleRepository(storage: StorageLike): VersionedLocalRepository<ExampleData> {
  return new VersionedLocalRepository({
    key: 'example',
    schemaVersion: 2,
    storage,
    now: () => new Date('2026-01-02T03:04:05.000Z'),
    defaultValue: () => ({ name: 'default', enabled: true }),
    validate: isExampleData,
    migrations: {
      1: (value) => {
        const legacy = value as { title?: unknown }
        return { name: typeof legacy.title === 'string' ? legacy.title : 'default', enabled: true }
      },
    },
  })
}
