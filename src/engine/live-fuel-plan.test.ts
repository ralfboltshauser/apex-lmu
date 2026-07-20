import { describe, expect, it } from 'vitest'
import {
  buildLiveFuelPlan,
  compareLiveFuelPlans,
  summarizeLiveFuelPlan,
  type LiveFuelPlanSnapshot,
} from './live-fuel-plan'

const snapshot: LiveFuelPlanSnapshot = {
  sessionId: 'live-session', sessionKind: 'unknown', trackName: 'Test Track', carName: 'Test Car',
  fuelSamplesLiters: [3.5, 3.4, 3.6], lapTimeSamplesSeconds: [100, 101, 99],
  sessionFuelSampleCount: 3, sessionLapTimeSampleCount: 3,
  currentFuelLiters: 22, tankCapacityLiters: 50, completedLaps: 10, currentLapProgress: 0.25,
  totalLaps: 30, durationSeconds: null, elapsedSeconds: 1_025,
  modelRevision: 4, modelEvent: 'clean-lap', calibrationExclusion: null,
  lastAcceptedLap: 10,
}
const assumptions = { reserveLiters: 2, pitLaneLossSeconds: 30, refuelLitersPerSecond: 2, finishRule: 'line-after-zero' as const }

describe('adaptive live fuel plan', () => {
  it('builds a fixed-lap plan from current progress and the shared fuel model', () => {
    const plan = buildLiveFuelPlan(snapshot, assumptions)
    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready') return
    expect(plan.raceKind).toBe('laps')
    expect(plan.remainingLapEquivalents).toBe(19.75)
    expect(plan.expectedFuelPerLap).toBe(plan.fuelPlan.fuel.perLap.mean)
    expect(plan.planningFuelPerLap).toBe(plan.fuelPlan.fuel.perLap.conservative)
    expect(plan.strategy.recommended?.stints).toHaveLength((plan.strategy.recommended?.stopCount ?? -1) + 1)
    expect(buildLiveFuelPlan(snapshot, assumptions)).toEqual(plan)
  })

  it('keeps a rounded decimal planning rate monotonic with its unrounded mean', () => {
    const plan = buildLiveFuelPlan({ ...snapshot, fuelSamplesLiters: [3.2, 3.2] }, assumptions)
    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready') return
    expect(plan.planningFuelPerLap).toBeGreaterThanOrEqual(plan.expectedFuelPerLap)
  })

  it('builds a bounded timed plan from remaining clock and current-lap progress', () => {
    const plan = buildLiveFuelPlan({ ...snapshot, totalLaps: null, durationSeconds: 3_600, elapsedSeconds: 2_950 }, assumptions)
    expect(plan.status).toBe('ready')
    if (plan.status !== 'ready') return
    expect(plan.raceKind).toBe('timed')
    expect(plan.remainingLapEquivalents % 1).toBeCloseTo(0.75, 8)
    expect(plan.strategy.recommended?.pitStops).toHaveLength(plan.strategy.recommended?.stopCount ?? 0)
  })

  it('reports exact missing evidence instead of substituting defaults', () => {
    const plan = buildLiveFuelPlan({ ...snapshot, fuelSamplesLiters: [], lapTimeSamplesSeconds: [], totalLaps: null, durationSeconds: null }, assumptions)
    expect(plan).toEqual({ status: 'unavailable', modelRevision: 4, missing: ['fuel-evidence', 'pace-evidence', 'race-distance'] })
  })

  it('explains material changes with structured causes', () => {
    const first = buildLiveFuelPlan(snapshot, assumptions)
    const lower = buildLiveFuelPlan({ ...snapshot, fuelSamplesLiters: [3.5, 3.4, 3.6, 2.8], modelRevision: 5 }, assumptions)
    const firstSummary = summarizeLiveFuelPlan(first, 3)
    const lowerSummary = summarizeLiveFuelPlan(lower, 4)
    expect(firstSummary).not.toBeNull()
    expect(lowerSummary).not.toBeNull()
    expect(compareLiveFuelPlans(null, firstSummary!, 'clean-lap')).toEqual(['adopted'])
    expect(compareLiveFuelPlans(firstSummary, lowerSummary!, 'clean-lap')).toContain('consumption')
  })

  it('does not repeat an old refuel event for a same-revision manual replan', () => {
    const first = summarizeLiveFuelPlan(buildLiveFuelPlan(snapshot, assumptions), 3)!
    const changedReserve = summarizeLiveFuelPlan(buildLiveFuelPlan(snapshot, { ...assumptions, reserveLiters: 3 }), 3)!
    expect(compareLiveFuelPlans(first, changedReserve, 'refuel')).not.toContain('refuel')
    expect(compareLiveFuelPlans(first, { ...changedReserve, modelRevision: 5 }, 'refuel')).toContain('refuel')
  })

  it('moves a stop later only after lower clean-lap use crosses the range boundary', () => {
    const high = buildLiveFuelPlan({ ...snapshot, currentFuelLiters: 10, tankCapacityLiters: 30, totalLaps: 20, completedLaps: 5, fuelSamplesLiters: [3.4, 3.4] }, assumptions)
    const same = buildLiveFuelPlan({ ...snapshot, currentFuelLiters: 10, tankCapacityLiters: 30, totalLaps: 20, completedLaps: 5, fuelSamplesLiters: [3.4, 3.4, 3.4], modelRevision: 5 }, assumptions)
    const lower = buildLiveFuelPlan({ ...snapshot, currentFuelLiters: 10, tankCapacityLiters: 30, totalLaps: 20, completedLaps: 5, fuelSamplesLiters: [2.9, 2.9], modelRevision: 6 }, assumptions)
    expect(high.status).toBe('ready'); expect(same.status).toBe('ready'); expect(lower.status).toBe('ready')
    if (high.status !== 'ready' || same.status !== 'ready' || lower.status !== 'ready') return
    expect(same.strategy.recommended?.pitStops[0]?.estimatedRaceLap).toBe(high.strategy.recommended?.pitStops[0]?.estimatedRaceLap)
    expect(lower.strategy.recommended?.pitStops[0]?.estimatedRaceLap).toBeGreaterThan(high.strategy.recommended?.pitStops[0]?.estimatedRaceLap ?? Infinity)
  })

  it('preserves finite tank and shape invariants across varied live states', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const tank = 30 + seed
      const current = 5 + seed % (tank - 5)
      const live = { ...snapshot, currentFuelLiters: current, tankCapacityLiters: tank, completedLaps: seed % 20, currentLapProgress: (seed % 10) / 10, totalLaps: 40 + seed }
      const plan = buildLiveFuelPlan(live, assumptions)
      expect(plan.status).toBe('ready')
      if (plan.status !== 'ready') continue
      for (const candidate of plan.strategy.candidates) {
        expect(candidate.stints).toHaveLength(candidate.stopCount + 1)
        expect(candidate.pitStops).toHaveLength(candidate.stopCount)
        expect(candidate.pitStops.every((stop) => stop.targetFuelOnExitLitres <= tank + 1e-6)).toBe(true)
        expect(Object.values(candidate).filter((value) => typeof value === 'number').every(Number.isFinite)).toBe(true)
      }
    }
  })
})
