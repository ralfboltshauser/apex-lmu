import { round } from './common'
import { projectRaceLaps, projectResource, type RaceDistance, type RaceLapProjection, type ResourceProjection } from './fuel'

export interface FuelPlanInput {
  readonly race: RaceDistance
  readonly perLapSamplesLiters: readonly number[]
  readonly tankCapacityLiters: number
  readonly currentFuelLiters: number
  readonly reserveLiters: number
  readonly calculationPoint: 'pre-race' | 'in-race'
  readonly planningZScore?: number
}

export interface FuelPlan {
  readonly race: RaceLapProjection
  readonly fuel: ResourceProjection
  readonly recommendedFuelLiters: number
  readonly expectedFuelLiters: number
  readonly openingFuelTargetLiters: number
  readonly fuelToAddBeforeStartLiters: number
  readonly pitStops: number
  readonly finalStintFuelLiters: number
  readonly stintFuelLoadsLiters: readonly number[]
}

function finiteNonNegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite non-negative number`)
}

export function buildFuelPlan(input: FuelPlanInput): FuelPlan {
  finiteNonNegative(input.tankCapacityLiters, 'tankCapacityLiters')
  finiteNonNegative(input.currentFuelLiters, 'currentFuelLiters')
  finiteNonNegative(input.reserveLiters, 'reserveLiters')
  if (input.tankCapacityLiters <= 0) throw new RangeError('tankCapacityLiters must be greater than zero')
  if (input.currentFuelLiters > input.tankCapacityLiters) throw new RangeError('currentFuelLiters cannot exceed tankCapacityLiters')

  const race = projectRaceLaps(input.race)
  const fuel = projectResource({
    name: 'Fuel', unit: 'L', currentAmount: input.currentFuelLiters,
    reserveAmount: input.reserveLiters, perLapSamples: input.perLapSamplesLiters,
    zScore: input.planningZScore,
  }, race)
  const recommended = Math.max(0, fuel.requiredToFinish.conservative)
  const expected = Math.max(0, fuel.requiredToFinish.expected)
  const openingTarget = input.calculationPoint === 'pre-race'
    ? Math.min(input.tankCapacityLiters, recommended)
    : input.currentFuelLiters
  const remainingAfterOpening = Math.max(0, recommended - openingTarget)
  const stops = Math.ceil(remainingAfterOpening / input.tankCapacityLiters)
  const loads: number[] = [openingTarget]
  let remaining = remainingAfterOpening
  while (remaining > 0.000001) {
    const load = Math.min(input.tankCapacityLiters, remaining)
    loads.push(round(load, 3))
    remaining -= load
  }
  const finalStint = loads.at(-1) ?? openingTarget

  return {
    race, fuel,
    recommendedFuelLiters: round(recommended, 3),
    expectedFuelLiters: round(expected, 3),
    openingFuelTargetLiters: round(openingTarget, 3),
    fuelToAddBeforeStartLiters: input.calculationPoint === 'pre-race'
      ? round(Math.max(0, openingTarget - input.currentFuelLiters), 3)
      : 0,
    pitStops: stops,
    finalStintFuelLiters: round(finalStint, 3),
    stintFuelLoadsLiters: loads,
  }
}
