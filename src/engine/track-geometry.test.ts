import { describe, expect, it } from 'vitest'
import { buildMeasuredTrackSnapshot, detectBrakeZones, type MeasuredLapRecord, type MeasuredRoutePoint } from './track-geometry'

function point(distanceM: number, brake: number, elapsedSeconds: number): MeasuredRoutePoint {
  return { distanceM, x: distanceM, z: Math.sin(distanceM / 50) * 20, brake, speedKph: 200 - brake * 100, elapsedSeconds }
}

function lap(number: number, state: MeasuredLapRecord['state'] = 'complete', quality: MeasuredLapRecord['quality'] = 'clean', endM = 1000): MeasuredLapRecord {
  return {
    id: `lap-${number}`,
    number,
    state,
    quality,
    samples: Array.from({ length: Math.ceil(endM / 10) }, (_, index) => {
      const distanceM = index * 10
      const angle = distanceM / 1000 * Math.PI * 2
      return { distanceM, x: Math.cos(angle) * 100, z: Math.sin(angle) * 100, brake: distanceM >= 300 && distanceM <= 390 ? 0.7 : 0, speedKph: 226, elapsedSeconds: number * 100 + index * 0.1 }
    }),
  }
}

describe('measured track geometry', () => {
  it('uses hysteresis, merges chatter, and rejects isolated brake spikes', () => {
    const samples = [
      point(0, 0, 0), point(10, 0.8, 0.1), point(20, 0, 0.2),
      point(100, 0, 1), point(110, 0.2, 1.1), point(120, 0.7, 1.2),
      point(130, 0.03, 1.3), point(140, 0.6, 1.4), point(150, 0.04, 1.5),
      point(160, 0.02, 1.7), point(170, 0, 1.8),
    ]
    const zones = detectBrakeZones(samples)
    expect(zones).toHaveLength(1)
    expect(zones[0]).toMatchObject({ startDistanceM: 110, peakDistanceM: 120, releaseDistanceM: 140 })
    expect(zones[0].peakPressure).toBe(0.7)
    expect(zones[0].minimumSpeedKph).toBe(130)
  })

  it('learns a complete route by lap distance and retains measured brake zones', () => {
    const completed = buildMeasuredTrackSnapshot({ id: 'session-1', trackName: 'Measured Track', layoutName: '', trackLengthM: 1000, laps: [lap(1)] }, 'lap-1', 20)!

    expect(completed.completedLapCount).toBe(1)
    expect(completed.state).toBe('complete')
    expect(completed.coverage).toBeGreaterThan(0.95)
    expect(completed.route.length).toBe(50)
    expect(completed.geometryFingerprint).toMatch(/^[0-9a-f]{8}$/)
    expect(completed.brakeZones).toHaveLength(1)
    expect(completed.brakeZones[0].startDistanceM).toBe(300)
    expect(completed.brakeZones[0].releaseDistanceM).toBe(390)
  })

  it('uses clean completed laps for the route while keeping a partial selected lap explicit', () => {
    const laps = [lap(1), lap(2), lap(3), lap(4, 'current', 'ineligible', 250)]
    const snapshot = buildMeasuredTrackSnapshot({ id: 'session-1', trackName: 'Measured Track', layoutName: '', trackLengthM: 1000, laps }, 'lap-4', 20)!
    expect(snapshot.completedLapCount).toBe(3)
    expect(snapshot.selectedLapNumber).toBe(4)
    expect(snapshot.selectedLap).toHaveLength(25)
    expect(snapshot.route).toHaveLength(50)
    expect(snapshot.coverage).toBe(1)
    expect(snapshot.state).toBe('complete')
  })
})
