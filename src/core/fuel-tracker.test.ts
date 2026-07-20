import { describe, expect, it } from 'vitest'
import { emptyFuelTracker, updateFuelTracker } from './fuel-tracker'
import { takeSimulationFrames } from './simulation'

function frame(sequence: number, lap: number, fuel: number, inPits = false) {
  const source = takeSimulationFrames(1, { sessionId: 'fuel-test', startSessionElapsedMs: sequence * 100_000 })[0]!
  return {
    ...source, sequence, source: 'lmu-shared-memory' as const, sourceState: 'vehicle-telemetry' as const,
    player: { ...source.player, currentLapNumber: lap, completedLaps: lap - 1, lastLapTimeMs: 100_000, powertrain: { ...source.player.powertrain, fuelLiters: fuel } },
    sample: { ...source.sample, isInPitLane: inPits, controlOwner: 'local-player' as const },
  }
}

describe('live fuel tracker', () => {
  it('captures consumption and lap time at a clean lap crossing', () => {
    let state = updateFuelTracker(emptyFuelTracker(), frame(1, 1, 60))
    expect(state.modelRevision).toBe(1)
    state = updateFuelTracker(state, frame(2, 1, 58))
    expect(state.modelRevision).toBe(1)
    state = updateFuelTracker(state, frame(3, 2, 56.6))
    expect(state.fuelSamplesLiters).toEqual([3.4])
    expect(state.lapTimeSamplesSeconds).toEqual([100])
    expect(state.modelRevision).toBe(2)
    expect(state.modelEvent).toBe('clean-lap')
    expect(state.lastAcceptedLap).toBe(1)
    expect(state.sessionFuelSampleCount).toBe(1)
  })

  it('rejects pit/refuel laps and starts measuring the next lap afresh', () => {
    let state = updateFuelTracker(emptyFuelTracker(), frame(1, 1, 50))
    state = updateFuelTracker(state, frame(2, 1, 70, true))
    expect(state.modelRevision).toBe(2)
    expect(state.modelEvent).toBe('refuel')
    state = updateFuelTracker(state, frame(3, 2, 68))
    expect(state.fuelSamplesLiters).toEqual([])
    expect(state.modelRevision).toBe(2)
    state = updateFuelTracker(state, frame(4, 3, 64.5))
    expect(state.fuelSamplesLiters).toEqual([3.5])
    expect(state.modelRevision).toBe(3)
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

  it.each(['ai', 'remote'] as const)('observes %s fuel without learning from its laps', (controlOwner) => {
    let state = updateFuelTracker(emptyFuelTracker(), frame(1, 1, 60))
    state = updateFuelTracker(state, { ...frame(2, 1, 58), sample: { ...frame(2, 1, 58).sample, controlOwner } })
    state = updateFuelTracker(state, { ...frame(3, 2, 56.6), sample: { ...frame(3, 2, 56.6).sample, controlOwner } })

    expect(state.currentFuelLiters).toBe(56.6)
    expect(state.fuelSamplesLiters).toEqual([])
    expect(state.lapTimeSamplesSeconds).toEqual([])
  })

  it('rejects a mixed-control lap after control returns to the local player', () => {
    let state = updateFuelTracker(emptyFuelTracker(), frame(1, 1, 60))
    const aiFrame = frame(2, 1, 58)
    state = updateFuelTracker(state, { ...aiFrame, sample: { ...aiFrame.sample, controlOwner: 'ai' } })
    state = updateFuelTracker(state, frame(3, 1, 57))
    state = updateFuelTracker(state, frame(4, 2, 56.6))

    expect(state.fuelSamplesLiters).toEqual([])
    expect(state.lapTimeSamplesSeconds).toEqual([])
    expect(state.calibrationExclusion).toBe('non-local-control')
    expect(state.currentLapCalibrationEligible).toBe(true)
    expect(state.modelRevision).toBe(1)
  })

  it('updates current fuel without revising a stale non-local model', () => {
    let state = updateFuelTracker(emptyFuelTracker(), frame(1, 1, 60))
    const aiFrame = frame(2, 1, 57)
    state = updateFuelTracker(state, { ...aiFrame, sample: { ...aiFrame.sample, controlOwner: 'ai' } })
    expect(state.currentFuelLiters).toBe(57)
    expect(state.modelRevision).toBe(1)
    expect(state.calibrationExclusion).toBe('non-local-control')
  })
})
