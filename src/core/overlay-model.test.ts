import { describe, expect, it } from 'vitest'
import { buildOverlayViewModel, closesOverlaySession } from './overlay-model'

const frame = (playerTelemetryAvailable: boolean) => ({
  source: 'lmu-shared-memory', type: 'telemetry', playerTelemetryAvailable,
  player: { position: 3, timeBehindLeaderSeconds: 6, fuelL: 42, speedKph: 271, gear: 6, throttle: .8, brake: .1, deltaBestSeconds: .123 },
  opponents: [
    { id: 1, position: 2, driver: 'Ahead', behindLeaderSeconds: 4 },
    { id: 2, position: 4, driver: 'Behind', behindLeaderSeconds: 9 },
  ],
})

describe('overlay view model', () => {
  it('keeps scoring-relative data while withholding unavailable vehicle telemetry', () => {
    const model = buildOverlayViewModel(frame(false))!
    expect(model.relative.map((row) => row.gapSeconds)).toEqual([-2, null, 3])
    expect(model.playerPosition).toBe(3)
    expect(model.fuelL).toBeNull()
    expect(model.speedKph).toBeNull()
    expect(model.deltaBestSeconds).toBeNull()
  })

  it('passes finite measured vehicle values and marks replay', () => {
    const model = buildOverlayViewModel({ ...frame(true), source: 'recording-replay' })!
    expect(model.fuelL).toBe(42)
    expect(model.speedKph).toBe(271)
    expect(model.replay).toBe(true)
  })

  it('excludes self-test and clears on non-connected status', () => {
    expect(buildOverlayViewModel({ ...frame(true), source: 'self-test' })).toBeNull()
    expect(closesOverlaySession({ type: 'status', state: 'waiting' })).toBe(true)
    expect(closesOverlaySession({ type: 'status', state: 'connected' })).toBe(false)
  })
})
