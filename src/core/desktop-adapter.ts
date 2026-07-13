import type {
  AdapterStatusListener,
  TelemetryAdapter,
  TelemetryAdapterCapabilities,
  TelemetryAdapterStatus,
  TelemetryFrameListener,
  Unsubscribe,
} from './telemetry-adapter'
import type {
  CarDescriptor,
  CarState,
  DriverDescriptor,
  OpponentState,
  PitState,
  SessionPhase,
  TelemetryFrame,
  TyreCompound,
  TyreState,
  VehicleClass,
  WeatherState,
  WheelPosition,
  WheelStates,
} from './types'

interface RawBridgeWheel {
  position: string
  pressurePsi: number
  surfaceTempC: [number, number, number] // inner, center, outer
  carcassTempC: number
  brakeTempC: number
  wearRemaining: number
  rideHeightM: number
  suspensionM: number
  rotationRadSec: number
  flat: boolean
  detached: boolean
}

interface RawBridgeVehicle {
  id: number
  driver: string
  name: string
  class: string
  controlOwner?: 'local-player' | 'ai' | 'remote' | 'replay' | 'unknown'
  worldPositionM?: { x: number; y: number; z: number }
  gameElapsedSeconds?: number
  lapStartSeconds?: number
  position: number
  lap: number
  sector: number
  lapDistanceM: number
  speedKph: number
  rpm: number
  maximumRpm: number
  gear: number
  throttle: number
  brake: number
  steering: number
  clutch: number
  fuelL: number
  fuelCapacityL: number
  batteryFraction: number
  rearBrakeBias: number
  deltaBestSeconds: number
  bestLapSeconds: number
  lastLapSeconds: number
  timeBehindLeaderSeconds: number
  timeBehindNextSeconds: number
  inPits: boolean
  pitState: number
  frontCompound: string
  rearCompound: string
  wheels: [RawBridgeWheel, RawBridgeWheel, RawBridgeWheel, RawBridgeWheel]
}

interface RawBridgeOpponent {
  id: number
  driver: string
  name: string
  class: string
  position: number
  laps: number
  lapDistanceM: number
  worldPositionM?: { x: number; y: number; z: number }
  bestLapSeconds: number
  lastLapSeconds: number
  behindLeaderSeconds: number
  behindNextSeconds: number
  lapsBehindLeader: number
  inPits: boolean
  pitState: number
}

interface RawBridgeFrame {
  protocolVersion?: number
  source?: 'lmu-shared-memory' | 'self-test' | 'recording-replay'
  runId?: string
  desktopSessionId?: string
  desktopLapId?: string | null
  desktopSessionStartedAt?: string
  type: 'telemetry'
  capturedAt: string
  sequence: number
  playerTelemetryAvailable?: boolean
  session: {
    track: string
    layout?: string
    elapsedSeconds: number
    endSeconds: number
    maximumLaps: number
    trackLengthM: number
    phase: number
    inRealtime: boolean
    airTempC: number
    trackTempC: number
    rain: number
    wetness: number
    windSpeedMps: number
    yellowState: number
  }
  player: RawBridgeVehicle
  opponents: RawBridgeOpponent[]
}

interface RawBridgeStatus {
  type: 'status'
  state: string
  message?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRawFrame(value: unknown): value is RawBridgeFrame {
  return isRecord(value) && value.type === 'telemetry' && isRecord(value.session) && isRecord(value.player) && Array.isArray(value.opponents)
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalVector(value: unknown) {
  if (!isRecord(value)) return undefined
  const { x, y, z } = value
  return typeof x === 'number' && Number.isFinite(x)
    && typeof y === 'number' && Number.isFinite(y)
    && typeof z === 'number' && Number.isFinite(z)
    ? { x, y, z }
    : undefined
}

function normalizeClass(raw: string): VehicleClass {
  const value = raw.toLowerCase()
  if (value.includes('hyper') || value.includes('lmh') || value.includes('lmdh')) return 'HYPERCAR'
  if (value.includes('lmp2')) return 'LMP2'
  if (value.includes('lmgt3') || value.includes('gt3') || value.includes('gte')) return 'LMGT3'
  return 'UNKNOWN'
}

function normalizeCompound(raw: string): TyreCompound {
  const value = raw.toLowerCase()
  if (value.includes('soft')) return 'soft'
  if (value.includes('medium')) return 'medium'
  if (value.includes('hard')) return 'hard'
  if (value.includes('wet')) return 'wet'
  return 'unknown'
}

function pitState(inPits: boolean, raw: number): PitState {
  if (!inPits && raw === 0) return 'none'
  if (raw >= 5) return 'exiting'
  if (raw >= 3) return 'stopped'
  return inPits ? 'in-lane' : 'approaching'
}

function phase(frame: RawBridgeFrame): SessionPhase {
  if (!frame.session.inRealtime) return 'garage'
  if (frame.session.yellowState > 0) return 'full-course-yellow'
  if (frame.session.endSeconds > 0 && frame.session.elapsedSeconds >= frame.session.endSeconds) return 'checkered'
  return 'green'
}

function makeCar(id: number, name: string, rawClass: string, fuelCapacity = 0): CarDescriptor {
  return {
    id: `lmu-car-${id}`,
    manufacturer: '',
    model: name || `Car ${id}`,
    vehicleClass: normalizeClass(rawClass),
    carNumber: '',
    teamName: '',
    maxFuelLiters: Math.max(0, fuelCapacity),
    electricHybrid: normalizeClass(rawClass) === 'HYPERCAR',
  }
}

function makeDriver(id: number, name: string, isPlayer = false): DriverDescriptor {
  const displayName = name || (isPlayer ? 'Player' : `Driver ${id}`)
  const parts = displayName.trim().split(/\s+/)
  return { id: `lmu-driver-${id}`, displayName, shortName: parts.length > 1 ? `${parts[0][0]}. ${parts.at(-1)}` : displayName, isPlayer }
}

function emptyTyre(compound: TyreCompound): TyreState {
  return { compound, pressureKpa: 0, innerTemperatureC: 0, middleTemperatureC: 0, outerTemperatureC: 0, carcassTemperatureC: 0, brakeTemperatureC: 0, wearPercent: 100, rideHeightMm: 0, detached: false }
}

function mapWheel(raw: RawBridgeWheel | undefined, compound: TyreCompound): TyreState {
  if (!raw) return emptyTyre(compound)
  return {
    compound,
    pressureKpa: finite(raw.pressurePsi) * 6.894757,
    innerTemperatureC: finite(raw.surfaceTempC?.[0]),
    middleTemperatureC: finite(raw.surfaceTempC?.[1]),
    outerTemperatureC: finite(raw.surfaceTempC?.[2]),
    carcassTemperatureC: finite(raw.carcassTempC),
    brakeTemperatureC: finite(raw.brakeTempC),
    wearPercent: Math.max(0, Math.min(100, finite(raw.wearRemaining, 1) * 100)),
    rideHeightMm: finite(raw.rideHeightM) * 1000,
    detached: Boolean(raw.detached),
  }
}

function mapWeather(raw: RawBridgeFrame['session']): WeatherState {
  const wetness = Math.max(0, Math.min(1, finite(raw.wetness)))
  return {
    ambientTemperatureC: finite(raw.airTempC),
    trackTemperatureC: finite(raw.trackTempC),
    rainIntensity: Math.max(0, Math.min(1, finite(raw.rain))),
    windSpeedMps: finite(raw.windSpeedMps),
    trackCondition: wetness > 0.75 ? 'flooded' : wetness > 0.35 ? 'wet' : wetness > 0.05 ? 'damp' : 'dry',
    wetness,
  }
}

export function mapBridgeFrame(raw: RawBridgeFrame, startedAt: string): TelemetryFrame {
  const playerClass = normalizeClass(raw.player.class)
  const trackLength = Math.max(1, finite(raw.session.trackLengthM, 1))
  const frontCompound = normalizeCompound(raw.player.frontCompound)
  const rearCompound = normalizeCompound(raw.player.rearCompound)
  const wheelPositions: WheelPosition[] = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight']
  const wheels = Object.fromEntries(wheelPositions.map((position, index) => [position, mapWheel(raw.player.wheels[index], index < 2 ? frontCompound : rearCompound)])) as unknown as WheelStates
  const inputs = { throttle: finite(raw.player.throttle), brake: finite(raw.player.brake), clutch: finite(raw.player.clutch), steering: finite(raw.player.steering), handbrake: 0 }
  const motion = { speedKph: finite(raw.player.speedKph) }
  const powertrain = { gear: Math.trunc(finite(raw.player.gear)), rpm: finite(raw.player.rpm), maxRpm: finite(raw.player.maximumRpm), fuelLiters: finite(raw.player.fuelL), fuelPerLapEstimateLiters: null, lapsOfFuelEstimate: null }
  const hybrid = playerClass === 'HYPERCAR' ? { stateOfChargePercent: finite(raw.player.batteryFraction) * 100 } : null
  const playerCar = makeCar(raw.player.id, raw.player.name, raw.player.class, raw.player.fuelCapacityL)
  const player: CarState = {
    car: playerCar,
    driver: makeDriver(raw.player.id, raw.player.driver, true),
    overallPosition: Math.max(1, Math.trunc(finite(raw.player.position, 1))),
    classPosition: 1 + raw.opponents.filter((opponent) => normalizeClass(opponent.class) === playerClass && opponent.position < raw.player.position).length,
    completedLaps: Math.max(0, Math.trunc(finite(raw.player.lap) - 1)),
    currentLapNumber: Math.max(1, Math.trunc(finite(raw.player.lap, 1))),
    currentLapTimeMs: 0,
    lastLapTimeMs: raw.player.lastLapSeconds > 0 ? raw.player.lastLapSeconds * 1000 : null,
    bestLapTimeMs: raw.player.bestLapSeconds > 0 ? raw.player.bestLapSeconds * 1000 : null,
    sectorIndex: Math.max(1, Math.min(3, Math.trunc(finite(raw.player.sector, 1)))) as 1 | 2 | 3,
    sectorTimesMs: [null, null, null],
    distanceM: finite(raw.player.lapDistanceM),
    distanceFraction: Math.max(0, Math.min(1, finite(raw.player.lapDistanceM) / trackLength)),
    pitState: pitState(raw.player.inPits, raw.player.pitState),
    limiterActive: false,
    headlightsActive: false,
    tractionControlLevel: 0,
    absLevel: 0,
    engineMap: 0,
    inputs, motion, powertrain, hybrid, wheels,
    worldPositionM: optionalVector(raw.player.worldPositionM),
  }
  const opponents: OpponentState[] = raw.opponents.map((opponent) => ({
    car: makeCar(opponent.id, opponent.name, opponent.class), driver: makeDriver(opponent.id, opponent.driver),
    overallPosition: Math.max(1, opponent.position), classPosition: 1 + raw.opponents.filter((candidate) => normalizeClass(candidate.class) === normalizeClass(opponent.class) && candidate.position < opponent.position).length,
    completedLaps: Math.max(0, opponent.laps), currentLapNumber: Math.max(1, opponent.laps + 1), distanceM: finite(opponent.lapDistanceM),
    distanceFraction: Math.max(0, Math.min(1, finite(opponent.lapDistanceM) / trackLength)),
    gapToPlayerMs: (finite(opponent.behindLeaderSeconds) - finite(raw.player.timeBehindLeaderSeconds)) * 1000,
    intervalAheadMs: opponent.behindNextSeconds > 0 ? opponent.behindNextSeconds * 1000 : null,
    lastLapTimeMs: opponent.lastLapSeconds > 0 ? opponent.lastLapSeconds * 1000 : null, bestLapTimeMs: opponent.bestLapSeconds > 0 ? opponent.bestLapSeconds * 1000 : null,
    pitState: pitState(opponent.inPits, opponent.pitState), isConnected: true, isPlayerClass: normalizeClass(opponent.class) === playerClass,
    worldPositionM: optionalVector(opponent.worldPositionM),
  }))
  const sessionId = raw.desktopSessionId || `lmu-${raw.session.track || 'session'}-${startedAt}`
  const sessionStartedAt = raw.desktopSessionStartedAt || startedAt
  const weather = mapWeather(raw.session)
  const gameElapsedSeconds = typeof raw.player.gameElapsedSeconds === 'number' && Number.isFinite(raw.player.gameElapsedSeconds) ? raw.player.gameElapsedSeconds : raw.session.elapsedSeconds
  const lapStartSeconds = typeof raw.player.lapStartSeconds === 'number' && Number.isFinite(raw.player.lapStartSeconds) ? raw.player.lapStartSeconds : undefined
  const sample = { sequence: raw.sequence, sessionId, lapId: raw.desktopLapId || `${sessionId}-lap-${player.currentLapNumber}`, capturedAt: raw.capturedAt, sessionElapsedMs: gameElapsedSeconds * 1000, lapElapsedMs: lapStartSeconds === undefined ? 0 : Math.max(0, gameElapsedSeconds - lapStartSeconds) * 1000, distanceM: player.distanceM, distanceFraction: player.distanceFraction, sectorIndex: player.sectorIndex, isInPitLane: player.pitState !== 'none', inputs, motion, powertrain, hybrid, wheels, worldPositionM: optionalVector(raw.player.worldPositionM), controlOwner: raw.player.controlOwner ?? 'unknown' }
  return {
    sequence: raw.sequence, source: raw.source,
    capturedAt: raw.capturedAt,
    session: { id: sessionId, kind: 'race', eventName: raw.session.track, serverName: '', track: { id: raw.session.track.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: raw.session.track, layout: raw.session.layout ?? '', countryCode: '', lengthM: trackLength, cornerCount: 0, pitLaneLossEstimateMs: 0 }, startedAt: sessionStartedAt, scheduledDurationMs: raw.session.endSeconds > 0 ? raw.session.endSeconds * 1000 : null, scheduledLaps: raw.session.maximumLaps > 0 ? raw.session.maximumLaps : null, isMultiplayer: raw.opponents.length > 0 },
    sessionState: { phase: phase(raw), flag: raw.session.yellowState > 0 ? 'yellow' : 'green', elapsedMs: raw.session.elapsedSeconds * 1000, remainingMs: raw.session.endSeconds > 0 ? Math.max(0, raw.session.endSeconds - raw.session.elapsedSeconds) * 1000 : null, currentLap: player.currentLapNumber, totalLaps: raw.session.maximumLaps > 0 ? raw.session.maximumLaps : null, sessionBestLapMs: null, incidentCount: 0 },
    weather, player, opponents, sample, events: [], sourceState: raw.playerTelemetryAvailable === false ? 'session-only' : 'vehicle-telemetry',
  }
}

export class DesktopTelemetryAdapter implements TelemetryAdapter {
  readonly id = 'lmu-official-shared-memory'
  readonly displayName = 'Le Mans Ultimate official shared memory'
  readonly capabilities: TelemetryAdapterCapabilities = Object.freeze({ liveTelemetry: true, opponents: true, weather: true, hybrid: true, tyreSurfaceTemperatures: true, setupRead: false, setupWrite: false })
  private frameListeners = new Set<TelemetryFrameListener>()
  private statusListeners = new Set<AdapterStatusListener>()
  private unsubscribeDesktop: (() => void) | null = null
  private latestFrame: TelemetryFrame | null = null
  private startedAt: string | null = null
  private status: TelemetryAdapterStatus = { state: 'idle', sourceName: this.displayName, sampleRateHz: 50, connectedAt: null, lastFrameAt: null, framesReceived: 0, error: null }

  async connect(): Promise<void> {
    if (!window.apexDesktop) throw new Error('The LMU bridge requires the desktop application.')
    if (this.status.state === 'connected' || this.status.state === 'connecting') return
    this.setStatus({ state: 'connecting', error: null, detail: 'Starting the local LMU bridge…' })
    this.unsubscribeDesktop = window.apexDesktop.onTelemetryMessage((message) => this.handleMessage(message))
    const result = await window.apexDesktop.startTelemetry()
    if (!result.ok && result.reason !== 'unsupported-platform') this.setStatus({ state: 'error', error: result.reason ?? 'Unable to start LMU bridge' })
  }

  async disconnect(): Promise<void> {
    this.unsubscribeDesktop?.()
    this.unsubscribeDesktop = null
    await window.apexDesktop?.stopTelemetry()
    this.latestFrame = null
    this.startedAt = null
    this.setStatus({ state: 'idle', connectedAt: null, lastFrameAt: null })
  }

  getStatus() { return this.status }
  getLatestFrame() { return this.latestFrame }
  subscribe(listener: TelemetryFrameListener): Unsubscribe { this.frameListeners.add(listener); return () => this.frameListeners.delete(listener) }
  subscribeStatus(listener: AdapterStatusListener): Unsubscribe { this.statusListeners.add(listener); listener(this.status); return () => this.statusListeners.delete(listener) }

  private handleMessage(message: unknown) {
    // The one-shot bridge diagnostic shares the IPC channel so it can prove
    // that transport path. It must never make the production adapter or UI
    // claim that LMU itself is connected.
    if (isRecord(message) && message.source === 'self-test') return
    if (isRawFrame(message)) {
      this.startedAt ??= message.capturedAt
      const frame = mapBridgeFrame(message, this.startedAt)
      this.latestFrame = frame
      this.setStatus({ state: 'connected', connectedAt: this.status.connectedAt ?? frame.capturedAt, lastFrameAt: frame.capturedAt, framesReceived: this.status.framesReceived + 1, error: null })
      for (const listener of this.frameListeners) listener(frame)
      return
    }
    if (isRecord(message) && message.type === 'status') {
      const status = message as unknown as RawBridgeStatus
      if (status.state === 'connected') this.setStatus({ state: 'connected', connectedAt: this.status.connectedAt ?? new Date().toISOString(), error: null, detail: status.message ?? 'LMU shared memory connected.' })
      else if (status.state === 'error' || status.state === 'missing') {
        this.latestFrame = null
        this.setStatus({ state: 'error', connectedAt: null, lastFrameAt: null, error: status.message ?? status.state, detail: status.message ?? status.state })
      } else {
        this.latestFrame = null
        this.setStatus({ state: 'connecting', connectedAt: null, lastFrameAt: null, error: null, detail: status.message ?? status.state })
      }
    }
  }

  private setStatus(update: Partial<TelemetryAdapterStatus>) { this.status = Object.freeze({ ...this.status, ...update }); for (const listener of this.statusListeners) listener(this.status) }
}
