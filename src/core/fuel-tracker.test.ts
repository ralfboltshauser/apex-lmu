import { describe, expect, it } from 'vitest'
import { emptyFuelTracker, updateFuelTracker } from './fuel-tracker'
import { takeSimulationFrames } from './simulation'

function frame(sequence: number, lap: number, fuel: number, inPits = false) {
  const source = takeSimulationFrames(1, { sessionId: 'fuel-test', startSessionElapsedMs: sequence * 100_000 })[0]!
  return {
    ...source, sequence,
    player: { ...source.player, currentLapNumber: lap, completedLaps: lap - 1, lastLapTimeMs: 100_000, powertrain: { ...source.player.powertrain, fuelLiters: fuel } },
    sample: { ...source.sample, isInPitLane: inPits },
  }
}

describe('live fuel tracker', () => {
  it('captures consumption and lap time at a clean lap crossing', () => {
    let state = updateFuelTracker(emptyFuelTracker(), frame(1, 1, 60))
    state = updateFuelTracker(state, frame(2, 1, 58))
    state = updateFuelTracker(state, frame(3, 2, 56.6))
    expect(state.fuelSamplesLiters).toEqual([3.4])
    expect(state.lapTimeSamplesSeconds).toEqual([100])
  })

  it('rejects pit/refuel laps and starts measuring the next lap afresh', () => {
    let state = updateFuelTracker(emptyFuelTracker(), frame(1, 1, 50))
    state = updateFuelTracker(state, frame(2, 1, 70, true))
    state = updateFuelTracker(state, frame(3, 2, 68))
    expect(state.fuelSamplesLiters).toEqual([])
    state = updateFuelTracker(state, frame(4, 3, 64.5))
    expect(state.fuelSamplesLiters).toEqual([3.5])
  })

  it('ignores session-only pre-race frames', () => {
    const preRace = { ...frame(1, 1, 0), sourceState: 'session-only' as const }
    expect(updateFuelTracker(emptyFuelTracker(), preRace)).toEqual(emptyFuelTracker())
  })

  it('cannot replace live calibration with recording replay frames', () => {
    let live = updateFuelTracker(emptyFuelTracker(), frame(1, 1, 60))
    live = updateFuelTracker(live, frame(2, 2, 56.5))
    const replay = {
      ...frame(3, 7, 12),
      source: 'recording-replay' as const,
      session: { ...frame(3, 7, 12).session, id: 'replay-session' },
    }

    expect(updateFuelTracker(live, replay)).toBe(live)
  })
})
