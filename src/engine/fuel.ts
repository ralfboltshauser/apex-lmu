import {
  clamp,
  describeSamples,
  nonNegativeOrThrow,
  round,
  standardNormalCdf,
  type DistributionEstimate,
} from './common';
import {
  dispersionConfidence,
  sampleSizeConfidence,
  scoreConfidence,
  type ConfidenceScore,
} from './confidence';

export interface LapCountRace {
  readonly kind: 'laps';
  readonly totalLaps: number;
  readonly completedLaps: number;
  /** Progress through the current lap, in the inclusive range 0..1. */
  readonly currentLapProgress: number;
}

export interface TimedRace {
  readonly kind: 'timed';
  readonly durationSeconds: number;
  readonly elapsedSeconds: number;
  readonly currentLapProgress: number;
  readonly lapTimeSamplesSeconds: readonly number[];
  /** Some series mandate one complete lap after the first line crossing at zero. */
  readonly finishRule?: 'line-after-zero' | 'line-after-zero-plus-one';
  /** Z score used for the pace envelope; 1.645 corresponds to a one-sided 95% bound. */
  readonly paceZScore?: number;
}

export type RaceDistance = LapCountRace | TimedRace;

export interface ExtraLapRisk {
  readonly possible: boolean;
  readonly probability: number;
  readonly expectedSecondsFromBoundary: number;
  readonly explanation: string;
}

export interface RaceLapProjection {
  readonly expectedLapEquivalents: number;
  readonly optimisticLapEquivalents: number;
  readonly conservativeLapEquivalents: number;
  readonly clockSecondsRemaining?: number;
  readonly lapTime?: DistributionEstimate;
  readonly extraLapRisk?: ExtraLapRisk;
  readonly confidence: ConfidenceScore;
}

export interface ResourceState {
  readonly name: string;
  readonly unit: string;
  readonly currentAmount: number;
  readonly reserveAmount?: number;
  readonly perLapSamples: readonly number[];
  /** One-sided planning bound. 1.645 is approximately 95%. */
  readonly zScore?: number;
}

export type ResourceStatus = 'comfortable' | 'marginal' | 'short';

export interface ResourceProjection {
  readonly name: string;
  readonly unit: string;
  readonly perLap: DistributionEstimate & { readonly conservative: number };
  readonly requiredToFinish: {
    readonly optimistic: number;
    readonly expected: number;
    readonly conservative: number;
  };
  readonly finishBalance: {
    readonly bestCase: number;
    readonly expected: number;
    readonly worstCase: number;
  };
  readonly lapsUntilReserve: {
    readonly expected: number;
    readonly conservative: number;
  };
  readonly savePerLap: {
    readonly expected: number;
    readonly conservative: number;
  };
  readonly status: ResourceStatus;
  readonly confidence: ConfidenceScore;
}

export interface RaceResourceProjection {
  readonly race: RaceLapProjection;
  readonly fuel: ResourceProjection;
  readonly virtualEnergy?: ResourceProjection;
  readonly confidence: ConfidenceScore;
}

function validateProgress(progress: number): number {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new RangeError('currentLapProgress must be in the range 0..1');
  }
  return progress;
}

function timedLapEquivalents(
  clockRemaining: number,
  progress: number,
  lapTimeSeconds: number,
): number {
  const currentRemainder = 1 - progress;
  const secondsToCurrentLine = currentRemainder * lapTimeSeconds;
  if (clockRemaining <= secondsToCurrentLine) return currentRemainder;
  return currentRemainder + Math.ceil((clockRemaining - secondsToCurrentLine) / lapTimeSeconds);
}

export function projectRaceLaps(race: RaceDistance): RaceLapProjection {
  const progress = validateProgress(race.currentLapProgress);
  if (race.kind === 'laps') {
    nonNegativeOrThrow(race.totalLaps, 'totalLaps');
    nonNegativeOrThrow(race.completedLaps, 'completedLaps');
    const remaining = Math.max(0, race.totalLaps - race.completedLaps - progress);
    const confidence = scoreConfidence([
      { id: 'race-distance', score: 1, explanation: 'The race has a fixed lap count.' },
    ]);
    return {
      expectedLapEquivalents: remaining,
      optimisticLapEquivalents: remaining,
      conservativeLapEquivalents: remaining,
      confidence,
    };
  }

  nonNegativeOrThrow(race.durationSeconds, 'durationSeconds');
  nonNegativeOrThrow(race.elapsedSeconds, 'elapsedSeconds');
  const lapTime = describeSamples(race.lapTimeSamplesSeconds, {
    minimum: Number.EPSILON,
    name: 'lapTimeSamplesSeconds',
  });
  const clockRemaining = Math.max(0, race.durationSeconds - race.elapsedSeconds);
  const zScore = race.paceZScore ?? 1.645;
  nonNegativeOrThrow(zScore, 'paceZScore');
  const fastLap = Math.max(1, lapTime.mean - zScore * lapTime.standardDeviation);
  const slowLap = lapTime.mean + zScore * lapTime.standardDeviation;
  const forcedExtra = race.finishRule === 'line-after-zero-plus-one' ? 1 : 0;

  const nominal = timedLapEquivalents(clockRemaining, progress, lapTime.mean) + forcedExtra;
  const optimistic = timedLapEquivalents(clockRemaining, progress, slowLap) + forcedExtra;
  let conservative = timedLapEquivalents(clockRemaining, progress, fastLap) + forcedExtra;

  // Probability that the nominal finishing line is reached before zero, forcing
  // one more lap. This is the boundary that simple ceil(clock / lap) calculators miss.
  const nominalWithoutForced = nominal - forcedExtra;
  const boundaryMeanSeconds = nominalWithoutForced * lapTime.mean;
  const boundaryDeviation = lapTime.standardDeviation * Math.sqrt(Math.max(nominalWithoutForced, 0));
  const secondsFromBoundary = boundaryMeanSeconds - clockRemaining;
  const probability = boundaryDeviation > 0
    ? standardNormalCdf((clockRemaining - boundaryMeanSeconds) / boundaryDeviation)
    : clockRemaining > boundaryMeanSeconds ? 1 : 0;
  const possible = probability >= 0.01;
  if (possible) conservative = Math.max(conservative, nominal + 1);

  const confidence = scoreConfidence([
    {
      id: 'lap-count',
      score: sampleSizeConfidence(lapTime.sampleSize, 12),
      weight: 1.2,
      explanation: `${lapTime.sampleSize} timed laps observed.`,
    },
    {
      id: 'pace-stability',
      score: dispersionConfidence(lapTime.coefficientOfVariation, 0.035),
      explanation: 'Stable lap times make the finishing crossing easier to predict.',
    },
    {
      id: 'boundary-clearance',
      score: clamp(Math.abs(secondsFromBoundary) / Math.max(20, lapTime.mean * 0.25)),
      explanation: 'Confidence falls when the clock boundary is close to a line crossing.',
    },
  ]);

  return {
    expectedLapEquivalents: round(nominal, 4),
    optimisticLapEquivalents: round(Math.min(optimistic, nominal), 4),
    conservativeLapEquivalents: round(Math.max(conservative, nominal), 4),
    clockSecondsRemaining: clockRemaining,
    lapTime,
    extraLapRisk: {
      possible,
      probability: round(clamp(probability), 4),
      expectedSecondsFromBoundary: round(secondsFromBoundary, 2),
      explanation: possible
        ? 'A faster run to the nominal finishing line can start one additional lap before zero.'
        : 'The nominal finishing crossing is far enough beyond zero that another lap is unlikely.',
    },
    confidence,
  };
}

function totalConsumptionBounds(
  estimate: DistributionEstimate,
  laps: number,
  zScore: number,
): { expected: number; lower: number; upper: number } {
  const variance = laps * estimate.standardDeviation ** 2
    + laps ** 2 * estimate.standardError ** 2;
  const deviation = Math.sqrt(Math.max(0, variance));
  return {
    expected: estimate.mean * laps,
    lower: Math.max(0, estimate.mean * laps - zScore * deviation),
    upper: estimate.mean * laps + zScore * deviation,
  };
}

export function projectResource(
  resource: ResourceState,
  race: RaceLapProjection,
): ResourceProjection {
  nonNegativeOrThrow(resource.currentAmount, `${resource.name}.currentAmount`);
  const reserve = resource.reserveAmount ?? 0;
  nonNegativeOrThrow(reserve, `${resource.name}.reserveAmount`);
  const zScore = resource.zScore ?? 1.645;
  nonNegativeOrThrow(zScore, `${resource.name}.zScore`);
  const perLap = describeSamples(resource.perLapSamples, {
    minimum: Number.EPSILON,
    name: `${resource.name}.perLapSamples`,
  });
  const conservativeRate = perLap.mean + zScore * Math.sqrt(
    perLap.standardDeviation ** 2 + perLap.standardError ** 2,
  );
  const expectedUse = totalConsumptionBounds(perLap, race.expectedLapEquivalents, zScore);
  const optimisticUse = totalConsumptionBounds(perLap, race.optimisticLapEquivalents, zScore);
  const conservativeUse = totalConsumptionBounds(perLap, race.conservativeLapEquivalents, zScore);
  const required = {
    optimistic: optimisticUse.lower + reserve,
    expected: expectedUse.expected + reserve,
    conservative: conservativeUse.upper + reserve,
  };
  const availableForDriving = Math.max(0, resource.currentAmount - reserve);
  const expectedLaps = race.expectedLapEquivalents;
  const allowablePerLap = expectedLaps > 0 ? availableForDriving / expectedLaps : Infinity;
  const conservativeAllowablePerLap = race.conservativeLapEquivalents > 0
    ? availableForDriving / race.conservativeLapEquivalents
    : Infinity;
  const finishBalance = {
    bestCase: resource.currentAmount - required.optimistic,
    expected: resource.currentAmount - required.expected,
    worstCase: resource.currentAmount - required.conservative,
  };
  const status: ResourceStatus = finishBalance.expected < 0
    ? 'short'
    : finishBalance.worstCase < 0 ? 'marginal' : 'comfortable';
  const confidence = scoreConfidence([
    {
      id: 'sample-size',
      score: sampleSizeConfidence(perLap.sampleSize, 18),
      weight: 1.2,
      explanation: `${perLap.sampleSize} consumption laps observed.`,
    },
    {
      id: 'consumption-stability',
      score: dispersionConfidence(perLap.coefficientOfVariation, 0.08),
      explanation: 'Lower lap-to-lap spread makes consumption predictable.',
    },
    {
      id: 'race-distance',
      score: race.confidence.score,
      weight: 1.1,
      explanation: 'Resource demand inherits uncertainty from the race-distance forecast.',
    },
  ]);

  return {
    name: resource.name,
    unit: resource.unit,
    perLap: { ...perLap, conservative: round(conservativeRate, 5) },
    requiredToFinish: {
      optimistic: round(required.optimistic, 3),
      expected: round(required.expected, 3),
      conservative: round(required.conservative, 3),
    },
    finishBalance: {
      bestCase: round(finishBalance.bestCase, 3),
      expected: round(finishBalance.expected, 3),
      worstCase: round(finishBalance.worstCase, 3),
    },
    lapsUntilReserve: {
      expected: round(availableForDriving / perLap.mean, 2),
      conservative: round(availableForDriving / conservativeRate, 2),
    },
    savePerLap: {
      expected: round(Math.max(0, perLap.mean - allowablePerLap), 4),
      conservative: round(Math.max(0, conservativeRate - conservativeAllowablePerLap), 4),
    },
    status,
    confidence,
  };
}

export function projectRaceResources(input: {
  readonly race: RaceDistance;
  readonly fuel: ResourceState;
  readonly virtualEnergy?: ResourceState;
}): RaceResourceProjection {
  const race = projectRaceLaps(input.race);
  const fuel = projectResource(input.fuel, race);
  const virtualEnergy = input.virtualEnergy
    ? projectResource(input.virtualEnergy, race)
    : undefined;
  const confidence = scoreConfidence([
    { id: 'race', score: race.confidence.score, weight: 1.2 },
    { id: 'fuel', score: fuel.confidence.score, weight: 1.3 },
    ...(virtualEnergy
      ? [{ id: 'virtual-energy', score: virtualEnergy.confidence.score, weight: 1 }]
      : []),
  ]);
  return { race, fuel, virtualEnergy, confidence };
}
