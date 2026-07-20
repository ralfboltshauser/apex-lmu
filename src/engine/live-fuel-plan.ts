import { buildFuelPlan, type FuelPlan } from './fuel-plan'
import {
  generateStrategyCandidates,
  generateTimedStrategyCandidates,
  type StrategyResult,
} from './strategy'

export type LiveFuelPlanModelEvent = 'session-reset' | 'clean-lap' | 'refuel' | 'distance-change'
export type LiveFuelPlanExclusion = 'non-live-source' | 'session-only' | 'non-local-control' | null

export interface LiveFuelPlanSnapshot {
  readonly sessionId: string
  readonly sessionKind: 'unknown'
  readonly trackName: string
  readonly carName: string
  readonly fuelSamplesLiters: readonly number[]
  readonly lapTimeSamplesSeconds: readonly number[]
  readonly sessionFuelSampleCount: number
  readonly sessionLapTimeSampleCount: number
  readonly currentFuelLiters: number
  readonly tankCapacityLiters: number
  readonly completedLaps: number
  readonly currentLapProgress: number
  readonly totalLaps: number | null
  readonly durationSeconds: number | null
  readonly elapsedSeconds: number
  readonly modelRevision: number
  readonly modelEvent: LiveFuelPlanModelEvent | null
  readonly lastAcceptedLap: number | null
  readonly calibrationExclusion: LiveFuelPlanExclusion
}

export interface LiveFuelPlanAssumptions {
  readonly reserveLiters: number
  readonly pitLaneLossSeconds: number
  readonly refuelLitersPerSecond: number
  readonly finishRule: 'line-after-zero' | 'line-after-zero-plus-one'
}

export type LiveFuelPlanMissing =
  | 'live-session'
  | 'fuel-evidence'
  | 'pace-evidence'
  | 'race-distance'
  | 'current-fuel'
  | 'tank-capacity'
  | 'manual-assumptions'

export interface ReadyLiveFuelPlan {
  readonly status: 'ready'
  readonly modelRevision: number
  readonly raceKind: 'laps' | 'timed'
  readonly fuelPlan: FuelPlan
  readonly strategy: StrategyResult
  readonly expectedFuelPerLap: number
  readonly planningFuelPerLap: number
  readonly expectedLapTimeSeconds: number
  readonly planningLapTimeSeconds: number
  readonly remainingLapEquivalents: number
}

export type LiveFuelPlanResult = ReadyLiveFuelPlan | {
  readonly status: 'unavailable'
  readonly modelRevision: number
  readonly missing: readonly LiveFuelPlanMissing[]
}

function finitePositiveSamples(values: readonly number[]) {
  return values.length > 0 && values.every((value) => Number.isFinite(value) && value > 0)
}

export function buildLiveFuelPlan(
  snapshot: LiveFuelPlanSnapshot | null,
  assumptions: LiveFuelPlanAssumptions,
): LiveFuelPlanResult {
  const missing: LiveFuelPlanMissing[] = []
  if (!snapshot?.sessionId) missing.push('live-session')
  if (!snapshot || !finitePositiveSamples(snapshot.fuelSamplesLiters)) missing.push('fuel-evidence')
  if (!snapshot || !finitePositiveSamples(snapshot.lapTimeSamplesSeconds)) missing.push('pace-evidence')
  if (!snapshot || (snapshot.totalLaps === null && snapshot.durationSeconds === null)) missing.push('race-distance')
  if (!snapshot || !Number.isFinite(snapshot.currentFuelLiters) || snapshot.currentFuelLiters < 0) missing.push('current-fuel')
  if (!snapshot || !Number.isFinite(snapshot.tankCapacityLiters) || snapshot.tankCapacityLiters <= 0 || snapshot.currentFuelLiters > snapshot.tankCapacityLiters) missing.push('tank-capacity')
  if (![assumptions.reserveLiters, assumptions.pitLaneLossSeconds].every((value) => Number.isFinite(value) && value >= 0)
    || !Number.isFinite(assumptions.refuelLitersPerSecond) || assumptions.refuelLitersPerSecond <= 0
    || (snapshot && assumptions.reserveLiters > snapshot.tankCapacityLiters)) missing.push('manual-assumptions')
  if (!snapshot || missing.length > 0) return { status: 'unavailable', modelRevision: snapshot?.modelRevision ?? 0, missing }

  const race = snapshot.totalLaps !== null
    ? {
        kind: 'laps' as const,
        totalLaps: snapshot.totalLaps,
        completedLaps: snapshot.completedLaps,
        currentLapProgress: snapshot.currentLapProgress,
      }
    : {
        kind: 'timed' as const,
        durationSeconds: snapshot.durationSeconds!,
        elapsedSeconds: snapshot.elapsedSeconds,
        currentLapProgress: snapshot.currentLapProgress,
        lapTimeSamplesSeconds: snapshot.lapTimeSamplesSeconds,
        finishRule: assumptions.finishRule,
      }
  const fuelPlan = buildFuelPlan({
    race,
    perLapSamplesLiters: snapshot.fuelSamplesLiters,
    tankCapacityLiters: snapshot.tankCapacityLiters,
    currentFuelLiters: snapshot.currentFuelLiters,
    reserveLiters: assumptions.reserveLiters,
    calculationPoint: 'in-race',
  })
  const expectedLapTimeSeconds = fuelPlan.race.lapTime?.mean
    ?? snapshot.lapTimeSamplesSeconds.reduce((total, value) => total + value, 0) / snapshot.lapTimeSamplesSeconds.length
  const planningLapTimeSeconds = fuelPlan.race.lapTime
    ? Math.max(1, fuelPlan.race.lapTime.mean - 1.645 * fuelPlan.race.lapTime.standardDeviation)
    : expectedLapTimeSeconds
  const planningFuelPerLap = Math.max(fuelPlan.fuel.perLap.mean, fuelPlan.fuel.perLap.conservative)
  const shared = {
    currentRaceLap: snapshot.completedLaps,
    currentFuelLitres: snapshot.currentFuelLiters,
    tankCapacityLitres: snapshot.tankCapacityLiters,
    fuel: {
      mean: fuelPlan.fuel.perLap.mean,
      conservative: planningFuelPerLap,
      standardDeviation: fuelPlan.fuel.perLap.standardDeviation,
      sampleSize: fuelPlan.fuel.perLap.sampleSize,
    },
    fuelReserveLitres: assumptions.reserveLiters,
    averageLapTimeSeconds: planningLapTimeSeconds,
    pitLaneLossSeconds: assumptions.pitLaneLossSeconds,
    refuelLitresPerSecond: assumptions.refuelLitersPerSecond,
    serviceConcurrency: 'parallel' as const,
  }
  const strategy = race.kind === 'laps'
    ? generateStrategyCandidates({ ...shared, remainingLapEquivalents: fuelPlan.race.conservativeLapEquivalents })
    : generateTimedStrategyCandidates({
        ...shared,
        durationSeconds: Math.max(0, race.durationSeconds - race.elapsedSeconds),
        currentLapProgress: race.currentLapProgress,
        finishRule: race.finishRule,
      })
  const remainingLapEquivalents = strategy.recommended?.stints.reduce((total, stint) => total + stint.lapEquivalents, 0)
    ?? fuelPlan.race.conservativeLapEquivalents
  return {
    status: 'ready',
    modelRevision: snapshot.modelRevision,
    raceKind: race.kind,
    fuelPlan,
    strategy,
    expectedFuelPerLap: fuelPlan.fuel.perLap.mean,
    planningFuelPerLap,
    expectedLapTimeSeconds,
    planningLapTimeSeconds,
    remainingLapEquivalents,
  }
}

export interface LiveFuelPlanSummary {
  readonly modelRevision: number
  readonly sampleCount: number
  readonly planningFuelPerLap: number
  readonly stopCount: number | null
  readonly nextStopLap: number | null
  readonly reserveState: 'comfortable' | 'marginal' | 'short'
}

export type LiveFuelPlanChange = 'adopted' | 'consumption' | 'next-stop' | 'stop-count' | 'reserve-state' | 'refuel'

export function summarizeLiveFuelPlan(plan: LiveFuelPlanResult, sampleCount: number): LiveFuelPlanSummary | null {
  if (plan.status !== 'ready') return null
  return {
    modelRevision: plan.modelRevision,
    sampleCount,
    planningFuelPerLap: plan.planningFuelPerLap,
    stopCount: plan.strategy.recommended?.stopCount ?? null,
    nextStopLap: plan.strategy.recommended?.pitStops[0]?.estimatedRaceLap ?? null,
    reserveState: plan.fuelPlan.fuel.status,
  }
}

export function compareLiveFuelPlans(
  previous: LiveFuelPlanSummary | null,
  current: LiveFuelPlanSummary,
  event: LiveFuelPlanModelEvent | null,
): readonly LiveFuelPlanChange[] {
  if (!previous) return ['adopted']
  const changes: LiveFuelPlanChange[] = []
  if (Math.abs(previous.planningFuelPerLap - current.planningFuelPerLap) > 0.00001) changes.push('consumption')
  if (previous.nextStopLap !== current.nextStopLap) changes.push('next-stop')
  if (previous.stopCount !== current.stopCount) changes.push('stop-count')
  if (previous.reserveState !== current.reserveState) changes.push('reserve-state')
  if (event === 'refuel' && previous.modelRevision !== current.modelRevision) changes.push('refuel')
  return changes
}
