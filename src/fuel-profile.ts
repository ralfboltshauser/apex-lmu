import {
  isDurableFuelCalibrationFrame,
  updateFuelTracker,
  type FuelTrackerState,
  type TelemetryFrame,
} from './core'

const FUEL_PROFILE_PREFIX = 'apex:fuel-profile:'

type FuelProfileStorage = Pick<Storage, 'getItem' | 'setItem'>

function fuelProfileKey(track: string, car: string) {
  return `${FUEL_PROFILE_PREFIX}${encodeURIComponent(`${track}\0${car}`)}`
}

function loadFuelProfile(storage: FuelProfileStorage, track: string, car: string) {
  try {
    const value = JSON.parse(storage.getItem(fuelProfileKey(track, car)) || '{}') as { fuel?: unknown; laps?: unknown }
    const fuel = Array.isArray(value.fuel) ? value.fuel.filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item > 0).slice(-20) : []
    const laps = Array.isArray(value.laps) ? value.laps.filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item >= 10).slice(-20) : []
    return { fuel, laps }
  } catch { return { fuel: [], laps: [] } }
}

function saveFuelProfile(storage: FuelProfileStorage, track: string, car: string, fuel: readonly number[], laps: readonly number[]) {
  try { storage.setItem(fuelProfileKey(track, car), JSON.stringify({ fuel, laps })) } catch { /* Live calculation still works for this run. */ }
}

/**
 * Advances the live calibration and owns its durable profile I/O. Replays are
 * observational: they can still flow through the rest of the renderer, but
 * they must not read, replace, or persist the calibration learned from LMU.
 */
export function advanceDurableFuelCalibration(
  previous: FuelTrackerState,
  frame: TelemetryFrame,
  storage?: FuelProfileStorage,
): FuelTrackerState {
  if (!isDurableFuelCalibrationFrame(frame)) return previous
  const profileStorage = storage ?? window.localStorage

  let next = updateFuelTracker(previous, frame)
  if (next.sessionId && next.sessionId !== previous.sessionId) {
    const saved = loadFuelProfile(profileStorage, next.trackName, next.carName)
    next = { ...next, fuelSamplesLiters: saved.fuel, lapTimeSamplesSeconds: saved.laps }
  }
  if ((next.fuelSamplesLiters.length !== previous.fuelSamplesLiters.length || next.lapTimeSamplesSeconds.length !== previous.lapTimeSamplesSeconds.length) && next.sessionId) {
    saveFuelProfile(profileStorage, next.trackName, next.carName, next.fuelSamplesLiters, next.lapTimeSamplesSeconds)
  }
  return next
}
