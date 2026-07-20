import { clamp, finiteOrThrow, nonNegativeOrThrow, round, sum } from './common';
import { scoreConfidence, type ConfidenceScore } from './confidence';

const MAX_GENERATED_STOPS = 512;

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

export interface TimedStrategyInput extends Omit<StrategyInput, 'remainingLapEquivalents'> {
  readonly durationSeconds: number;
  /** Progress through the already-started lap at the planning instant. */
  readonly currentLapProgress?: number;
  /** Some event rules require one complete additional lap after zero. */
  readonly finishRule?: 'line-after-zero' | 'line-after-zero-plus-one';
  /** Number of materially distinct stop-count candidates to retain. */
  readonly maximumAlternatives?: number;
}

export interface TimedStrategyResult extends StrategyResult {
  readonly projectedLapCount: number;
  readonly finishRule: 'line-after-zero' | 'line-after-zero-plus-one';
}

function riskLabel(score: number): StrategyRisk {
  if (score < 0.3) return 'low';
  if (score < 0.55) return 'medium';
  if (score < 0.78) return 'high';
  return 'critical';
}

/**
 * Pit calls happen at line crossings, so a race-start plan with a whole-lap
 * distance must also use whole-lap stints. Fractional distances remain valid
 * for an in-progress race where the current lap is already partly complete.
 */
function balancedRaceStints(total: number, maxima: readonly number[]): number[] | undefined {
  if (!Number.isInteger(total)) {
    const currentLapRemainder = total - Math.floor(total);
    if (maxima[0] + 1e-9 < currentLapRemainder) return undefined;
    const capacities = maxima.map((maximum, index) => Math.floor(maximum - (index === 0 ? currentLapRemainder : 0) + 1e-9));
    const result = maxima.map((_, index) => index === 0 ? currentLapRemainder : 0);
    const wholeLaps = Math.floor(total);
    if (sum(capacities) < wholeLaps) return undefined;
    for (let lap = 0; lap < wholeLaps; lap += 1) {
      let selected = -1;
      for (let index = 0; index < result.length; index += 1) {
        const usedWholeLaps = result[index] - (index === 0 ? currentLapRemainder : 0);
        if (usedWholeLaps >= capacities[index]) continue;
        if (selected === -1 || result[index] < result[selected]) selected = index;
      }
      if (selected === -1) return undefined;
      result[selected] += 1;
    }
    return result.every((distance) => distance > 1e-9) ? result : undefined;
  }
  const capacities = maxima.map((maximum) => Math.floor(maximum + 1e-9));
  if (sum(capacities) < total) return undefined;

  const result = capacities.map(() => 0);
  for (let lap = 0; lap < total; lap += 1) {
    let selected = -1;
    for (let index = 0; index < result.length; index += 1) {
      if (result[index] >= capacities[index]) continue;
      if (selected === -1 || result[index] < result[selected]) selected = index;
    }
    if (selected === -1) return undefined;
    result[selected] += 1;
  }
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
  if (Number.isInteger(input.remainingLapEquivalents)) {
    const firstWholeLaps = Math.floor(firstRange + 1e-9);
    const fullWholeLaps = Math.floor(fullRange + 1e-9);
    if (input.remainingLapEquivalents <= firstWholeLaps) return 0;
    if (fullWholeLaps <= 0) return Number.POSITIVE_INFINITY;
    return Math.ceil((input.remainingLapEquivalents - firstWholeLaps) / fullWholeLaps);
  }
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
    && (!Number.isInteger(input.maximumStops) || input.maximumStops < 0 || input.maximumStops > MAX_GENERATED_STOPS)
  ) {
    throw new RangeError(`maximumStops must be an integer between 0 and ${MAX_GENERATED_STOPS}`);
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
  const maximumStops = input.maximumStops ?? minimumStops + 2;
  if (maximumStops > MAX_GENERATED_STOPS) {
    return {
      minimumStops,
      candidates: [],
      rejected: [{
        stopCount: minimumStops,
        reason: `The plan requires more than ${MAX_GENERATED_STOPS} stops and is outside the operational bound.`,
      }],
    };
  }
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
  const maximumLineCrossingStops = Math.max(0, Math.ceil(input.remainingLapEquivalents - 1e-9) - 1);

  for (let stops = Math.max(0, minimumStops); stops <= maximumStops; stops += 1) {
    if (stops > maximumLineCrossingStops) {
      rejected.push({ stopCount: stops, reason: 'There are not enough remaining line crossings for that stop count.' });
      continue;
    }
    const maxima = [firstMaximum, ...Array.from({ length: stops }, () => fullMaximum)];
    const stintDistances = balancedRaceStints(input.remainingLapEquivalents, maxima);
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

/**
 * Solve a timed race and its pit cost together. A valid line-after-zero plan
 * must cross the line at or after zero while its previous crossing is before
 * zero. Exhaustive integer-lap search avoids a fixed-point oscillation at that
 * boundary and is bounded by the no-stop lap count.
 */
export function generateTimedStrategyCandidates(input: TimedStrategyInput): TimedStrategyResult {
  nonNegativeOrThrow(input.durationSeconds, 'durationSeconds');
  if (input.averageLapTimeSeconds <= 0) {
    throw new RangeError('averageLapTimeSeconds must be greater than zero');
  }
  const maximumAlternatives = input.maximumAlternatives ?? 3;
  if (!Number.isInteger(maximumAlternatives) || maximumAlternatives < 1) {
    throw new RangeError('maximumAlternatives must be a positive integer');
  }
  const progress = input.currentLapProgress ?? 0;
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new RangeError('currentLapProgress must be in the range 0..1');
  }
  const finishRule = input.finishRule ?? 'line-after-zero';
  const forcedExtraCrossings = finishRule === 'line-after-zero-plus-one' ? 1 : 0;
  const currentLapRemainder = progress >= 1 - 1e-9 ? 1 : 1 - progress;
  const secondsToCurrentLine = currentLapRemainder * input.averageLapTimeSeconds;
  const crossingsAfterCurrent = input.durationSeconds <= secondsToCurrentLine + 1e-7
    ? 0
    : Math.ceil((input.durationSeconds - secondsToCurrentLine) / input.averageLapTimeSeconds - 1e-9);
  const noStopLapCount = currentLapRemainder + crossingsAfterCurrent + forcedExtraCrossings;

  const noStopResult = generateStrategyCandidates({
    ...input,
    remainingLapEquivalents: noStopLapCount,
    maximumStops: undefined,
  });
  const upperStopCount = Number.isFinite(noStopResult.minimumStops)
    ? noStopResult.minimumStops + maximumAlternatives - 1
    : maximumAlternatives - 1;
  if (upperStopCount > MAX_GENERATED_STOPS) {
    return {
      minimumStops: noStopResult.minimumStops,
      candidates: [],
      rejected: noStopResult.rejected,
      projectedLapCount: noStopLapCount,
      finishRule,
    };
  }
  const byStopCount = new Map<number, StrategyCandidate>();
  const rejected: RejectedStrategy[] = [];

  for (let lapCount = noStopLapCount; lapCount >= currentLapRemainder - 1e-7; lapCount -= 1) {
    const result = generateStrategyCandidates({
      ...input,
      remainingLapEquivalents: lapCount,
      maximumStops: upperStopCount,
    });
    rejected.push(...result.rejected);
    for (const candidate of result.candidates) {
      const totalDistance = sum(candidate.stints.map((stint) => stint.lapEquivalents));
      const crossingTimes: number[] = [];
      for (let crossingDistance = currentLapRemainder; crossingDistance <= totalDistance + 1e-7; crossingDistance += 1) {
        const priorPitTime = sum(candidate.pitStops
          .filter((stop) => stop.afterLapEquivalentsFromNow < crossingDistance - 1e-7)
          .map((stop) => stop.totalPitCostSeconds));
        crossingTimes.push(crossingDistance * input.averageLapTimeSeconds + priorPitTime);
      }
      const firstAfterZero = crossingTimes.findIndex((seconds) => seconds + 1e-7 >= input.durationSeconds);
      if (firstAfterZero < 0 || firstAfterZero + forcedExtraCrossings !== crossingTimes.length - 1) continue;
      const current = byStopCount.get(candidate.stopCount);
      if (!current || candidate.rankingCostSeconds < current.rankingCostSeconds) {
        byStopCount.set(candidate.stopCount, candidate);
      }
    }
  }

  const candidateDistance = (candidate: StrategyCandidate) =>
    sum(candidate.stints.map((stint) => stint.lapEquivalents));
  const candidates = [...byStopCount.values()]
    // In a timed race, completing more laps outranks merely crossing the finish
    // line sooner. Only compare time/risk costs between equal-distance plans.
    .sort((left, right) =>
      candidateDistance(right) - candidateDistance(left)
      || left.rankingCostSeconds - right.rankingCostSeconds
      || left.stopCount - right.stopCount)
    .slice(0, maximumAlternatives);
  const minimumStops = candidates.length > 0
    ? Math.min(...candidates.map((candidate) => candidate.stopCount))
    : noStopResult.minimumStops;
  const recommended = candidates[0];
  return {
    minimumStops,
    candidates,
    recommended,
    rejected,
    projectedLapCount: recommended?.stints.reduce((total, stint) => total + stint.lapEquivalents, 0) ?? noStopLapCount,
    finishRule,
  };
}
