import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  SESSIONS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  SessionRepository,
  SettingsRepository,
  SetupRepository,
} from './repositories'
import { takeSimulationFrames } from './simulation'
import { MemoryStorage } from './storage'
import type { RecordedSession, SetupDocument, SetupRevision } from './types'

describe('SettingsRepository', () => {
  it('uses privacy-preserving defaults and persists user changes', () => {
    const storage = new MemoryStorage()
    const repository = new SettingsRepository({ storage })

    expect(repository.load()).toEqual(DEFAULT_SETTINGS)
    expect(repository.load().privacy.localOnly).toBe(true)

    repository.update((settings) => ({
      ...settings,
      units: 'imperial',
      telemetry: { ...settings.telemetry, sampleRateHz: 50 },
    }))
    const reloaded = new SettingsRepository({ storage }).load()
    expect(reloaded.units).toBe('imperial')
    expect(reloaded.telemetry.sampleRateHz).toBe(50)
  })

  it('migrates sparse legacy settings and fills every modern default', () => {
    const storage = new MemoryStorage()
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      writtenAt: '2025-01-01T00:00:00.000Z',
      data: {
        theme: 'system',
        units: 'imperial',
        sampleRateHz: 100,
        autoRecord: false,
      },
    }))

    const settings = new SettingsRepository({ storage }).load()

    expect(settings.theme).toBe('system')
    expect(settings.units).toBe('imperial')
    expect(settings.telemetry.sampleRateHz).toBe(100)
    expect(settings.telemetry.autoRecord).toBe(false)
    expect(settings.accessibility.colorVision).toBe('default')
    expect(settings.privacy).toEqual({ localOnly: true, diagnosticsEnabled: false })
    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)!).schemaVersion).toBe(2)
  })
})

describe('SessionRepository', () => {
  it('stores newest-first summaries, full local telemetry, deletion, and pruning', () => {
    const storage = new MemoryStorage()
    const repository = new SessionRepository({ storage })
    repository.save(recordedSession('older', '2026-01-01T10:00:00.000Z'))
    repository.save(recordedSession('newer', '2026-01-02T10:00:00.000Z'))

    expect(repository.list().map((session) => session.id)).toEqual(['newer', 'older'])
    expect(repository.get('older')?.samples).toHaveLength(1)
    expect(repository.prune(1)).toEqual(['older'])
    expect(repository.get('older')).toBeNull()
    expect(repository.delete('newer')).toBe(true)
    expect(repository.delete('missing')).toBe(false)
    expect(repository.list()).toEqual([])
  })

  it('does not write merely by reading an empty collection', () => {
    const storage = new MemoryStorage()
    expect(new SessionRepository({ storage }).list()).toEqual([])
    expect(storage.getItem(SESSIONS_STORAGE_KEY)).toBeNull()
  })
})

describe('SetupRepository', () => {
  it('versions setup documents and their causal change history locally', () => {
    const repository = new SetupRepository({ storage: new MemoryStorage() })
    const setup = setupDocument('setup:race')
    const revision: SetupRevision = {
      id: 'revision:1',
      setupId: setup.metadata.id,
      createdAt: '2026-02-01T12:10:00.000Z',
      reason: 'Improve high-speed rotation',
      changes: [{
        group: 'Aerodynamics',
        parameter: 'Rear wing',
        before: { value: 8, unit: 'click' },
        after: { value: 7, unit: 'click' },
        expectedEffect: 'Less rear stability and lower drag',
      }],
    }

    repository.save(setup)
    repository.addRevision(revision)

    expect(repository.list()[0]?.name).toBe('Le Mans race baseline')
    expect(repository.get(setup.metadata.id)).toEqual(setup)
    expect(repository.revisionsFor(setup.metadata.id)).toEqual([revision])
    expect(repository.delete(setup.metadata.id)).toBe(true)
    expect(repository.revisionsFor(setup.metadata.id)).toEqual([])
  })
})

function recordedSession(id: string, startedAt: string): RecordedSession {
  const frame = takeSimulationFrames(1, { sessionId: id, capturedAt: startedAt })[0]!
  return {
    descriptor: { ...frame.session, id, startedAt },
    endedAt: null,
    playerCar: frame.player.car,
    drivers: [frame.player.driver],
    laps: [],
    stints: [],
    samples: [frame.sample],
    events: [],
    setupIds: [],
    notes: '',
  }
}

function setupDocument(id: string): SetupDocument {
  return {
    metadata: {
      id,
      name: 'Le Mans race baseline',
      description: 'Stable local baseline',
      carId: 'ferrari-499p-51',
      trackId: 'circuit-de-la-sarthe-2024',
      category: 'endurance',
      stability: 'balanced',
      author: 'Local player',
      gameVersion: '1.2',
      createdAt: '2026-02-01T12:00:00.000Z',
      updatedAt: '2026-02-01T12:00:00.000Z',
      parentSetupId: null,
      sourceFileName: null,
      tags: ['race', 'dry'],
    },
    groups: {
      Aerodynamics: {
        'Rear wing': { value: 8, unit: 'click', minimum: 1, maximum: 12, step: 1 },
      },
    },
    checksum: 'sha256:local-demo',
  }
}
