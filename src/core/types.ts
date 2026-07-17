/**
 * Domain primitives use unit-suffixed property names deliberately. LMU exposes
 * a mixture of SI units and display values; encoding the unit in the name keeps
 * adapters and calculations honest without burdening the UI with branded
 * number types.
 */
export type SessionId = string
export type LapId = string
export type CarId = string
export type DriverId = string
export type SetupId = string
export type IsoDateTime = string

export type VehicleClass = 'HYPERCAR' | 'LMP2' | 'LMGT3' | 'UNKNOWN'
export type SessionKind = 'practice' | 'qualifying' | 'race' | 'test-day'
export type SessionPhase =
  | 'garage'
  | 'formation'
  | 'countdown'
  | 'green'
  | 'full-course-yellow'
  | 'safety-car'
  | 'red-flag'
  | 'checkered'
  | 'finished'

export type FlagState =
  | 'none'
  | 'green'
  | 'yellow'
  | 'double-yellow'
  | 'blue'
  | 'white'
  | 'black'
  | 'checkered'

export type TrackCondition = 'dry' | 'damp' | 'wet' | 'flooded'
export type TyreCompound = 'soft' | 'medium' | 'hard' | 'wet' | 'unknown'
export type WheelPosition = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight'
export type PitState = 'none' | 'requested' | 'approaching' | 'in-lane' | 'stopped' | 'exiting'

export interface TrackDescriptor {
  readonly id: string
  readonly name: string
  readonly layout: string
  readonly countryCode: string
  readonly lengthM: number
  readonly cornerCount: number
  readonly pitLaneLossEstimateMs: number
}

export interface CarDescriptor {
  readonly id: CarId
  readonly manufacturer: string
  readonly model: string
  readonly vehicleClass: VehicleClass
  readonly carNumber: string
  readonly teamName: string
  readonly maxFuelLiters: number
  readonly electricHybrid: boolean
}

export interface DriverDescriptor {
  readonly id: DriverId
  readonly displayName: string
  readonly shortName: string
  readonly nationalityCode?: string
  readonly isPlayer?: boolean
}

export interface SessionDescriptor {
  readonly id: SessionId
  readonly kind: SessionKind
  readonly eventName: string
  readonly serverName: string
  readonly track: TrackDescriptor
  readonly startedAt: IsoDateTime
  readonly scheduledDurationMs: number | null
  readonly scheduledLaps: number | null
  readonly isMultiplayer: boolean
}

export interface SessionState {
  readonly phase: SessionPhase
  readonly flag: FlagState
  readonly elapsedMs: number
  readonly remainingMs: number | null
  readonly currentLap: number
  readonly totalLaps: number | null
  readonly sessionBestLapMs: number | null
  readonly incidentCount: number
}

export interface WeatherState {
  readonly ambientTemperatureC: number
  readonly trackTemperatureC: number
  readonly rainIntensity: number
  readonly cloudCover?: number
  readonly windSpeedMps: number
  readonly windDirectionDeg?: number
  readonly humidityPercent?: number
  readonly trackCondition: TrackCondition
  readonly wetness: number
}

export interface DriverInputs {
  readonly throttle: number
  readonly brake: number
  readonly clutch: number
  readonly steering: number
  readonly handbrake: number
}

export interface MotionState {
  readonly speedKph: number
  readonly velocityMps?: ReadonlyVector3
  readonly accelerationMps2?: ReadonlyVector3
  readonly gForce?: ReadonlyVector3
  readonly yawRad?: number
  readonly pitchRad?: number
  readonly rollRad?: number
  readonly yawRateRadPerSec?: number
}

export interface ReadonlyVector3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface PowertrainState {
  readonly gear: number
  readonly rpm: number
  readonly maxRpm: number
  readonly engineTemperatureC?: number
  readonly oilTemperatureC?: number
  readonly waterTemperatureC?: number
  readonly fuelLiters: number
  readonly fuelPerLapEstimateLiters: number | null
  readonly lapsOfFuelEstimate: number | null
}

export interface HybridState {
  readonly stateOfChargePercent: number
  readonly virtualEnergyPercent?: number
  readonly deploymentKw?: number
  readonly regenerationKw?: number
  readonly deploymentMode?: string
}

export interface TyreState {
  readonly compound: TyreCompound
  readonly pressureKpa: number
  readonly innerTemperatureC: number
  readonly middleTemperatureC: number
  readonly outerTemperatureC: number
  readonly carcassTemperatureC: number
  readonly brakeTemperatureC: number
  readonly wearPercent: number
  readonly slipRatio?: number
  readonly slipAngleDeg?: number
  readonly rideHeightMm: number
  readonly detached: boolean
}

export type WheelStates = Readonly<Record<WheelPosition, TyreState>>

export interface DamageState {
  readonly aeroPercent: number
  readonly enginePercent: number
  readonly transmissionPercent: number
  readonly suspensionPercent: Readonly<Record<WheelPosition, number>>
  readonly headlightsWorking: boolean
}

export interface CarState {
  readonly car: CarDescriptor
  readonly driver: DriverDescriptor
  readonly overallPosition: number
  readonly classPosition: number
  readonly completedLaps: number
  readonly currentLapNumber: number
  readonly currentLapTimeMs: number
  readonly lastLapTimeMs: number | null
  readonly bestLapTimeMs: number | null
  readonly sectorIndex: 1 | 2 | 3
  readonly sectorTimesMs: readonly [number | null, number | null, number | null]
  readonly distanceM: number | null
  readonly distanceFraction: number | null
  readonly pitState: PitState
  readonly limiterActive: boolean
  readonly headlightsActive: boolean
  readonly tractionControlLevel: number
  readonly absLevel: number
  readonly engineMap: number
  readonly inputs: DriverInputs
  readonly motion: MotionState
  readonly powertrain: PowertrainState
  readonly hybrid: HybridState | null
  readonly wheels: WheelStates
  readonly damage?: DamageState
  /** Official LMU world position when the vehicle telemetry block is available. */
  readonly worldPositionM?: ReadonlyVector3
}

export interface OpponentState {
  readonly car: CarDescriptor
  readonly driver: DriverDescriptor
  readonly overallPosition: number
  readonly classPosition: number
  readonly completedLaps: number
  readonly currentLapNumber: number
  readonly distanceM: number | null
  readonly distanceFraction: number | null
  readonly speedKph?: number
  readonly gapToPlayerMs: number | null
  readonly intervalAheadMs: number | null
  readonly lastLapTimeMs: number | null
  readonly bestLapTimeMs: number | null
  readonly pitState: PitState
  readonly isConnected: boolean
  readonly isPlayerClass: boolean
  /** Official LMU scoring world position; absent when the producer does not expose it. */
  readonly worldPositionM?: ReadonlyVector3
}

export interface TelemetrySample {
  readonly sequence: number
  readonly sessionId: SessionId
  readonly lapId: LapId
  readonly capturedAt: IsoDateTime
  readonly sessionElapsedMs: number
  readonly lapElapsedMs: number
  readonly distanceM: number | null
  readonly distanceFraction: number | null
  readonly sectorIndex: 1 | 2 | 3
  readonly isInPitLane: boolean
  readonly inputs: DriverInputs
  readonly motion: MotionState
  readonly powertrain: PowertrainState
  readonly hybrid: HybridState | null
  readonly wheels: WheelStates
  readonly worldPositionM?: ReadonlyVector3
  readonly controlOwner?: 'local-player' | 'ai' | 'remote' | 'replay' | 'unknown'
}

export type TelemetryEventType =
  | 'session-started'
  | 'green-flag'
  | 'flag-changed'
  | 'lap-started'
  | 'lap-completed'
  | 'personal-best'
  | 'pit-requested'
  | 'pit-entered'
  | 'pit-exited'
  | 'driver-swap'
  | 'incident'

export interface TelemetryEvent {
  readonly id: string
  readonly type: TelemetryEventType
  readonly sessionElapsedMs: number
  readonly message: string
  readonly lapId?: LapId
}

export interface TelemetryFrame {
  readonly sequence: number
  readonly capturedAt: IsoDateTime
  readonly session: SessionDescriptor
  readonly sessionState: SessionState
  readonly weather: WeatherState
  readonly player: CarState
  readonly opponents: readonly OpponentState[]
  readonly sample: TelemetrySample
  readonly events: readonly TelemetryEvent[]
  readonly source?: 'lmu-shared-memory' | 'self-test' | 'recording-replay'
  /** Session-only means LMU exposes scoring/weather but not the player's per-wheel telemetry yet. */
  readonly sourceState?: 'session-only' | 'vehicle-telemetry'
}

export type LapValidityReason =
  | 'track-limits'
  | 'pit-entry'
  | 'pit-exit'
  | 'collision'
  | 'wrong-way'
  | 'game-invalidated'

export interface SectorResult {
  readonly sector: 1 | 2 | 3
  readonly timeMs: number
  readonly bestInSession: boolean
  readonly personalBest: boolean
}

export interface LapSummary {
  readonly id: LapId
  readonly sessionId: SessionId
  readonly number: number
  readonly startedAt: IsoDateTime
  readonly durationMs: number
  readonly sectors: readonly [SectorResult, SectorResult, SectorResult]
  readonly valid: boolean
  readonly invalidReasons: readonly LapValidityReason[]
  readonly fuelUsedLiters: number
  readonly virtualEnergyUsedPercent: number | null
  readonly tyreCompound: TyreCompound
  readonly startFuelLiters: number
  readonly endFuelLiters: number
  readonly averageSpeedKph: number
  readonly topSpeedKph: number
  readonly setupId: SetupId | null
}

export interface StintSummary {
  readonly id: string
  readonly sessionId: SessionId
  readonly driverId: DriverId
  readonly lapIds: readonly LapId[]
  readonly startedAt: IsoDateTime
  readonly endedAt: IsoDateTime | null
  readonly tyreCompound: TyreCompound
  readonly averageLapMs: number | null
  readonly consistencyMs: number | null
  readonly fuelUsedLiters: number
}

export interface RecordedSession {
  readonly descriptor: SessionDescriptor
  readonly endedAt: IsoDateTime | null
  readonly playerCar: CarDescriptor
  readonly drivers: readonly DriverDescriptor[]
  readonly laps: readonly LapSummary[]
  readonly stints: readonly StintSummary[]
  readonly samples: readonly TelemetrySample[]
  readonly events: readonly TelemetryEvent[]
  readonly setupIds: readonly SetupId[]
  readonly notes: string
}

export interface SessionListItem {
  readonly id: SessionId
  readonly eventName: string
  readonly kind: SessionKind
  readonly trackName: string
  readonly carName: string
  readonly startedAt: IsoDateTime
  readonly endedAt: IsoDateTime | null
  readonly lapCount: number
  readonly bestLapMs: number | null
}

export type SetupCategory = 'qualifying' | 'sprint' | 'endurance' | 'wet' | 'baseline' | 'custom'
export type SetupStability = 'safe' | 'balanced' | 'aggressive'

export interface SetupMetadata {
  readonly id: SetupId
  readonly name: string
  readonly description: string
  readonly carId: CarId
  readonly trackId: string
  readonly category: SetupCategory
  readonly stability: SetupStability
  readonly author: string
  readonly gameVersion: string
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly parentSetupId: SetupId | null
  readonly sourceFileName: string | null
  readonly tags: readonly string[]
}

export interface SetupValue {
  readonly value: number | string | boolean
  readonly unit?: string
  readonly minimum?: number
  readonly maximum?: number
  readonly step?: number
}

export interface SetupDocument {
  readonly metadata: SetupMetadata
  readonly groups: Readonly<Record<string, Readonly<Record<string, SetupValue>>>>
  readonly checksum: string
}

export interface SetupChange {
  readonly group: string
  readonly parameter: string
  readonly before: SetupValue | null
  readonly after: SetupValue | null
  readonly expectedEffect?: string
}

export interface SetupRevision {
  readonly id: string
  readonly setupId: SetupId
  readonly createdAt: IsoDateTime
  readonly reason: string
  readonly changes: readonly SetupChange[]
}

export interface OverlayWidgetSettings {
  readonly id: string
  readonly kind: string
  readonly enabled: boolean
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly opacity: number
  readonly scale: number
}

export interface AppSettings {
  readonly theme: 'dark' | 'system'
  readonly units: 'metric' | 'imperial'
  readonly telemetry: {
    readonly autoRecord: boolean
    readonly sampleRateHz: 10 | 20 | 50 | 100
    readonly retainSessions: number
    readonly recordOpponentSnapshots: boolean
  }
  readonly overlays: {
    readonly enabled: boolean
    readonly clickThrough: boolean
    readonly widgets: readonly OverlayWidgetSettings[]
  }
  readonly coaching: {
    readonly enabled: boolean
    readonly minimumConfidence: number
    readonly voicePrompts: boolean
  }
  readonly accessibility: {
    readonly reducedMotion: boolean
    readonly highContrast: boolean
    readonly colorVision: 'default' | 'deuteranopia' | 'protanopia' | 'tritanopia'
  }
  readonly privacy: {
    readonly localOnly: true
    readonly diagnosticsEnabled: boolean
  }
}
