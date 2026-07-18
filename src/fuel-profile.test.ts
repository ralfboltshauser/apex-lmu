import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyFuelTracker, type TelemetryFrame } from './core'
import { takeSimulationFrames } from './core/simulation'
import { advanceDurableFuelCalibration } from './fuel-profile'

function frame(sequence: number, lap: number, fuel: number, source: TelemetryFrame['source'] = 'lmu-shared-memory') {
  const simulated = takeSimulationFrames(1, { sessionId: `${source}-fuel-test`, startSessionElapsedMs: sequence * 100_000 })[0]!
  return {
    ...simulated,
    sequence,
    source,
    player: {
      ...simulated.player,
      currentLapNumber: lap,
      completedLaps: lap - 1,
      lastLapTimeMs: 100_000,
      powertrain: { ...simulated.player.powertrain, fuelLiters: fuel },
    },
    sample: { ...simulated.sample, isInPitLane: false },
  }
}

describe('durable fuel profile boundary', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')
  let values = new Map<string, string>()
  let getItem = vi.fn((key: string) => values.get(key) ?? null)
  let setItem = vi.fn((key: string, value: string) => values.set(key, value))
  let accessLocalStorage = vi.fn((): Pick<Storage, 'getItem' | 'setItem'> => ({ getItem, setItem }))

  beforeEach(() => {
    values = new Map()
    getItem = vi.fn((key: string) => values.get(key) ?? null)
    setItem = vi.fn((key: string, value: string) => values.set(key, value))
    accessLocalStorage = vi.fn((): Pick<Storage, 'getItem' | 'setItem'> => ({ getItem, setItem }))
    Object.defineProperty(window, 'localStorage', { configurable: true, get: accessLocalStorage })
  })

  afterEach(() => {
    if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage)
  })

  it('never reads, changes, or saves calibration for recording replay frames', () => {
    let durable = advanceDurableFuelCalibration(emptyFuelTracker(), frame(1, 1, 60))
    getItem.mockClear()
    setItem.mockClear()
    accessLocalStorage.mockClear()
    const snapshot = durable

    durable = advanceDurableFuelCalibration(durable, frame(2, 1, 48, 'recording-replay'))
    durable = advanceDurableFuelCalibration(durable, frame(3, 2, 44.5, 'recording-replay'))

    expect(durable).toBe(snapshot)
    expect(accessLocalStorage).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(values.size).toBe(0)
  })

  it('continues saving completed live LMU laps', () => {
    let durable = advanceDurableFuelCalibration(emptyFuelTracker(), frame(1, 1, 60))
    durable = advanceDurableFuelCalibration(durable, frame(2, 1, 58))
    durable = advanceDurableFuelCalibration(durable, frame(3, 2, 56.6))

    expect(durable.fuelSamplesLiters).toEqual([3.4])
    expect(durable.lapTimeSamplesSeconds).toEqual([100])
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(setItem.mock.calls[0]![1] as string)).toEqual({ fuel: [3.4], laps: [100] })
    expect(values.size).toBe(1)
  })
})
