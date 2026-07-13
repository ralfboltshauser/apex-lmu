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
      desktopSessionId: 'analysis-session-authoritative',
      desktopLapId: 'analysis-lap-authoritative',
      desktopSessionStartedAt: '2026-07-11T19:30:00.000Z',
      session: { track: 'Circuit de la Sarthe', layout: 'Le Mans', elapsedSeconds: 900, endSeconds: 7200, maximumLaps: 0, trackLengthM: 13626, phase: 5, inRealtime: true, airTempC: 18, trackTempC: 27, rain: 0, wetness: 0.1, windSpeedMps: 3.2, yellowState: 0 },
      player: { id: 6, driver: 'Ralf Driver', name: 'Porsche 963', class: 'Hypercar', controlOwner: 'local-player', worldPositionM: { x: 123, y: 4, z: -456 }, gameElapsedSeconds: 900.5, lapStartSeconds: 700, position: 3, lap: 8, sector: 2, lapDistanceM: 6813, speedKph: 271.4, rpm: 8021, maximumRpm: 9000, gear: 6, throttle: 0.92, brake: 0, steering: -0.08, clutch: 0, fuelL: 48.2, fuelCapacityL: 90, batteryFraction: 0.64, rearBrakeBias: 0.47, deltaBestSeconds: 0.12, bestLapSeconds: 205.2, lastLapSeconds: 206.1, timeBehindLeaderSeconds: 6.1, timeBehindNextSeconds: 2.8, inPits: false, pitState: 0, frontCompound: 'Mediums', rearCompound: 'Mediums', wheels: [wheel('FL'), wheel('FR'), wheel('RL'), wheel('RR')] },
      opponents: [
        { id: 51, driver: 'Leader', name: 'Ferrari 499P', class: 'Hypercar', position: 1, laps: 8, lapDistanceM: 7000, worldPositionM: { x: 140, y: 4, z: -440 }, bestLapSeconds: 204.8, lastLapSeconds: 205.4, behindLeaderSeconds: 0, behindNextSeconds: 0, lapsBehindLeader: 0, inPits: false, pitState: 0 },
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
    expect(frame.session.id).toBe('analysis-session-authoritative')
    expect(frame.session.startedAt).toBe('2026-07-11T19:30:00.000Z')
    expect(frame.sample.lapId).toBe('analysis-lap-authoritative')
    expect(frame.sample.worldPositionM).toEqual({ x: 123, y: 4, z: -456 })
    expect(frame.sample.controlOwner).toBe('local-player')
    expect(frame.sample.sessionElapsedMs).toBe(900500)
    expect(frame.sample.lapElapsedMs).toBe(200500)
    expect(frame.opponents[0].worldPositionM).toEqual({ x: 140, y: 4, z: -440 })
    expect(frame.player.motion.velocityMps).toBeUndefined()
    expect(frame.player.motion.accelerationMps2).toBeUndefined()
    expect(frame.player.powertrain.engineTemperatureC).toBeUndefined()
    expect(frame.player.hybrid?.virtualEnergyPercent).toBeUndefined()
    expect(frame.player.damage).toBeUndefined()
    expect(frame.opponents[0].speedKph).toBeUndefined()
    expect(frame.weather.cloudCover).toBeUndefined()
    expect(frame.player.car.carNumber).toBe('')
  })

  it('maps a pre-race scoring snapshot without claiming vehicle telemetry', () => {
    const raw: Parameters<typeof mapBridgeFrame>[0] = {
      type: 'telemetry', capturedAt: '2026-07-12T12:00:00.000Z', sequence: 1, playerTelemetryAvailable: false,
      session: { track: 'Spa-Francorchamps', elapsedSeconds: 0, endSeconds: 3600, maximumLaps: 0, trackLengthM: 7004, phase: 2, inRealtime: false, airTempC: 18, trackTempC: 24, rain: 0, wetness: 0, windSpeedMps: 2, yellowState: 0 },
      player: { id: 6, driver: 'Player', name: 'Porsche 963', class: 'Hypercar', position: 3, lap: 1, sector: 1, lapDistanceM: 0, speedKph: 0, rpm: 0, maximumRpm: 0, gear: 0, throttle: 0, brake: 0, steering: 0, clutch: 0, fuelL: 0, fuelCapacityL: 0, batteryFraction: 0, rearBrakeBias: 0, deltaBestSeconds: 0, bestLapSeconds: 0, lastLapSeconds: 0, timeBehindLeaderSeconds: 0, timeBehindNextSeconds: 0, inPits: true, pitState: 3, frontCompound: '', rearCompound: '', wheels: [wheel('FL'), wheel('FR'), wheel('RL'), wheel('RR')].map((value) => ({ ...value, pressurePsi: 0, surfaceTempC: [0, 0, 0] as [number, number, number], carcassTempC: 0, brakeTempC: 0 })) as ReturnType<typeof wheel>[] as Parameters<typeof mapBridgeFrame>[0]['player']['wheels'] },
      opponents: [],
    }
    const frame = mapBridgeFrame(raw, raw.capturedAt)
    expect(frame.sourceState).toBe('session-only')
    expect(frame.player.car.model).toBe('Porsche 963')
    expect(frame.weather.trackTemperatureC).toBe(24)
    expect(frame.sessionState.phase).toBe('garage')
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

  it('preserves the bridge waiting reason for the live-session UI', async () => {
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
      bridgeListener?.({ source: 'lmu-shared-memory', type: 'status', state: 'mapping-open', message: 'LMU shared memory opened; waiting for a drivable car' })
      expect(adapter.getStatus()).toMatchObject({ state: 'connecting', detail: 'LMU shared memory opened; waiting for a drivable car', error: null })
    } finally {
      await adapter.disconnect()
      window.apexDesktop = originalDesktop
    }
  })
})
