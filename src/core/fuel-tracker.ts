import type { TelemetryFrame } from './types'

export interface LiveFuelEstimate {
  readonly sessionId: string
  readonly trackName: string
  readonly carName: string
  readonly fuelSamplesLiters: readonly number[]
  readonly lapTimeSamplesSeconds: readonly number[]
  readonly currentFuelLiters: number
  readonly tankCapacityLiters: number
  readonly completedLaps: number
  readonly currentLapProgress: number
  readonly totalLaps: number | null
  readonly durationSeconds: number | null
  readonly elapsedSeconds: number
  readonly modelRevision: number
  readonly modelEvent: FuelPlanModelEvent | null
  readonly lastAcceptedLap: number | null
  readonly sessionFuelSampleCount: number
  readonly sessionLapTimeSampleCount: number
  readonly calibrationExclusion: FuelCalibrationExclusion | null
}

export interface FuelTrackerState extends LiveFuelEstimate {
  readonly currentLapNumber: number
  readonly lapStartFuelLiters: number
  readonly lastFuelLiters: number
  readonly lapInvalid: boolean
  readonly currentLapCalibrationEligible: boolean
  readonly calibrationProfileLoaded: boolean
}

export type FuelPlanModelEvent = 'session-reset' | 'clean-lap' | 'refuel' | 'distance-change'

export type FuelCalibrationExclusion =
  | 'non-live-source'
  | 'session-only'
  | 'non-local-control'

const EMPTY: FuelTrackerState = {
  sessionId: '', trackName: '', carName: '', fuelSamplesLiters: [], lapTimeSamplesSeconds: [],
  currentFuelLiters: 0, tankCapacityLiters: 0, completedLaps: 0, currentLapProgress: 0,
  totalLaps: null, durationSeconds: null, elapsedSeconds: 0, currentLapNumber: 0,
  lapStartFuelLiters: 0, lastFuelLiters: 0, lapInvalid: false,
  currentLapCalibrationEligible: false, calibrationExclusion: null, calibrationProfileLoaded: false,
  modelRevision: 0, modelEvent: null, lastAcceptedLap: null,
  sessionFuelSampleCount: 0, sessionLapTimeSampleCount: 0,
}

export function emptyFuelTracker(): FuelTrackerState { return EMPTY }

export function fuelCalibrationExclusion(frame: TelemetryFrame): FuelCalibrationExclusion | null {
  if (frame.source !== 'lmu-shared-memory') return 'non-live-source'
  if (frame.sourceState === 'session-only') return 'session-only'
  if (frame.sample.controlOwner !== 'local-player') return 'non-local-control'
  return null
}

export function isDurableFuelCalibrationFrame(frame: TelemetryFrame): boolean {
  return fuelCalibrationExclusion(frame) === null
}

function isObservableLiveFuelFrame(frame: TelemetryFrame): boolean {
  return frame.source === 'lmu-shared-memory' && frame.sourceState !== 'session-only'
}

function base(frame: TelemetryFrame, fallbackProgress: number) {
  return {
    sessionId: frame.session.id, trackName: frame.session.track.name, carName: frame.player.car.model,
    currentFuelLiters: frame.player.powertrain.fuelLiters,
    tankCapacityLiters: frame.player.car.maxFuelLiters,
    completedLaps: frame.player.completedLaps, currentLapProgress: frame.player.distanceFraction ?? fallbackProgress,
    totalLaps: frame.sessionState.totalLaps,
    durationSeconds: frame.session.scheduledDurationMs === null ? null : frame.session.scheduledDurationMs / 1000,
    elapsedSeconds: frame.sessionState.elapsedMs / 1000,
  }
}

export function updateFuelTracker(previous: FuelTrackerState, frame: TelemetryFrame): FuelTrackerState {
  if (!isObservableLiveFuelFrame(frame)) return previous
  const fallbackProgress = previous.sessionId === frame.session.id ? previous.currentLapProgress : 0
  const current = base(frame, fallbackProgress)
  const frameEligible = isDurableFuelCalibrationFrame(frame)
  if (previous.sessionId !== frame.session.id || previous.currentLapNumber <= 0 || frame.player.currentLapNumber < previous.currentLapNumber) {
    return {
      ...EMPTY, ...current,
      currentLapNumber: frame.player.currentLapNumber,
      lapStartFuelLiters: current.currentFuelLiters,
      lastFuelLiters: current.currentFuelLiters,
      currentLapCalibrationEligible: frameEligible,
      calibrationExclusion: fuelCalibrationExclusion(frame),
      modelRevision: previous.sessionId === frame.session.id ? previous.modelRevision + 1 : 1,
      modelEvent: 'session-reset',
    }
  }

  const refuelled = current.currentFuelLiters > previous.lastFuelLiters + 0.25
  const distanceChanged = current.totalLaps !== previous.totalLaps || current.durationSeconds !== previous.durationSeconds
  const touchedPits = frame.sample.isInPitLane || previous.lapInvalid || refuelled
  if (frame.player.currentLapNumber === previous.currentLapNumber) {
    const modelChanged = refuelled || distanceChanged
    return {
      ...previous, ...current,
      lastFuelLiters: current.currentFuelLiters,
      lapInvalid: touchedPits,
      currentLapCalibrationEligible: previous.currentLapCalibrationEligible && frameEligible,
      calibrationExclusion: previous.calibrationExclusion ?? fuelCalibrationExclusion(frame),
      modelRevision: previous.modelRevision + (modelChanged ? 1 : 0),
      modelEvent: refuelled ? 'refuel' : distanceChanged ? 'distance-change' : previous.modelEvent,
    }
  }

  const used = previous.lapStartFuelLiters - current.currentFuelLiters
  const completedLapEligible = previous.currentLapCalibrationEligible && frameEligible
  const validFuel = completedLapEligible && !touchedPits && used > 0.05 && used <= Math.max(previous.tankCapacityLiters, 1)
  const lastLapSeconds = frame.player.lastLapTimeMs === null ? null : frame.player.lastLapTimeMs / 1000
  const validLapTime = completedLapEligible && !touchedPits && lastLapSeconds !== null && lastLapSeconds >= 10 && lastLapSeconds <= 3600
  const completedLapExclusion = completedLapEligible
    ? null
    : previous.calibrationExclusion ?? fuelCalibrationExclusion(frame)
  const acceptedLap = validFuel && validLapTime
  const modelChanged = acceptedLap || refuelled || distanceChanged
  return {
    ...previous, ...current,
    fuelSamplesLiters: validFuel ? [...previous.fuelSamplesLiters, Math.round(used * 10_000) / 10_000].slice(-20) : previous.fuelSamplesLiters,
    lapTimeSamplesSeconds: validLapTime ? [...previous.lapTimeSamplesSeconds, lastLapSeconds].slice(-20) : previous.lapTimeSamplesSeconds,
    currentLapNumber: frame.player.currentLapNumber,
    lapStartFuelLiters: current.currentFuelLiters,
    lastFuelLiters: current.currentFuelLiters,
    lapInvalid: frame.sample.isInPitLane,
    currentLapCalibrationEligible: frameEligible,
    calibrationExclusion: completedLapExclusion,
    modelRevision: previous.modelRevision + (modelChanged ? 1 : 0),
    modelEvent: refuelled ? 'refuel' : distanceChanged ? 'distance-change' : acceptedLap ? 'clean-lap' : previous.modelEvent,
    lastAcceptedLap: acceptedLap ? previous.currentLapNumber : previous.lastAcceptedLap,
    sessionFuelSampleCount: previous.sessionFuelSampleCount + (validFuel ? 1 : 0),
    sessionLapTimeSampleCount: previous.sessionLapTimeSampleCount + (validLapTime ? 1 : 0),
  }
}
