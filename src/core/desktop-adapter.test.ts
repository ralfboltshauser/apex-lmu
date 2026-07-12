import { describe, expect, it, vi } from 'vitest'
import { DesktopTelemetryAdapter, mapBridgeFrame } from './desktop-adapter'

const wheel = (position: string) => ({
  position,
  pressurePsi: 24,
  surfaceTempC: [90, 91, 92] as [number, number, number],
  carcassTempC: 88,
  brakeTempC: 420,
  wearRemaining: 0.87,
  rideHeightM: 0.061,
  suspensionM: 0.02,
  rotationRadSec: 70,
  flat: false,
  detached: false,
})

describe('desktop LMU bridge mapping', () => {
  it('normalizes official bridge units and multiclass state', () => {
    const raw: Parameters<typeof mapBridgeFrame>[0] = {
      type: 'telemetry',
      capturedAt: '2026-07-11T20:00:00.000Z',
      sequence: 42,
      session: { track: 'Circuit de la Sarthe', layout: 'Le Mans', elapsedSeconds: 900, endSeconds: 7200, maximumLaps: 0, trackLengthM: 13626, phase: 5, inRealtime: true, airTempC: 18, trackTempC: 27, rain: 0, wetness: 0.1, windSpeedMps: 3.2, yellowState: 0 },
      player: { id: 6, driver: 'Ralf Driver', name: 'Porsche 963', class: 'Hypercar', position: 3, lap: 8, sector: 2, lapDistanceM: 6813, speedKph: 271.4, rpm: 8021, maximumRpm: 9000, gear: 6, throttle: 0.92, brake: 0, steering: -0.08, clutch: 0, fuelL: 48.2, fuelCapacityL: 90, batteryFraction: 0.64, rearBrakeBias: 0.47, deltaBestSeconds: 0.12, bestLapSeconds: 205.2, lastLapSeconds: 206.1, timeBehindLeaderSeconds: 6.1, timeBehindNextSeconds: 2.8, inPits: false, pitState: 0, frontCompound: 'Mediums', rearCompound: 'Mediums', wheels: [wheel('FL'), wheel('FR'), wheel('RL'), wheel('RR')] },
      opponents: [
        { id: 51, driver: 'Leader', name: 'Ferrari 499P', class: 'Hypercar', position: 1, laps: 8, lapDistanceM: 7000, bestLapSeconds: 204.8, lastLapSeconds: 205.4, behindLeaderSeconds: 0, behindNextSeconds: 0, lapsBehindLeader: 0, inPits: false, pitState: 0 },
        { id: 22, driver: 'LMP Driver', name: 'Oreca 07', class: 'LMP2', position: 8, laps: 7, lapDistanceM: 3000, bestLapSeconds: 212, lastLapSeconds: 213, behindLeaderSeconds: 35, behindNextSeconds: 4, lapsBehindLeader: 1, inPits: true, pitState: 3 },
      ],
    }
    const frame = mapBridgeFrame(raw, '2026-07-11T19:45:00.000Z')
    expect(frame.player.car.vehicleClass).toBe('HYPERCAR')
    expect(frame.player.classPosition).toBe(2)
    expect(frame.player.wheels.frontLeft.pressureKpa).toBeCloseTo(165.47, 1)
    expect(frame.player.wheels.frontLeft.wearPercent).toBe(87)
    expect(frame.player.distanceFraction).toBeCloseTo(0.5)
    expect(frame.weather.trackCondition).toBe('damp')
    expect(frame.opponents[1].car.vehicleClass).toBe('LMP2')
    expect(frame.opponents[1].pitState).toBe('stopped')
    expect(frame.sample.sequence).toBe(42)
  })

  it('ignores self-test traffic on the production live adapter', async () => {
    const originalDesktop = window.apexDesktop
    let bridgeListener: ((message: unknown) => void) | undefined
    const removeListener = vi.fn()
    window.apexDesktop = {
      onTelemetryMessage: (listener: (message: unknown) => void) => {
        bridgeListener = listener
        return removeListener
      },
      startTelemetry: vi.fn().mockResolvedValue({ ok: true }),
      stopTelemetry: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as ApexDesktopApi
    const adapter = new DesktopTelemetryAdapter()
    const onFrame = vi.fn()
    adapter.subscribe(onFrame)

    try {
      await adapter.connect()
      bridgeListener?.({ protocolVersion: 1, source: 'self-test', runId: 'diagnostic-1', type: 'status', state: 'connected' })
      bridgeListener?.({ protocolVersion: 1, source: 'self-test', runId: 'diagnostic-1', type: 'telemetry', session: {}, player: {}, opponents: [] })

      expect(onFrame).not.toHaveBeenCalled()
      expect(adapter.getLatestFrame()).toBeNull()
      expect(adapter.getStatus().state).toBe('connecting')
      expect(adapter.getStatus().framesReceived).toBe(0)
      await adapter.disconnect()
      expect(removeListener).toHaveBeenCalledOnce()
    } finally {
      window.apexDesktop = originalDesktop
    }
  })

  it('drops the last live frame when the game mapping disconnects', async () => {
    const originalDesktop = window.apexDesktop
    let bridgeListener: ((message: unknown) => void) | undefined
    window.apexDesktop = {
      onTelemetryMessage: (listener: (message: unknown) => void) => { bridgeListener = listener; return () => {} },
      startTelemetry: vi.fn().mockResolvedValue({ ok: true }),
      stopTelemetry: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as ApexDesktopApi
    const adapter = new DesktopTelemetryAdapter()

    try {
      await adapter.connect()
      bridgeListener?.({
        source: 'lmu-shared-memory', type: 'telemetry', capturedAt: '2026-07-11T20:00:00.000Z', sequence: 1,
        session: { track: 'Le Mans', elapsedSeconds: 1, endSeconds: 10, maximumLaps: 0, trackLengthM: 13626, phase: 5, inRealtime: true, airTempC: 18, trackTempC: 27, rain: 0, wetness: 0, windSpeedMps: 0, yellowState: 0 },
        player: { id: 6, driver: 'Player', name: 'Porsche 963', class: 'Hypercar', position: 1, lap: 1, sector: 1, lapDistanceM: 1, speedKph: 1, rpm: 1, maximumRpm: 1, gear: 1, throttle: 0, brake: 0, steering: 0, clutch: 0, fuelL: 1, fuelCapacityL: 1, batteryFraction: 0, rearBrakeBias: 0, deltaBestSeconds: 0, bestLapSeconds: 0, lastLapSeconds: 0, timeBehindLeaderSeconds: 0, timeBehindNextSeconds: 0, inPits: false, pitState: 0, frontCompound: 'Medium', rearCompound: 'Medium', wheels: [wheel('FL'), wheel('FR'), wheel('RL'), wheel('RR')] },
        opponents: [],
      })
      expect(adapter.getLatestFrame()).not.toBeNull()
      expect(adapter.getStatus().state).toBe('connected')

      bridgeListener?.({ source: 'lmu-shared-memory', type: 'status', state: 'disconnected' })
      expect(adapter.getLatestFrame()).toBeNull()
      expect(adapter.getStatus().state).toBe('connecting')
      expect(adapter.getStatus().connectedAt).toBeNull()
    } finally {
      await adapter.disconnect()
      window.apexDesktop = originalDesktop
    }
  })
})
