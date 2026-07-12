import { describe, expect, it } from 'vitest'
import { buildFuelPlan } from './fuel-plan'

describe('fuel plan', () => {
  it('builds a no-stop pre-race plan and recommends the amount to add', () => {
    const plan = buildFuelPlan({
      race: { kind: 'laps', totalLaps: 20, completedLaps: 0, currentLapProgress: 0 },
      perLapSamplesLiters: [3.4, 3.4, 3.4], tankCapacityLiters: 100,
      currentFuelLiters: 20, reserveLiters: 2, calculationPoint: 'pre-race',
    })
    expect(plan.recommendedFuelLiters).toBe(70)
    expect(plan.fuelToAddBeforeStartLiters).toBe(50)
    expect(plan.pitStops).toBe(0)
    expect(plan.finalStintFuelLiters).toBe(70)
  })

  it('splits a long race into tank-limited stints and exposes final-stint fuel', () => {
    const plan = buildFuelPlan({
      race: { kind: 'laps', totalLaps: 40, completedLaps: 0, currentLapProgress: 0 },
      perLapSamplesLiters: [3.2, 3.2, 3.2], tankCapacityLiters: 100,
      currentFuelLiters: 10, reserveLiters: 2, calculationPoint: 'pre-race',
    })
    expect(plan.recommendedFuelLiters).toBe(130)
    expect(plan.openingFuelTargetLiters).toBe(100)
    expect(plan.pitStops).toBe(1)
    expect(plan.finalStintFuelLiters).toBe(30)
    expect(plan.stintFuelLoadsLiters).toEqual([100, 30])
  })

  it('uses current fuel rather than an imaginary pre-race fill for an in-race plan', () => {
    const plan = buildFuelPlan({
      race: { kind: 'laps', totalLaps: 30, completedLaps: 10, currentLapProgress: 0.5 },
      perLapSamplesLiters: [3, 3.1, 2.9], tankCapacityLiters: 60,
      currentFuelLiters: 20, reserveLiters: 2, calculationPoint: 'in-race',
    })
    expect(plan.openingFuelTargetLiters).toBe(20)
    expect(plan.fuelToAddBeforeStartLiters).toBe(0)
    expect(plan.pitStops).toBe(1)
  })

  it('inherits timed-race extra-lap protection from the uncertainty engine', () => {
    const plan = buildFuelPlan({
      race: { kind: 'timed', durationSeconds: 3600, elapsedSeconds: 2960, currentLapProgress: 0.5, lapTimeSamplesSeconds: [94, 98, 100, 102, 106] },
      perLapSamplesLiters: [3.3, 3.4, 3.5], tankCapacityLiters: 100,
      currentFuelLiters: 30, reserveLiters: 2, calculationPoint: 'in-race',
    })
    expect(plan.race.extraLapRisk?.possible).toBe(true)
    expect(plan.recommendedFuelLiters).toBeGreaterThan(plan.expectedFuelLiters)
  })

  it('rejects impossible tank state', () => {
    expect(() => buildFuelPlan({
      race: { kind: 'laps', totalLaps: 1, completedLaps: 0, currentLapProgress: 0 },
      perLapSamplesLiters: [1], tankCapacityLiters: 10, currentFuelLiters: 11,
      reserveLiters: 1, calculationPoint: 'pre-race',
    })).toThrow(/cannot exceed/)
  })
})
