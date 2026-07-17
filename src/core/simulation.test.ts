import { describe, expect, it } from 'vitest'
import { createSimulationFrames, LE_MANS_TRACK, takeSimulationFrames } from './simulation'

describe('deterministic LMU simulation', () => {
  it('emits identical telemetry for the same seed and options', () => {
    const options = { seed: 499, stepMs: 100, fieldSize: 8, capturedAt: '2026-01-01T00:00:00.000Z' }
    const left = takeSimulationFrames(12, options)
    const right = takeSimulationFrames(12, options)

    expect(left).toEqual(right)
    expect(left[0]?.opponents).toHaveLength(8)
  })

  it('uses the seed for coherent variation without violating telemetry bounds', () => {
    const first = takeSimulationFrames(1, { seed: 1 })[0]!
    const second = takeSimulationFrames(1, { seed: 2 })[0]!

    expect(first.sample.motion.speedKph).not.toBe(second.sample.motion.speedKph)
    expect(first.sample.inputs.throttle).toBeGreaterThanOrEqual(0)
    expect(first.sample.inputs.throttle).toBeLessThanOrEqual(1)
    expect(first.sample.inputs.brake).toBeGreaterThanOrEqual(0)
    expect(first.player.powertrain.fuelLiters).toBeGreaterThan(0)
    expect(first.player.wheels.frontLeft.pressureKpa).toBeGreaterThan(150)
    expect(first.weather.trackCondition).toBe('dry')
  })

  it('advances sequence, clocks, distance, fuel, and opponent race state', () => {
    const frames = takeSimulationFrames(3, {
      stepMs: 200,
      capturedAt: '2026-03-04T12:00:00.000Z',
    })

    expect(frames.map((frame) => frame.sequence)).toEqual([0, 1, 2])
    expect(frames[1]!.sessionState.elapsedMs - frames[0]!.sessionState.elapsedMs).toBe(200)
    expect(Date.parse(frames[2]!.capturedAt) - Date.parse(frames[0]!.capturedAt)).toBe(400)
    expect(frames[2]!.player.distanceM!).toBeGreaterThan(frames[0]!.player.distanceM!)
    expect(frames[2]!.player.powertrain.fuelLiters).toBeLessThan(frames[0]!.player.powertrain.fuelLiters)
    expect(frames[0]!.opponents.map((opponent) => opponent.overallPosition).sort((a, b) => a - b))
      .toEqual(expect.arrayContaining([1, 2, 3]))
  })

  it('wraps at the timing line and emits lap lifecycle events once', () => {
    const frames = takeSimulationFrames(20, {
      stepMs: 100,
      startLapNumber: 4,
      startDistanceFraction: 0.999,
    })
    const completionFrame = frames.find((frame) =>
      frame.events.some((event) => event.type === 'lap-completed'),
    )

    expect(completionFrame).toBeDefined()
    expect(completionFrame!.player.currentLapNumber).toBe(5)
    expect(completionFrame!.player.lastLapTimeMs).toBeGreaterThan(190_000)
    expect(completionFrame!.player.lastLapTimeMs).toBeLessThan(220_000)
    expect(completionFrame!.player.distanceM!).toBeGreaterThanOrEqual(0)
    expect(completionFrame!.player.distanceM!).toBeLessThan(LE_MANS_TRACK.lengthM)
    expect(completionFrame!.events.filter((event) => event.type === 'lap-completed')).toHaveLength(1)
    expect(frames.flatMap((frame) => frame.events).filter((event) => event.type === 'lap-completed')).toHaveLength(1)
  })

  it('supports an infinite pull stream without sharing mutable state', () => {
    const stream = createSimulationFrames({ seed: 10, fieldSize: 0 })
    const first = stream.next().value
    const second = stream.next().value

    expect(first.opponents).toEqual([])
    expect(second.sequence).toBe(first.sequence + 1)
    expect(first.sample).not.toBe(second.sample)
  })

  it('rejects options that would make the stream ambiguous or unsafe', () => {
    expect(() => takeSimulationFrames(-1)).toThrow(RangeError)
    expect(() => createSimulationFrames({ stepMs: 2 }).next()).toThrow(/stepMs/)
    expect(() => createSimulationFrames({ startDistanceFraction: 1 }).next()).toThrow(/startDistanceFraction/)
    expect(() => createSimulationFrames({ capturedAt: 'not-a-date' }).next()).toThrow(/capturedAt/)
  })
})
