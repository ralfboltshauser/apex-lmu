import { clamp, finiteOrThrow, nonNegativeOrThrow, round, sum } from './common';
import { scoreConfidence, type ConfidenceScore } from './confidence';

/** Structurally compatible with the rate returned by projectResource(). */
export interface ConsumptionRate {
  readonly mean: number;
  readonly conservative: number;
  readonly standardDeviation?: number;
  readonly sampleSize?: number;
}

export interface TyreStrategyInput {
  readonly currentAgeLaps?: number;
  readonly changeTimeSeconds: number;
  /** A hard safety constraint, not merely a performance target. */
  readonly maximumSafeAgeLaps?: number;
  /** Additional lap time for each lap of tyre age. */
  readonly degradationSecondsPerAgeLap?: number;
}

export interface StrategyInput {
  readonly remainingLapEquivalents: number;
  readonly currentRaceLap?: number;
  readonly currentFuelLitres: number;
  readonly tankCapacityLitres: number;
  readonly fuel: ConsumptionRate;
  readonly fuelReserveLitres?: number;
  readonly averageLapTimeSeconds: number;
  readonly pitLaneLossSeconds: number;
  readonly refuelLitresPerSecond: number;
  readonly serviceConcurrency?: 'parallel' | 'sequential';
  readonly tyres?: TyreStrategyInput;
  readonly maximumStops?: number;
  /** Converts risk into comparable time when ranking candidates. */
  readonly riskPenaltySeconds?: number;
}

export type StrategyRisk = 'low' | 'medium' | 'high' | 'critical';

export interface StintPlan {
  readonly index: number;
  readonly lapEquivalents: number;
  readonly expectedFuelUseLitres: number;
  readonly conservativeFuelUseLitres: number;
  readonly tyreAgeAtStartLaps: number;
  readonly tyreAgeAtEndLaps: number;
}

export interface PitStopPlan {
  readonly index: number;
  readonly afterLapEquivalentsFromNow: number;
  readonly estimatedRaceLap: number;
  readonly fuelToAddLitres: number;
  /** Maximum addition in the conservative-consumption scenario. */
  readonly maximumFuelToAddLitres: number;
  readonly targetFuelOnExitLitres: number;
  readonly changeTyres: boolean;
  readonly stationaryServiceSeconds: number;
  readonly totalPitCostSeconds: number;
}

export interface StrategyCandidate {
  readonly id: string;
  readonly stopCount: number;
  readonly stints: readonly StintPlan[];
  readonly pitStops: readonly PitStopPlan[];
  readonly totalFuelAddedLitres: number;
  readonly maximumFuelAddedLitres: number;
  readonly expectedFuelAtFinishLitres: number;
  readonly projectedRaceTimeSeconds: number;
  readonly projectedPitTimeSeconds: number;
  readonly projectedTyreLossSeconds: number;
  readonly riskScore: number;
  readonly risk: StrategyRisk;
  readonly rankingCostSeconds: number;
  readonly confidence: ConfidenceScore;
  readonly rationale: readonly string[];
}

export interface RejectedStrategy {
  readonly stopCount: number;
  readonly reason: string;
}

export interface StrategyResult {
  readonly minimumStops: number;
  readonly candidates: readonly StrategyCandidate[];
  readonly recommended?: StrategyCandidate;
  readonly rejected: readonly RejectedStrategy[];
}

function riskLabel(score: number): StrategyRisk {
  if (score < 0.3) return 'low';
  if (score < 0.55) return 'medium';
  if (score < 0.78) return 'high';
  return 'critical';
}

/**
 * Water-fills stint lengths while respecting the shorter first-stint range.
 * This avoids rejecting a valid strategy merely because equal stints are not valid.
 */
function balancedStints(total: number, maxima: readonly number[]): number[] | undefined {
  if (sum(maxima) + 1e-7 < total) return undefined;
  const result = maxima.map(() => 0);
  const active = new Set(maxima.map((_, index) => index));
  let remaining = total;

  while (active.size > 0) {
    const target = remaining / active.size;
    const constrained = [...active].filter((index) => maxima[index] < target - 1e-9);
    if (constrained.length === 0) {
      for (const index of active) result[index] = target;
      remaining = 0;
      break;
    }
    for (const index of constrained) {
      result[index] = maxima[index];
      remaining -= maxima[index];
      active.delete(index);
    }
  }

  if (remaining > 1e-6) return undefined;
  return result;
}

function tyreLossForStint(ageAtStart: number, distance: number, degradation: number): number {
  // Integral of degradation * age over a possibly fractional stint.
  return degradation * (ageAtStart * distance + (distance ** 2) / 2);
}

function serviceDuration(
  refuelSeconds: number,
  changeTyres: boolean,
  tyreChangeSeconds: number,
  concurrency: 'parallel' | 'sequential',
): number {
  const tyreSeconds = changeTyres ? tyreChangeSeconds : 0;
  return concurrency === 'parallel'
    ? Math.max(refuelSeconds, tyreSeconds)
    : refuelSeconds + tyreSeconds;
}

function minimumFeasibleStops(input: StrategyInput): number {
  const reserve = input.fuelReserveLitres ?? 0;
  const fuelFirstRange = Math.max(0, input.currentFuelLitres - reserve) / input.fuel.conservative;
  const fuelFullRange = Math.max(0, input.tankCapacityLitres - reserve) / input.fuel.conservative;
  const tyreMaximum = input.tyres?.maximumSafeAgeLaps;
  const firstTyreRange = tyreMaximum === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, tyreMaximum - (input.tyres?.currentAgeLaps ?? 0));
  const firstRange = Math.min(fuelFirstRange, firstTyreRange);
  const fullRange = Math.min(fuelFullRange, tyreMaximum ?? Number.POSITIVE_INFINITY);
  if (input.remainingLapEquivalents <= firstRange + 1e-9) return 0;
  if (fullRange <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil((input.remainingLapEquivalents - firstRange) / fullRange);
}

function validateInput(input: StrategyInput): void {
  nonNegativeOrThrow(input.remainingLapEquivalents, 'remainingLapEquivalents');
  nonNegativeOrThrow(input.currentFuelLitres, 'currentFuelLitres');
  nonNegativeOrThrow(input.tankCapacityLitres, 'tankCapacityLitres');
  nonNegativeOrThrow(input.fuel.mean, 'fuel.mean');
  nonNegativeOrThrow(input.fuel.conservative, 'fuel.conservative');
  nonNegativeOrThrow(input.fuelReserveLitres ?? 0, 'fuelReserveLitres');
  nonNegativeOrThrow(input.averageLapTimeSeconds, 'averageLapTimeSeconds');
  nonNegativeOrThrow(input.pitLaneLossSeconds, 'pitLaneLossSeconds');
  finiteOrThrow(input.refuelLitresPerSecond, 'refuelLitresPerSecond');
  if (input.fuel.mean <= 0 || input.fuel.conservative <= 0) {
    throw new RangeError('fuel rates must be greater than zero');
  }
  if (input.fuel.conservative < input.fuel.mean) {
    throw new RangeError('fuel.conservative must be greater than or equal to fuel.mean');
  }
  if (input.averageLapTimeSeconds <= 0) {
    throw new RangeError('averageLapTimeSeconds must be greater than zero');
  }
  if (input.refuelLitresPerSecond <= 0) {
    throw new RangeError('refuelLitresPerSecond must be greater than zero');
  }
  if (input.currentFuelLitres > input.tankCapacityLitres + 1e-6) {
    throw new RangeError('currentFuelLitres cannot exceed tankCapacityLitres');
  }
  if (
    input.maximumStops !== undefined
    && (!Number.isInteger(input.maximumStops) || input.maximumStops < 0)
  ) {
    throw new RangeError('maximumStops must be a non-negative integer');
  }
  if (input.tyres) {
    nonNegativeOrThrow(input.tyres.currentAgeLaps ?? 0, 'tyres.currentAgeLaps');
    nonNegativeOrThrow(input.tyres.changeTimeSeconds, 'tyres.changeTimeSeconds');
    nonNegativeOrThrow(input.tyres.maximumSafeAgeLaps ?? 0, 'tyres.maximumSafeAgeLaps');
    nonNegativeOrThrow(
      input.tyres.degradationSecondsPerAgeLap ?? 0,
      'tyres.degradationSecondsPerAgeLap',
    );
  }
}

function buildCandidate(
  input: StrategyInput,
  stopCount: number,
  stintDistances: readonly number[],
): StrategyCandidate | undefined {
  const reserve = input.fuelReserveLitres ?? 0;
  const concurrency = input.serviceConcurrency ?? 'parallel';
  const tyreChangeTime = input.tyres?.changeTimeSeconds ?? 0;
  const degradation = input.tyres?.degradationSecondsPerAgeLap ?? 0;
  const maximumTyreAge = input.tyres?.maximumSafeAgeLaps;
  const currentRaceLap = input.currentRaceLap ?? 0;
  let tyreAge = input.tyres?.currentAgeLaps ?? 0;
  let expectedFuel = input.currentFuelLitres;
  let conservativeFuel = input.currentFuelLitres;
  let cumulativeDistance = 0;
  let tyreLoss = 0;
  let pitTime = 0;
  const stints: StintPlan[] = [];
  const pitStops: PitStopPlan[] = [];

  for (let index = 0; index < stintDistances.length; index += 1) {
    const distance = stintDistances[index];
    const expectedUse = distance * input.fuel.mean;
    const conservativeUse = distance * input.fuel.conservative;
    if (conservativeFuel + 1e-6 < conservativeUse + reserve) {
      return undefined;
    }

    const ageAtStart = tyreAge;
    tyreLoss += tyreLossForStint(tyreAge, distance, degradation);
    tyreAge += distance;
    // A stop after the limit has already been exceeded cannot make that stint safe.
    if (maximumTyreAge !== undefined && tyreAge > maximumTyreAge + 1e-6) return undefined;
    cumulativeDistance += distance;
    expectedFuel = Math.max(0, expectedFuel - expectedUse);
    conservativeFuel = Math.max(0, conservativeFuel - conservativeUse);
    stints.push({
      index: index + 1,
      lapEquivalents: round(distance, 3),
      expectedFuelUseLitres: round(expectedUse, 3),
      conservativeFuelUseLitres: round(conservativeUse, 3),
      tyreAgeAtStartLaps: round(ageAtStart, 2),
      tyreAgeAtEndLaps: round(tyreAge, 2),
    });

    if (index >= stopCount) continue;
    const nextDistance = stintDistances[index + 1];
    const unsafeToKeepTyres = maximumTyreAge !== undefined
      && tyreAge + nextDistance > maximumTyreAge + 1e-9;
    const fuelNeededAtNextStart = Math.min(
      input.tankCapacityLitres,
      nextDistance * input.fuel.conservative + reserve,
    );
    const fuelToAdd = Math.max(0, fuelNeededAtNextStart - expectedFuel);
    const maximumFuelToAdd = Math.max(0, fuelNeededAtNextStart - conservativeFuel);
    if (fuelNeededAtNextStart > input.tankCapacityLitres + 1e-6) return undefined;
    const refuelSeconds = maximumFuelToAdd / input.refuelLitresPerSecond;

    // Change tyres when required for safety, or when doing so is predicted to save
    // more degradation than its incremental stationary cost.
    const lossIfKept = tyreLossForStint(tyreAge, nextDistance, degradation);
    const lossIfChanged = tyreLossForStint(0, nextDistance, degradation);
    const incrementalTyreService = concurrency === 'parallel'
      ? Math.max(0, tyreChangeTime - refuelSeconds)
      : tyreChangeTime;
    const changeTyres = unsafeToKeepTyres || lossIfKept - lossIfChanged > incrementalTyreService;
    const stationary = serviceDuration(
      refuelSeconds,
      changeTyres,
      tyreChangeTime,
      concurrency,
    );
    const totalPitCost = input.pitLaneLossSeconds + stationary;
    pitTime += totalPitCost;
    expectedFuel += fuelToAdd;
    conservativeFuel += maximumFuelToAdd;

    pitStops.push({
      index: index + 1,
      afterLapEquivalentsFromNow: round(cumulativeDistance, 2),
      estimatedRaceLap: currentRaceLap + Math.ceil(cumulativeDistance),
      fuelToAddLitres: round(fuelToAdd, 2),
      maximumFuelToAddLitres: round(maximumFuelToAdd, 2),
      targetFuelOnExitLitres: round(fuelNeededAtNextStart, 2),
      changeTyres,
      stationaryServiceSeconds: round(stationary, 2),
      totalPitCostSeconds: round(totalPitCost, 2),
    });
    if (changeTyres) tyreAge = 0;
  }

  const maxUtilization = Math.max(...stintDistances.map((distance, index) => {
    const available = index === 0
      ? Math.max(0, input.currentFuelLitres - reserve)
      : Math.max(0, input.tankCapacityLitres - reserve);
    return distance * input.fuel.conservative / Math.max(available, 1e-6);
  }));
  const rateUncertainty = clamp(
    (input.fuel.conservative - input.fuel.mean) / Math.max(input.fuel.mean, 1e-6),
    0,
    1,
  );
  const rangePressure = clamp((maxUtilization - 0.72) / 0.28);
  const samplePenalty = input.fuel.sampleSize === undefined
    ? 0.15
    : clamp((8 - input.fuel.sampleSize) / 8) * 0.2;
  const riskScore = round(clamp(rangePressure * 0.55 + rateUncertainty * 1.6 + samplePenalty), 4);
  const expectedFuelAtFinish = expectedFuel;
  const baseRaceTime = input.remainingLapEquivalents * input.averageLapTimeSeconds;
  const projectedRaceTime = baseRaceTime + pitTime + tyreLoss;
  const riskPenalty = input.riskPenaltySeconds ?? 30;
  const confidence = scoreConfidence([
    {
      id: 'fuel-data',
      score: clamp(1 - rateUncertainty * 4),
      weight: 1.2,
      explanation: 'Difference between mean and conservative fuel rates.',
    },
    {
      id: 'tank-headroom',
      score: clamp(1 - rangePressure),
      explanation: 'Headroom before a stint reaches its conservative tank range.',
    },
    {
      id: 'tyre-model',
      score: input.tyres && degradation > 0 ? 0.75 : 0.4,
      weight: 0.7,
      explanation: input.tyres && degradation > 0
        ? 'Tyre degradation is modelled from the supplied rate.'
        : 'No measured tyre degradation model was supplied.',
    },
  ]);
  const rationale = [
    stopCount === 0 ? 'No pit stop is required.' : `${stopCount} stop${stopCount === 1 ? '' : 's'} cover the conservative fuel demand.`,
    maxUtilization > 0.9
      ? 'At least one stint uses more than 90% of its conservative fuel range.'
      : 'Every stint retains useful conservative tank headroom.',
    pitStops.some((stop) => stop.changeTyres)
      ? 'Tyre changes are scheduled only when safety or predicted time gain justifies them.'
      : 'The model does not predict enough value from a tyre change.',
  ];

  return {
    id: `strategy-${stopCount}-stop`,
    stopCount,
    stints,
    pitStops,
    totalFuelAddedLitres: round(sum(pitStops.map((stop) => stop.fuelToAddLitres)), 2),
    maximumFuelAddedLitres: round(sum(pitStops.map((stop) => stop.maximumFuelToAddLitres)), 2),
    expectedFuelAtFinishLitres: round(expectedFuelAtFinish, 2),
    projectedRaceTimeSeconds: round(projectedRaceTime, 2),
    projectedPitTimeSeconds: round(pitTime, 2),
    projectedTyreLossSeconds: round(tyreLoss, 2),
    riskScore,
    risk: riskLabel(riskScore),
    rankingCostSeconds: round(projectedRaceTime + riskScore * riskPenalty, 2),
    confidence,
    rationale,
  };
}

export function generateStrategyCandidates(input: StrategyInput): StrategyResult {
  validateInput(input);
  const minimumStops = minimumFeasibleStops(input);
  if (!Number.isFinite(minimumStops)) {
    return {
      minimumStops,
      candidates: [],
      rejected: [{ stopCount: 0, reason: 'The tank has no usable conservative range.' }],
    };
  }

  if (input.maximumStops !== undefined && input.maximumStops < minimumStops) {
    return {
      minimumStops,
      candidates: [],
      rejected: [{
        stopCount: input.maximumStops,
        reason: `At least ${minimumStops} stops are required by fuel range or tyre life.`,
      }],
    };
  }
  const maximumStops = input.maximumStops ?? Math.min(6, minimumStops + 2);
  const reserve = input.fuelReserveLitres ?? 0;
  const fuelFirstMaximum = Math.max(0, input.currentFuelLitres - reserve) / input.fuel.conservative;
  const fuelFullMaximum = Math.max(0, input.tankCapacityLitres - reserve) / input.fuel.conservative;
  const tyreMaximum = input.tyres?.maximumSafeAgeLaps;
  const firstTyreMaximum = tyreMaximum === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, tyreMaximum - (input.tyres?.currentAgeLaps ?? 0));
  const firstMaximum = Math.min(fuelFirstMaximum, firstTyreMaximum);
  const fullMaximum = Math.min(fuelFullMaximum, tyreMaximum ?? Number.POSITIVE_INFINITY);
  const candidates: StrategyCandidate[] = [];
  const rejected: RejectedStrategy[] = [];

  for (let stops = Math.max(0, minimumStops); stops <= maximumStops; stops += 1) {
    const maxima = [firstMaximum, ...Array.from({ length: stops }, () => fullMaximum)];
    const stintDistances = balancedStints(input.remainingLapEquivalents, maxima);
    if (!stintDistances) {
      rejected.push({
        stopCount: stops,
        reason: 'Fuel range or maximum safe tyre age cannot cover the requested distance.',
      });
      continue;
    }
    const candidate = buildCandidate(input, stops, stintDistances);
    if (!candidate) {
      rejected.push({
        stopCount: stops,
        reason: 'The balanced plan violates a fuel or maximum tyre-age constraint.',
      });
      continue;
    }
    candidates.push(candidate);
  }

  candidates.sort((left, right) =>
    left.rankingCostSeconds - right.rankingCostSeconds || left.stopCount - right.stopCount,
  );
  return { minimumStops, candidates, recommended: candidates[0], rejected };
}
