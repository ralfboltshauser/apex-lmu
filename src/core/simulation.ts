import type {
  CarDescriptor,
  CarState,
  DamageState,
  DriverDescriptor,
  DriverInputs,
  HybridState,
  MotionState,
  OpponentState,
  PitState,
  PowertrainState,
  SessionDescriptor,
  SessionState,
  TelemetryEvent,
  TelemetryFrame,
  TelemetrySample,
  TrackDescriptor,
  TyreState,
  VehicleClass,
  WeatherState,
  WheelPosition,
  WheelStates,
} from './types'

export interface SimulationOptions {
  readonly seed?: number
  readonly stepMs?: number
  readonly fieldSize?: number
  /** ISO timestamp assigned to the first emitted frame. */
  readonly capturedAt?: string
  readonly sessionId?: string
  readonly playerName?: string
  readonly playerCarNumber?: string
  readonly startSessionElapsedMs?: number
  readonly startLapNumber?: number
  readonly startDistanceFraction?: number
}

interface ResolvedSimulationOptions {
  readonly seed: number
  readonly stepMs: number
  readonly fieldSize: number
  readonly capturedAt: string
  readonly sessionId: string
  readonly playerName: string
  readonly playerCarNumber: string
  readonly startSessionElapsedMs: number
  readonly startLapNumber: number
  readonly startDistanceFraction: number
}

interface OpponentProfile {
  readonly car: CarDescriptor
  readonly driver: DriverDescriptor
  readonly initialGapM: number
  readonly paceFactor: number
  readonly phase: number
}

interface OpponentRuntime extends OpponentProfile {
  raceDistanceM: number
  lastLapTimeMs: number | null
  bestLapTimeMs: number | null
  lapStartedAtMs: number
}

interface SpeedPoint {
  readonly fraction: number
  readonly speedKph: number
}

const MS_PER_HOUR = 3_600_000
const GRAVITY_MPS2 = 9.80665
const DEFAULT_CAPTURED_AT = '2026-06-14T14:24:00.000Z'

export const LE_MANS_TRACK: TrackDescriptor = Object.freeze({
  id: 'circuit-de-la-sarthe-2024',
  name: 'Circuit de la Sarthe',
  layout: 'Le Mans',
  countryCode: 'FR',
  lengthM: 13_626,
  cornerCount: 38,
  pitLaneLossEstimateMs: 72_000,
})

export const SIMULATED_PLAYER_CAR: CarDescriptor = Object.freeze({
  id: 'ferrari-499p-51',
  manufacturer: 'Ferrari',
  model: '499P',
  vehicleClass: 'HYPERCAR',
  carNumber: '51',
  teamName: 'Apex Open Racing',
  maxFuelLiters: 90,
  electricHybrid: true,
})

const SPEED_PROFILE: readonly SpeedPoint[] = [
  { fraction: 0, speedKph: 270 },
  { fraction: 0.018, speedKph: 190 },
  { fraction: 0.035, speedKph: 118 },
  { fraction: 0.058, speedKph: 238 },
  { fraction: 0.087, speedKph: 98 },
  { fraction: 0.12, speedKph: 276 },
  { fraction: 0.2, speedKph: 326 },
  { fraction: 0.238, speedKph: 112 },
  { fraction: 0.275, speedKph: 288 },
  { fraction: 0.36, speedKph: 329 },
  { fraction: 0.398, speedKph: 109 },
  { fraction: 0.445, speedKph: 313 },
  { fraction: 0.545, speedKph: 337 },
  { fraction: 0.578, speedKph: 106 },
  { fraction: 0.62, speedKph: 265 },
  { fraction: 0.7, speedKph: 321 },
  { fraction: 0.735, speedKph: 168 },
  { fraction: 0.762, speedKph: 86 },
  { fraction: 0.81, speedKph: 274 },
  { fraction: 0.88, speedKph: 306 },
  { fraction: 0.908, speedKph: 181 },
  { fraction: 0.928, speedKph: 247 },
  { fraction: 0.947, speedKph: 204 },
  { fraction: 0.965, speedKph: 126 },
  { fraction: 0.984, speedKph: 104 },
  { fraction: 1, speedKph: 270 },
]

const CORNERS: readonly { readonly center: number; readonly width: number; readonly direction: -1 | 1 }[] = [
  { center: 0.027, width: 0.012, direction: 1 },
  { center: 0.087, width: 0.01, direction: -1 },
  { center: 0.238, width: 0.009, direction: 1 },
  { center: 0.398, width: 0.009, direction: -1 },
  { center: 0.578, width: 0.012, direction: 1 },
  { center: 0.735, width: 0.01, direction: -1 },
  { center: 0.762, width: 0.009, direction: 1 },
  { center: 0.908, width: 0.012, direction: 1 },
  { center: 0.947, width: 0.01, direction: -1 },
  { center: 0.975, width: 0.012, direction: 1 },
]

const VEHICLE_SPEED_FACTOR: Readonly<Record<VehicleClass, number>> = {
  HYPERCAR: 1,
  LMP2: 0.91,
  LMGT3: 0.76,
  UNKNOWN: 0.85,
}

const VEHICLE_TOP_SPEED_KPH: Readonly<Record<VehicleClass, number>> = {
  HYPERCAR: 341,
  LMP2: 323,
  LMGT3: 295,
  UNKNOWN: 315,
}

const OPPONENT_TEMPLATES: readonly Omit<OpponentProfile, 'phase'>[] = [
  opponent('porsche-963-6', 'Porsche', '963', 'HYPERCAR', '6', 'Porsche Penske', 'Kevin Estre', 742, 1.006, true),
  opponent('toyota-gr010-8', 'Toyota', 'GR010 Hybrid', 'HYPERCAR', '8', 'Toyota Gazoo Racing', 'Sébastien Buemi', 381, 1.002, true),
  opponent('ferrari-499p-50', 'Ferrari', '499P', 'HYPERCAR', '50', 'Ferrari AF Corse', 'Antonio Fuoco', 129, 0.999, true),
  opponent('bmw-m-hybrid-15', 'BMW', 'M Hybrid V8', 'HYPERCAR', '15', 'BMW M Team WRT', 'Dries Vanthoor', -286, 0.996, true),
  opponent('alpine-a424-36', 'Alpine', 'A424', 'HYPERCAR', '36', 'Alpine Endurance Team', 'Mick Schumacher', -634, 0.992, true),
  opponent('cadillac-vseries-2', 'Cadillac', 'V-Series.R', 'HYPERCAR', '2', 'Cadillac Racing', 'Earl Bamber', -1_010, 0.994, true),
  opponent('oreca-07-183', 'Oreca', '07 Gibson', 'LMP2', '183', 'AF Corse', 'François Perrodo', -12_840, 1.005, false),
  opponent('oreca-07-22', 'Oreca', '07 Gibson', 'LMP2', '22', 'United Autosports', 'Oliver Jarvis', -13_420, 1.009, false),
  opponent('oreca-07-28', 'Oreca', '07 Gibson', 'LMP2', '28', 'IDEC Sport', 'Paul Lafargue', -14_100, 0.997, false),
  opponent('oreca-07-10', 'Oreca', '07 Gibson', 'LMP2', '10', 'Vector Sport', 'Ryan Cullen', -15_330, 1.001, false),
  opponent('mustang-gt3-88', 'Ford', 'Mustang LMGT3', 'LMGT3', '88', 'Proton Competition', 'Dennis Olsen', -26_380, 1.008, false),
  opponent('corvette-z06-81', 'Chevrolet', 'Corvette Z06 GT3.R', 'LMGT3', '81', 'TF Sport', 'Charlie Eastwood', -27_020, 1.004, false),
  opponent('porsche-911-92', 'Porsche', '911 GT3 R', 'LMGT3', '92', 'Manthey PureRxcing', 'Klaus Bachler', -27_740, 1.011, false),
  opponent('ferrari-296-54', 'Ferrari', '296 LMGT3', 'LMGT3', '54', 'Vista AF Corse', 'Thomas Flohr', -28_560, 0.994, false),
  opponent('mclaren-720s-95', 'McLaren', '720S LMGT3 Evo', 'LMGT3', '95', 'United Autosports', 'Marvin Kirchhöfer', -29_310, 1.006, false),
]

const WHEEL_POSITIONS: readonly WheelPosition[] = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight']

export function* createSimulationFrames(
  options: SimulationOptions = {},
): Generator<TelemetryFrame, never, void> {
  const resolved = resolveOptions(options)
  const random = mulberry32(resolved.seed)
  const captureEpochMs = Date.parse(resolved.capturedAt)
  const startedAtEpochMs = captureEpochMs - resolved.startSessionElapsedMs
  const session = createSession(resolved, startedAtEpochMs)
  const playerDriver: DriverDescriptor = {
    id: 'player',
    displayName: resolved.playerName,
    shortName: shortName(resolved.playerName),
    isPlayer: true,
  }
  const playerCar: CarDescriptor = {
    ...SIMULATED_PLAYER_CAR,
    carNumber: resolved.playerCarNumber,
  }
  const startCompletedLaps = resolved.startLapNumber - 1
  const startDistanceM = resolved.startDistanceFraction * LE_MANS_TRACK.lengthM
  let raceDistanceM = startCompletedLaps * LE_MANS_TRACK.lengthM + startDistanceM
  let distanceM = startDistanceM
  let lapNumber = resolved.startLapNumber
  let sessionElapsedMs = resolved.startSessionElapsedMs
  let lapElapsedMs = estimateElapsedAtDistance(resolved.startDistanceFraction, 'HYPERCAR')
  let sequence = 0
  let previousSpeedKph = speedAt(resolved.startDistanceFraction, 'HYPERCAR')
  let fuelLiters = 56.8
  let hybridChargePercent = 63.4
  let virtualEnergyPercent = 71.2
  let tyreWearPercent = 7.8
  let lastLapTimeMs: number | null = 207_314
  let bestLapTimeMs: number | null = 204_862
  let completedSectorTimes: [number | null, number | null, number | null] = [67_921, null, null]
  let pendingEvents: TelemetryEvent[] = []
  const opponentRuntimes = createOpponentRuntimes(resolved, raceDistanceM, sessionElapsedMs, random)
  const basePhase = random() * Math.PI * 2

  while (true) {
    const fraction = distanceM / LE_MANS_TRACK.lengthM
    const coherentNoise = Math.sin(sequence * 0.071 + basePhase) * 0.65
    const speedKph = Math.max(45, speedAt(fraction, 'HYPERCAR') + coherentNoise)
    const nextTargetKph = speedAt(wrap01(fraction + 0.008), 'HYPERCAR')
    const inputs = createInputs(fraction, speedKph, nextTargetKph)
    const motion = createMotion(fraction, speedKph, previousSpeedKph, resolved.stepMs, inputs)
    const powertrain = createPowertrain(speedKph, fuelLiters)
    const hybrid = createHybrid(inputs, hybridChargePercent, virtualEnergyPercent)
    const wheels = createWheelStates(fraction, speedKph, inputs, tyreWearPercent, sequence)
    const sectorIndex = sectorAt(fraction)
    const positions = calculatePositions(raceDistanceM, playerCar, opponentRuntimes)
    const playerPosition = positions.positionByCarId.get(playerCar.id) ?? 1
    const playerClassPosition = positions.classPositionByCarId.get(playerCar.id) ?? 1
    const captureTime = new Date(captureEpochMs + sessionElapsedMs - resolved.startSessionElapsedMs).toISOString()
    const currentLapId = `${resolved.sessionId}:lap:${lapNumber}`
    const sample: TelemetrySample = {
      sequence,
      sessionId: resolved.sessionId,
      lapId: currentLapId,
      capturedAt: captureTime,
      sessionElapsedMs,
      lapElapsedMs,
      distanceM,
      distanceFraction: fraction,
      sectorIndex,
      isInPitLane: false,
      inputs,
      motion,
      powertrain,
      hybrid,
      wheels,
    }
    const player: CarState = {
      car: playerCar,
      driver: playerDriver,
      overallPosition: playerPosition,
      classPosition: playerClassPosition,
      completedLaps: lapNumber - 1,
      currentLapNumber: lapNumber,
      currentLapTimeMs: lapElapsedMs,
      lastLapTimeMs,
      bestLapTimeMs,
      sectorIndex,
      sectorTimesMs: completedSectorTimes,
      distanceM,
      distanceFraction: fraction,
      pitState: 'none',
      limiterActive: false,
      headlightsActive: true,
      tractionControlLevel: 4,
      absLevel: 3,
      engineMap: 2,
      inputs,
      motion,
      powertrain,
      hybrid,
      wheels,
      damage: undamagedCar(),
    }
    const opponents = buildOpponentStates(opponentRuntimes, raceDistanceM, positions)
    const sessionState: SessionState = {
      phase: 'green',
      flag: 'green',
      elapsedMs: sessionElapsedMs,
      remainingMs: Math.max(0, session.scheduledDurationMs! - sessionElapsedMs),
      currentLap: lapNumber,
      totalLaps: null,
      sessionBestLapMs: minimumDefined([
        bestLapTimeMs,
        ...opponents.map((entry) => entry.bestLapTimeMs),
      ]),
      incidentCount: 0,
    }
    const frame: TelemetryFrame = {
      sequence,
      capturedAt: captureTime,
      session,
      sessionState,
      weather: createWeather(sessionElapsedMs),
      player,
      opponents,
      sample,
      events: pendingEvents,
    }

    yield frame

    pendingEvents = []
    const stepSeconds = resolved.stepMs / 1_000
    const distanceStepM = (speedKph / 3.6) * stepSeconds
    const previousFraction = fraction
    distanceM += distanceStepM
    raceDistanceM += distanceStepM
    lapElapsedMs += resolved.stepMs
    sessionElapsedMs += resolved.stepMs
    fuelLiters = Math.max(0, fuelLiters - (distanceStepM / LE_MANS_TRACK.lengthM) * 6.42)
    virtualEnergyPercent = Math.max(0, virtualEnergyPercent - (distanceStepM / LE_MANS_TRACK.lengthM) * 7.55)
    const hybridDelta = (inputs.brake * 0.032 - inputs.throttle * 0.011) * stepSeconds
    hybridChargePercent = clamp(hybridChargePercent + hybridDelta, 18, 92)
    tyreWearPercent = clamp(tyreWearPercent + (distanceStepM / LE_MANS_TRACK.lengthM) * 0.72, 0, 100)

    const newFractionBeforeWrap = distanceM / LE_MANS_TRACK.lengthM
    if (previousFraction < 0.33 && newFractionBeforeWrap >= 0.33) {
      completedSectorTimes = [lapElapsedMs, null, null]
    }
    if (previousFraction < 0.68 && newFractionBeforeWrap >= 0.68) {
      const sectorOne = completedSectorTimes[0] ?? Math.round(lapElapsedMs * 0.49)
      completedSectorTimes = [sectorOne, lapElapsedMs - sectorOne, null]
    }

    if (distanceM >= LE_MANS_TRACK.lengthM) {
      const completedLapId = `${resolved.sessionId}:lap:${lapNumber}`
      distanceM %= LE_MANS_TRACK.lengthM
      const completedLapTimeMs = lapElapsedMs
      lastLapTimeMs = completedLapTimeMs
      const isPersonalBest = bestLapTimeMs === null || completedLapTimeMs < bestLapTimeMs
      bestLapTimeMs = bestLapTimeMs === null ? completedLapTimeMs : Math.min(bestLapTimeMs, completedLapTimeMs)
      lapNumber += 1
      lapElapsedMs = 0
      completedSectorTimes = [null, null, null]
      pendingEvents = [
        {
          id: `event:${sequence}:lap-completed`,
          type: 'lap-completed',
          sessionElapsedMs,
          lapId: completedLapId,
          message: `Lap ${lapNumber - 1} completed in ${formatLapTime(completedLapTimeMs)}`,
        },
        {
          id: `event:${sequence}:lap-started`,
          type: 'lap-started',
          sessionElapsedMs,
          lapId: `${resolved.sessionId}:lap:${lapNumber}`,
          message: `Lap ${lapNumber} started`,
        },
      ]
      if (isPersonalBest) {
        pendingEvents.push({
          id: `event:${sequence}:personal-best`,
          type: 'personal-best',
          sessionElapsedMs,
          lapId: completedLapId,
          message: `New personal best: ${formatLapTime(completedLapTimeMs)}`,
        })
      }
    }

    updateOpponents(opponentRuntimes, resolved.stepMs, sessionElapsedMs)
    previousSpeedKph = speedKph
    sequence += 1
  }
}

export function takeSimulationFrames(count: number, options: SimulationOptions = {}): readonly TelemetryFrame[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('count must be a non-negative integer')
  }
  const stream = createSimulationFrames(options)
  const frames: TelemetryFrame[] = []
  for (let index = 0; index < count; index += 1) {
    frames.push(stream.next().value)
  }
  return frames
}

function resolveOptions(options: SimulationOptions): ResolvedSimulationOptions {
  const stepMs = options.stepMs ?? 100
  if (!Number.isFinite(stepMs) || stepMs < 20 || stepMs > 1_000) {
    throw new RangeError('stepMs must be between 20 and 1000 milliseconds')
  }
  const fieldSize = options.fieldSize ?? 15
  if (!Number.isInteger(fieldSize) || fieldSize < 0 || fieldSize > OPPONENT_TEMPLATES.length) {
    throw new RangeError(`fieldSize must be between 0 and ${OPPONENT_TEMPLATES.length}`)
  }
  const capturedAt = options.capturedAt ?? DEFAULT_CAPTURED_AT
  if (!Number.isFinite(Date.parse(capturedAt))) {
    throw new TypeError('capturedAt must be a valid ISO date-time')
  }
  const startLapNumber = options.startLapNumber ?? 8
  if (!Number.isInteger(startLapNumber) || startLapNumber < 1) {
    throw new RangeError('startLapNumber must be a positive integer')
  }
  const startDistanceFraction = options.startDistanceFraction ?? 0.42
  if (startDistanceFraction < 0 || startDistanceFraction >= 1) {
    throw new RangeError('startDistanceFraction must be in the range [0, 1)')
  }
  return {
    seed: options.seed ?? 51,
    stepMs,
    fieldSize,
    capturedAt,
    sessionId: options.sessionId ?? 'sim-le-mans-2026-race',
    playerName: options.playerName ?? 'Alex Morgan',
    playerCarNumber: options.playerCarNumber ?? '51',
    startSessionElapsedMs: options.startSessionElapsedMs ?? 24 * 60 * 1_000,
    startLapNumber,
    startDistanceFraction,
  }
}

function createSession(options: ResolvedSimulationOptions, startedAtEpochMs: number): SessionDescriptor {
  return {
    id: options.sessionId,
    kind: 'race',
    eventName: '24 Hours of Le Mans — Open Test',
    serverName: 'Apex Local Simulation',
    track: LE_MANS_TRACK,
    startedAt: new Date(startedAtEpochMs).toISOString(),
    scheduledDurationMs: 100 * 60 * 1_000,
    scheduledLaps: null,
    isMultiplayer: true,
  }
}

function createOpponentRuntimes(
  options: ResolvedSimulationOptions,
  playerRaceDistanceM: number,
  sessionElapsedMs: number,
  random: () => number,
): OpponentRuntime[] {
  return OPPONENT_TEMPLATES.slice(0, options.fieldSize).map((template) => {
    const raceDistanceM = playerRaceDistanceM + template.initialGapM
    const fraction = wrap01(raceDistanceM / LE_MANS_TRACK.lengthM)
    const estimatedElapsed = estimateElapsedAtDistance(fraction, template.car.vehicleClass)
    return {
      ...template,
      phase: random() * Math.PI * 2,
      raceDistanceM,
      lastLapTimeMs: classLapTime(template.car.vehicleClass, template.paceFactor, -1),
      bestLapTimeMs: classLapTime(template.car.vehicleClass, template.paceFactor, -2),
      lapStartedAtMs: sessionElapsedMs - estimatedElapsed,
    }
  })
}

function updateOpponents(runtimes: OpponentRuntime[], stepMs: number, sessionElapsedMs: number): void {
  for (const runtime of runtimes) {
    const previousLap = Math.floor(runtime.raceDistanceM / LE_MANS_TRACK.lengthM)
    const fraction = wrap01(runtime.raceDistanceM / LE_MANS_TRACK.lengthM)
    const noise = Math.sin(sessionElapsedMs / 1_100 + runtime.phase) * 0.42
    const speedKph = Math.max(
      40,
      speedAt(fraction, runtime.car.vehicleClass) * runtime.paceFactor + noise,
    )
    runtime.raceDistanceM += (speedKph / 3.6) * (stepMs / 1_000)
    const currentLap = Math.floor(runtime.raceDistanceM / LE_MANS_TRACK.lengthM)
    if (currentLap > previousLap) {
      const lapTimeMs = sessionElapsedMs - runtime.lapStartedAtMs
      runtime.lastLapTimeMs = lapTimeMs
      runtime.bestLapTimeMs = runtime.bestLapTimeMs === null
        ? lapTimeMs
        : Math.min(runtime.bestLapTimeMs, lapTimeMs)
      runtime.lapStartedAtMs = sessionElapsedMs
    }
  }
}

interface PositionResult {
  readonly positionByCarId: ReadonlyMap<string, number>
  readonly classPositionByCarId: ReadonlyMap<string, number>
  readonly orderedCarIds: readonly string[]
  readonly raceDistanceByCarId: ReadonlyMap<string, number>
}

function calculatePositions(
  playerRaceDistanceM: number,
  playerCar: CarDescriptor,
  runtimes: readonly OpponentRuntime[],
): PositionResult {
  const participants = [
    { car: playerCar, raceDistanceM: playerRaceDistanceM },
    ...runtimes.map((runtime) => ({ car: runtime.car, raceDistanceM: runtime.raceDistanceM })),
  ].sort((left, right) => right.raceDistanceM - left.raceDistanceM)
  const positionByCarId = new Map<string, number>()
  const classPositionByCarId = new Map<string, number>()
  const classCounts = new Map<VehicleClass, number>()
  const raceDistanceByCarId = new Map<string, number>()
  participants.forEach((participant, index) => {
    positionByCarId.set(participant.car.id, index + 1)
    const classPosition = (classCounts.get(participant.car.vehicleClass) ?? 0) + 1
    classCounts.set(participant.car.vehicleClass, classPosition)
    classPositionByCarId.set(participant.car.id, classPosition)
    raceDistanceByCarId.set(participant.car.id, participant.raceDistanceM)
  })
  return {
    positionByCarId,
    classPositionByCarId,
    orderedCarIds: participants.map((participant) => participant.car.id),
    raceDistanceByCarId,
  }
}

function buildOpponentStates(
  runtimes: readonly OpponentRuntime[],
  playerRaceDistanceM: number,
  positions: PositionResult,
): readonly OpponentState[] {
  const states = runtimes.map((runtime): OpponentState => {
    const overallPosition = positions.positionByCarId.get(runtime.car.id) ?? 1
    const fraction = wrap01(runtime.raceDistanceM / LE_MANS_TRACK.lengthM)
    const speedKph = speedAt(fraction, runtime.car.vehicleClass) * runtime.paceFactor
    const carAheadId = overallPosition > 1 ? positions.orderedCarIds[overallPosition - 2] : undefined
    const carAheadDistance = carAheadId === undefined ? undefined : positions.raceDistanceByCarId.get(carAheadId)
    const intervalM = carAheadDistance === undefined ? null : Math.max(0, carAheadDistance - runtime.raceDistanceM)
    return {
      car: runtime.car,
      driver: runtime.driver,
      overallPosition,
      classPosition: positions.classPositionByCarId.get(runtime.car.id) ?? 1,
      completedLaps: Math.max(0, Math.floor(runtime.raceDistanceM / LE_MANS_TRACK.lengthM)),
      currentLapNumber: Math.max(1, Math.floor(runtime.raceDistanceM / LE_MANS_TRACK.lengthM) + 1),
      distanceM: fraction * LE_MANS_TRACK.lengthM,
      distanceFraction: fraction,
      speedKph,
      gapToPlayerMs: ((runtime.raceDistanceM - playerRaceDistanceM) / 64) * 1_000,
      intervalAheadMs: intervalM === null ? null : (intervalM / 64) * 1_000,
      lastLapTimeMs: runtime.lastLapTimeMs,
      bestLapTimeMs: runtime.bestLapTimeMs,
      pitState: pitStateAt(fraction),
      isConnected: true,
      isPlayerClass: runtime.car.vehicleClass === 'HYPERCAR',
    }
  })
  return states.sort((left, right) => left.overallPosition - right.overallPosition)
}

function createInputs(fraction: number, speedKph: number, nextTargetKph: number): DriverInputs {
  const deltaKph = nextTargetKph - speedKph
  const brake = deltaKph < -8 ? clamp((-deltaKph - 4) / 86, 0, 1) : 0
  const throttle = brake > 0.03
    ? 0
    : clamp(0.42 + deltaKph / 40 + (speedKph > 250 ? 0.34 : 0.12), 0.12, 1)
  return {
    throttle,
    brake,
    clutch: 0,
    steering: clamp(curvatureAt(fraction), -1, 1),
    handbrake: 0,
  }
}

function createMotion(
  fraction: number,
  speedKph: number,
  previousSpeedKph: number,
  stepMs: number,
  inputs: DriverInputs,
): MotionState {
  const speedMps = speedKph / 3.6
  const longitudinalAcceleration = ((speedKph - previousSpeedKph) / 3.6) / (stepMs / 1_000)
  const lateralG = clamp(inputs.steering * Math.pow(speedKph / 155, 1.35) * 1.32, -2.8, 2.8)
  const heading = fraction * Math.PI * 2 + inputs.steering * 0.4
  return {
    speedKph,
    velocityMps: {
      x: Math.cos(heading) * speedMps,
      y: 0,
      z: Math.sin(heading) * speedMps,
    },
    accelerationMps2: {
      x: longitudinalAcceleration,
      y: 0,
      z: lateralG * GRAVITY_MPS2,
    },
    gForce: {
      x: longitudinalAcceleration / GRAVITY_MPS2,
      y: lateralG,
      z: 0.02 * Math.sin(fraction * Math.PI * 18),
    },
    yawRad: heading,
    pitchRad: clamp(-longitudinalAcceleration * 0.0025, -0.04, 0.04),
    rollRad: clamp(-lateralG * 0.012, -0.045, 0.045),
    yawRateRadPerSec: lateralG * 0.18,
  }
}

function createPowertrain(speedKph: number, fuelLiters: number): PowertrainState {
  const gear = gearAt(speedKph)
  const bandStart = [0, 0, 82, 132, 183, 232, 280, 320][gear] ?? 0
  const bandEnd = [0, 92, 145, 198, 250, 298, 337, 360][gear] ?? 360
  const gearProgress = clamp((speedKph - bandStart) / Math.max(1, bandEnd - bandStart), 0, 1)
  const rpm = Math.round(5_150 + gearProgress * 3_250)
  return {
    gear,
    rpm,
    maxRpm: 8_600,
    engineTemperatureC: 101.8,
    oilTemperatureC: 108.4,
    waterTemperatureC: 96.2,
    fuelLiters,
    fuelPerLapEstimateLiters: 6.42,
    lapsOfFuelEstimate: fuelLiters / 6.42,
  }
}

function createHybrid(
  inputs: DriverInputs,
  stateOfChargePercent: number,
  virtualEnergyPercent: number,
): HybridState {
  return {
    stateOfChargePercent,
    virtualEnergyPercent,
    deploymentKw: inputs.throttle > 0.82 ? 198 * inputs.throttle : 0,
    regenerationKw: inputs.brake > 0.04 ? 175 * inputs.brake : 0,
    deploymentMode: 'Balanced',
  }
}

function createWheelStates(
  fraction: number,
  speedKph: number,
  inputs: DriverInputs,
  wearPercent: number,
  sequence: number,
): WheelStates {
  const steeringLoad = inputs.steering
  const brakeHeat = inputs.brake * 280
  const values = {} as Record<WheelPosition, TyreState>
  for (const [index, position] of WHEEL_POSITIONS.entries()) {
    const front = position.startsWith('front')
    const left = position.endsWith('Left')
    const outsideLoad = steeringLoad === 0 ? 0 : (steeringLoad > 0) === left ? -1 : 1
    const temperatureOffset = outsideLoad * Math.abs(steeringLoad) * 2.8 + (front ? 1.2 : 0)
    const pulse = Math.sin(sequence * 0.015 + index * 1.7 + fraction * 8) * 0.35
    const carcassTemperatureC = 88.5 + temperatureOffset + pulse + inputs.brake * 1.4
    values[position] = {
      compound: 'medium',
      pressureKpa: 185.4 + temperatureOffset * 0.3 + pulse,
      innerTemperatureC: carcassTemperatureC + (front ? 3.4 : 2.1),
      middleTemperatureC: carcassTemperatureC + 1.2,
      outerTemperatureC: carcassTemperatureC - (front ? 1.8 : 1.1),
      carcassTemperatureC,
      brakeTemperatureC: 465 + brakeHeat + (front ? 74 : 0) + pulse * 8,
      wearPercent: wearPercent + (front ? 0.35 : 0) + Math.max(0, outsideLoad) * 0.18,
      slipRatio: inputs.brake * -0.045 + inputs.throttle * (front ? 0.006 : 0.014),
      slipAngleDeg: Math.abs(inputs.steering) * (front ? 3.8 : 2.7),
      rideHeightMm: (front ? 51 : 67) - speedKph * (front ? 0.012 : 0.008),
      detached: false,
    }
  }
  return values
}

function createWeather(elapsedMs: number): WeatherState {
  const slowWave = Math.sin(elapsedMs / MS_PER_HOUR * Math.PI)
  return {
    ambientTemperatureC: 19.4 + slowWave * 0.4,
    trackTemperatureC: 27.2 + slowWave * 0.8,
    rainIntensity: 0,
    cloudCover: 0.34,
    windSpeedMps: 3.8,
    windDirectionDeg: 247,
    humidityPercent: 58,
    trackCondition: 'dry',
    wetness: 0,
  }
}

function speedAt(fraction: number, vehicleClass: VehicleClass): number {
  const wrapped = wrap01(fraction)
  let rightIndex = SPEED_PROFILE.findIndex((point) => point.fraction >= wrapped)
  if (rightIndex <= 0) rightIndex = 1
  const left = SPEED_PROFILE[rightIndex - 1]!
  const right = SPEED_PROFILE[rightIndex]!
  const progress = (wrapped - left.fraction) / (right.fraction - left.fraction)
  const smoothProgress = progress * progress * (3 - 2 * progress)
  const interpolated = left.speedKph + (right.speedKph - left.speedKph) * smoothProgress
  // The key points describe braking/apex speeds. A modest pace multiplier
  // compensates for the deliberately smooth interpolation between those
  // points, while the class cap keeps Mulsanne top speeds credible.
  return Math.min(
    VEHICLE_TOP_SPEED_KPH[vehicleClass],
    interpolated * VEHICLE_SPEED_FACTOR[vehicleClass] * 1.09,
  )
}

function curvatureAt(fraction: number): number {
  let curvature = 0
  for (const corner of CORNERS) {
    const distance = circularDistance(fraction, corner.center)
    curvature += corner.direction * Math.exp(-(distance * distance) / (2 * corner.width * corner.width))
  }
  return clamp(curvature, -1, 1)
}

function estimateElapsedAtDistance(fraction: number, vehicleClass: VehicleClass): number {
  const slices = 600
  let elapsedSeconds = 0
  const cappedFraction = clamp(fraction, 0, 1)
  const endSlice = Math.round(slices * cappedFraction)
  const distancePerSliceM = LE_MANS_TRACK.lengthM / slices
  for (let index = 0; index < endSlice; index += 1) {
    const midpoint = (index + 0.5) / slices
    elapsedSeconds += distancePerSliceM / (speedAt(midpoint, vehicleClass) / 3.6)
  }
  return Math.round(elapsedSeconds * 1_000)
}

function classLapTime(vehicleClass: VehicleClass, paceFactor: number, offset: number): number {
  const base = estimateElapsedAtDistance(1, vehicleClass) / paceFactor
  return Math.round(base + offset * 640)
}

function sectorAt(fraction: number): 1 | 2 | 3 {
  if (fraction < 0.33) return 1
  if (fraction < 0.68) return 2
  return 3
}

function pitStateAt(fraction: number): PitState {
  // One simulated GT car happens to be approaching pit entry at startup; this
  // gives overlays a realistic state to render without random discontinuities.
  return fraction > 0.988 ? 'approaching' : 'none'
}

function gearAt(speedKph: number): number {
  if (speedKph < 82) return 1
  if (speedKph < 132) return 2
  if (speedKph < 183) return 3
  if (speedKph < 232) return 4
  if (speedKph < 280) return 5
  if (speedKph < 320) return 6
  return 7
}

function undamagedCar(): DamageState {
  return {
    aeroPercent: 0,
    enginePercent: 0,
    transmissionPercent: 0,
    suspensionPercent: {
      frontLeft: 0,
      frontRight: 0,
      rearLeft: 0,
      rearRight: 0,
    },
    headlightsWorking: true,
  }
}

function opponent(
  id: string,
  manufacturer: string,
  model: string,
  vehicleClass: VehicleClass,
  carNumber: string,
  teamName: string,
  displayName: string,
  initialGapM: number,
  paceFactor: number,
  electricHybrid: boolean,
): Omit<OpponentProfile, 'phase'> {
  return {
    car: {
      id,
      manufacturer,
      model,
      vehicleClass,
      carNumber,
      teamName,
      maxFuelLiters: vehicleClass === 'LMGT3' ? 120 : 90,
      electricHybrid,
    },
    driver: {
      id: `driver:${id}`,
      displayName,
      shortName: shortName(displayName),
    },
    initialGapM,
    paceFactor,
  }
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length <= 1 ? name : `${parts[0]!.at(0) ?? ''}. ${parts.at(-1) ?? ''}`
}

function minimumDefined(values: readonly (number | null)[]): number | null {
  const defined = values.filter((value): value is number => value !== null)
  return defined.length === 0 ? null : Math.min(...defined)
}

function circularDistance(left: number, right: number): number {
  const direct = left - right
  if (direct > 0.5) return direct - 1
  if (direct < -0.5) return direct + 1
  return direct
}

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function formatLapTime(timeMs: number): string {
  const minutes = Math.floor(timeMs / 60_000)
  const seconds = (timeMs % 60_000) / 1_000
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}
