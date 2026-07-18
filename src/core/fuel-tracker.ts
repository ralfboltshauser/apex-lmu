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
}

export interface FuelTrackerState extends LiveFuelEstimate {
  readonly currentLapNumber: number
  readonly lapStartFuelLiters: number
  readonly lastFuelLiters: number
  readonly lapInvalid: boolean
}

const EMPTY: FuelTrackerState = {
  sessionId: '', trackName: '', carName: '', fuelSamplesLiters: [], lapTimeSamplesSeconds: [],
  currentFuelLiters: 0, tankCapacityLiters: 0, completedLaps: 0, currentLapProgress: 0,
  totalLaps: null, durationSeconds: null, elapsedSeconds: 0, currentLapNumber: 0,
  lapStartFuelLiters: 0, lastFuelLiters: 0, lapInvalid: false,
}

export function emptyFuelTracker(): FuelTrackerState { return EMPTY }

export function isDurableFuelCalibrationFrame(frame: TelemetryFrame): boolean {
  return frame.source !== 'recording-replay'
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
  if (!isDurableFuelCalibrationFrame(frame) || frame.sourceState === 'session-only') return previous
  const fallbackProgress = previous.sessionId === frame.session.id ? previous.currentLapProgress : 0
  const current = base(frame, fallbackProgress)
  if (previous.sessionId !== frame.session.id || previous.currentLapNumber <= 0 || frame.player.currentLapNumber < previous.currentLapNumber) {
    return { ...EMPTY, ...current, currentLapNumber: frame.player.currentLapNumber, lapStartFuelLiters: current.currentFuelLiters, lastFuelLiters: current.currentFuelLiters }
  }

  const refuelled = current.currentFuelLiters > previous.lastFuelLiters + 0.25
  const touchedPits = frame.sample.isInPitLane || previous.lapInvalid || refuelled
  if (frame.player.currentLapNumber === previous.currentLapNumber) {
    return { ...previous, ...current, lastFuelLiters: current.currentFuelLiters, lapInvalid: touchedPits }
  }

  const used = previous.lapStartFuelLiters - current.currentFuelLiters
  const validFuel = !touchedPits && used > 0.05 && used <= Math.max(previous.tankCapacityLiters, 1)
  const lastLapSeconds = frame.player.lastLapTimeMs === null ? null : frame.player.lastLapTimeMs / 1000
  const validLapTime = !touchedPits && lastLapSeconds !== null && lastLapSeconds >= 10 && lastLapSeconds <= 3600
  return {
    ...previous, ...current,
    fuelSamplesLiters: validFuel ? [...previous.fuelSamplesLiters, Math.round(used * 10_000) / 10_000].slice(-20) : previous.fuelSamplesLiters,
    lapTimeSamplesSeconds: validLapTime ? [...previous.lapTimeSamplesSeconds, lastLapSeconds].slice(-20) : previous.lapTimeSamplesSeconds,
    currentLapNumber: frame.player.currentLapNumber,
    lapStartFuelLiters: current.currentFuelLiters,
    lastFuelLiters: current.currentFuelLiters,
    lapInvalid: frame.sample.isInPitLane,
  }
}
