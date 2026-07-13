import { describe, expect, it } from 'vitest'
import type { TelemetryFrame } from '../core'
import { detectBrakeZones, MeasuredTrackRecorder, type MeasuredRoutePoint } from './track-geometry'

function point(distanceM: number, brake: number, elapsedSeconds: number): MeasuredRoutePoint {
  return { distanceM, x: distanceM, z: Math.sin(distanceM / 50) * 20, brake, speedKph: 200 - brake * 100, elapsedSeconds }
}

function frame(sequence: number, lap: number, distanceM: number, options: { pit?: boolean; owner?: 'local-player' | 'ai'; session?: string; elapsedMs?: number } = {}) {
  const angle = distanceM / 1000 * Math.PI * 2
  return {
    sequence,
    sourceState: 'vehicle-telemetry',
    session: { id: options.session ?? 'session-1', track: { name: 'Measured Track', layout: '', lengthM: 1000 } },
    player: { currentLapNumber: lap },
    sample: {
      lapId: `session-1-lap-${lap}`,
      distanceM,
      sessionElapsedMs: options.elapsedMs ?? sequence * 100,
      isInPitLane: options.pit ?? false,
      controlOwner: options.owner ?? 'local-player',
      inputs: { brake: distanceM >= 300 && distanceM <= 390 ? 0.7 : 0 },
      motion: { speedKph: 226 },
      worldPositionM: { x: Math.cos(angle) * 100, y: 5, z: Math.sin(angle) * 100 },
    },
  } as unknown as TelemetryFrame
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
    const recorder = new MeasuredTrackRecorder(20)
    let sequence = 1
    for (let distance = 0; distance < 1000; distance += 10) recorder.ingest(frame(sequence++, 1, distance))
    const completed = recorder.ingest(frame(sequence++, 2, 0))!

    expect(completed.completedLapCount).toBe(1)
    expect(completed.state).toBe('complete')
    expect(completed.coverage).toBeGreaterThan(0.95)
    expect(completed.route.length).toBe(50)
    expect(completed.geometryFingerprint).toMatch(/^[0-9a-f]{8}$/)
    expect(completed.brakeZones).toHaveLength(1)
    expect(completed.brakeZones[0].startDistanceM).toBe(300)
    expect(completed.brakeZones[0].releaseDistanceM).toBe(390)
  })

  it('never promotes pit, AI, duplicate, or incomplete samples into a clean lap', () => {
    const recorder = new MeasuredTrackRecorder(20)
    let sequence = 1
    for (let distance = 0; distance < 1000; distance += 10) {
      recorder.ingest(frame(sequence++, 1, distance, { pit: distance >= 400 && distance <= 500 }))
    }
    let snapshot = recorder.ingest(frame(sequence++, 2, 0))!
    expect(snapshot.completedLapCount).toBe(0)

    for (let distance = 0; distance < 1000; distance += 10) recorder.ingest(frame(sequence++, 2, distance, { owner: distance === 500 ? 'ai' : 'local-player' }))
    snapshot = recorder.ingest(frame(sequence++, 3, 0))!
    expect(snapshot.completedLapCount).toBe(0)
    expect(recorder.ingest(frame(sequence - 1, 3, 10))).toEqual(snapshot)
  })

  it('resets geometry when the source session identity changes', () => {
    const recorder = new MeasuredTrackRecorder(20)
    recorder.ingest(frame(1, 1, 0))
    recorder.ingest(frame(2, 1, 10))
    const reset = recorder.ingest(frame(1, 1, 0, { session: 'session-2' }))!
    expect(reset.sessionId).toBe('session-2')
    expect(reset.completedLapCount).toBe(0)
    expect(reset.route.length).toBe(1)
  })

  it('deduplicates repeated LMU game-time snapshots without invalidating the lap', () => {
    const recorder = new MeasuredTrackRecorder(20)
    let sequence = 1
    for (let distance = 0; distance < 1000; distance += 10) {
      const elapsedMs = sequence * 100
      recorder.ingest(frame(sequence++, 1, distance, { elapsedMs }))
      recorder.ingest(frame(sequence++, 1, distance, { elapsedMs }))
    }
    const completed = recorder.ingest(frame(sequence, 2, 0))!
    expect(completed.completedLapCount).toBe(1)
    expect(completed.state).toBe('complete')
  })
})
