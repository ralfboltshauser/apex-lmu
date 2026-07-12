import { clamp, finiteOrThrow, round } from './common';
import {
  coverageConfidence,
  scoreConfidence,
  type ConfidenceScore,
} from './confidence';

export interface TelemetryPoint {
  readonly distanceM: number;
  readonly timeSeconds: number;
  readonly speedKph: number;
  /** Normalized pedal position, 0..1. */
  readonly throttle: number;
  /** Normalized pedal position, 0..1. */
  readonly brake: number;
  /** Normalized or angular steering value; only relative changes are used. */
  readonly steering?: number;
  readonly gear?: number;
  /** Signed offset from a stable track centre-line, when available. */
  readonly lateralPositionM?: number;
}

export interface LapConditions {
  readonly trackTemperatureC?: number;
  readonly airTemperatureC?: number;
  readonly fuelStartLitres?: number;
  readonly rainLevel?: number;
  readonly tyreCompound?: string;
  readonly gameVersion?: string;
}

export interface TelemetryLap {
  readonly id: string;
  readonly lapTimeSeconds: number;
  readonly trackLengthM: number;
  readonly samples: readonly TelemetryPoint[];
  readonly conditions?: LapConditions;
  readonly valid?: boolean;
  /** Curator or validation quality, 0..1. Defaults to 0.7 for a reference lap. */
  readonly referenceQuality?: number;
}

export interface CornerDefinition {
  readonly id: string;
  readonly name: string;
  /** Must include the approach/braking zone, not just the geometric turn. */
  readonly startDistanceM: number;
  readonly apexDistanceM: number;
  readonly endDistanceM: number;
}

export interface CornerMetrics {
  readonly elapsedSeconds: number;
  readonly entrySeconds: number;
  readonly exitSeconds: number;
  readonly entrySpeedKph: number;
  readonly minimumSpeedKph: number;
  readonly exitSpeedKph: number;
  readonly brakeStartDistanceM?: number;
  readonly brakeReleaseDistanceM?: number;
  readonly throttlePickupDistanceM?: number;
  readonly fullThrottleDistanceM?: number;
  readonly coastingDistanceM: number;
  readonly steeringCorrections: number;
  readonly lateralPositionAtApexM?: number;
  readonly sampleCount: number;
}

export type InsightKind =
  | 'corner-time'
  | 'phase'
  | 'braking-point'
  | 'brake-release'
  | 'minimum-speed'
  | 'throttle-pickup'
  | 'exit-speed'
  | 'coasting'
  | 'racing-line'
  | 'steering';

export interface InsightEvidence {
  readonly subject: number;
  readonly reference: number;
  readonly difference: number;
  readonly unit: 's' | 'm' | 'km/h' | 'count';
}

export interface CornerInsight {
  readonly id: string;
  readonly cornerId: string;
  readonly kind: InsightKind;
  readonly title: string;
  readonly message: string;
  readonly action: string;
  readonly evidence: InsightEvidence;
  readonly potentialGainSeconds: number;
  readonly confidence: ConfidenceScore;
}

export interface CornerComparison {
  readonly corner: CornerDefinition;
  readonly subject: CornerMetrics;
  readonly reference: CornerMetrics;
  /** Positive means the subject lost time to the reference. */
  readonly timeLossSeconds: number;
  readonly entryLossSeconds: number;
  readonly exitLossSeconds: number;
  readonly confidence: ConfidenceScore;
  readonly insights: readonly CornerInsight[];
}

export interface LapComparison {
  readonly subjectLapId: string;
  readonly referenceLapId: string;
  readonly totalDeltaSeconds: number;
  readonly conditionsSimilarity: number;
  readonly confidence: ConfidenceScore;
  readonly corners: readonly CornerComparison[];
  readonly insights: readonly CornerInsight[];
  readonly biggestLosses: readonly CornerComparison[];
  readonly summary: {
    readonly totalCornerLossSeconds: number;
    readonly entryLossSeconds: number;
    readonly exitLossSeconds: number;
    readonly largestOpportunityCornerId?: string;
  };
}

export interface ComparisonOptions {
  readonly brakeThreshold?: number;
  readonly throttlePickupThreshold?: number;
  readonly fullThrottleThreshold?: number;
}

function validateLap(lap: TelemetryLap, name: string): void {
  finiteOrThrow(lap.lapTimeSeconds, `${name}.lapTimeSeconds`);
  finiteOrThrow(lap.trackLengthM, `${name}.trackLengthM`);
  if (lap.lapTimeSeconds <= 0 || lap.trackLengthM <= 0) {
    throw new RangeError(`${name} lap time and track length must be greater than zero`);
  }
  if (lap.samples.length < 2) {
    throw new RangeError(`${name}.samples must contain at least two points`);
  }
  if (lap.referenceQuality !== undefined) {
    finiteOrThrow(lap.referenceQuality, `${name}.referenceQuality`);
    if (lap.referenceQuality < 0 || lap.referenceQuality > 1) {
      throw new RangeError(`${name}.referenceQuality must be in the range 0..1`);
    }
  }
  if (lap.conditions) {
    for (const [key, value] of Object.entries(lap.conditions)) {
      if (typeof value === 'number') finiteOrThrow(value, `${name}.conditions.${key}`);
    }
  }
  let previousDistance = -Infinity;
  let previousTime = -Infinity;
  for (const [index, point] of lap.samples.entries()) {
    for (const [key, value] of Object.entries({
      distanceM: point.distanceM,
      timeSeconds: point.timeSeconds,
      speedKph: point.speedKph,
      throttle: point.throttle,
      brake: point.brake,
    })) {
      finiteOrThrow(value, `${name}.samples[${index}].${key}`);
    }
    if (point.distanceM < previousDistance || point.timeSeconds < previousTime) {
      throw new RangeError(`${name}.samples must be ordered by non-decreasing distance and time`);
    }
    if (point.throttle < 0 || point.throttle > 1 || point.brake < 0 || point.brake > 1) {
      throw new RangeError(`${name} pedal values must be in the range 0..1`);
    }
    if (point.steering !== undefined) {
      finiteOrThrow(point.steering, `${name}.samples[${index}].steering`);
    }
    if (point.lateralPositionM !== undefined) {
      finiteOrThrow(point.lateralPositionM, `${name}.samples[${index}].lateralPositionM`);
    }
    previousDistance = point.distanceM;
    previousTime = point.timeSeconds;
  }
}

function validateCorner(corner: CornerDefinition, trackLengthM: number): void {
  const { startDistanceM: start, apexDistanceM: apex, endDistanceM: end } = corner;
  if (!(start >= 0 && start < apex && apex < end && end <= trackLengthM)) {
    throw new RangeError(
      `corner ${corner.id} must satisfy 0 <= start < apex < end <= track length`,
    );
  }
}

function interpolateNumber(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

function pointAtDistance(lap: TelemetryLap, distanceM: number): TelemetryPoint {
  const samples = lap.samples;
  if (distanceM <= samples[0].distanceM) return samples[0];
  if (distanceM >= samples[samples.length - 1].distanceM) return samples[samples.length - 1];

  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].distanceM <= distanceM) low = middle;
    else high = middle;
  }
  const before = samples[low];
  const after = samples[high];
  const span = after.distanceM - before.distanceM;
  const ratio = span > 0 ? (distanceM - before.distanceM) / span : 0;
  const optional = (key: 'steering' | 'lateralPositionM'): number | undefined => {
    const start = before[key];
    const end = after[key];
    return start !== undefined && end !== undefined
      ? interpolateNumber(start, end, ratio)
      : start ?? end;
  };
  return {
    distanceM,
    timeSeconds: interpolateNumber(before.timeSeconds, after.timeSeconds, ratio),
    speedKph: interpolateNumber(before.speedKph, after.speedKph, ratio),
    throttle: interpolateNumber(before.throttle, after.throttle, ratio),
    brake: interpolateNumber(before.brake, after.brake, ratio),
    steering: optional('steering'),
    lateralPositionM: optional('lateralPositionM'),
    gear: ratio < 0.5 ? before.gear : after.gear,
  };
}

function pointsForCorner(lap: TelemetryLap, corner: CornerDefinition): TelemetryPoint[] {
  const points = [
    pointAtDistance(lap, corner.startDistanceM),
    ...lap.samples.filter((point) =>
      point.distanceM > corner.startDistanceM && point.distanceM < corner.endDistanceM,
    ),
    pointAtDistance(lap, corner.endDistanceM),
  ];
  if (!points.some((point) => Math.abs(point.distanceM - corner.apexDistanceM) < 1e-6)) {
    points.push(pointAtDistance(lap, corner.apexDistanceM));
    points.sort((left, right) => left.distanceM - right.distanceM);
  }
  return points;
}

function firstWhere(
  points: readonly TelemetryPoint[],
  predicate: (point: TelemetryPoint) => boolean,
): number | undefined {
  return points.find(predicate)?.distanceM;
}

function lastWhere(
  points: readonly TelemetryPoint[],
  predicate: (point: TelemetryPoint) => boolean,
): number | undefined {
  return [...points].reverse().find(predicate)?.distanceM;
}

function coastingDistance(points: readonly TelemetryPoint[]): number {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      (previous.throttle + current.throttle) / 2 < 0.1
      && (previous.brake + current.brake) / 2 < 0.05
    ) {
      distance += current.distanceM - previous.distanceM;
    }
  }
  return distance;
}

function steeringCorrections(points: readonly TelemetryPoint[]): number {
  let previousDirection = 0;
  let corrections = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].steering;
    const current = points[index].steering;
    if (previous === undefined || current === undefined) continue;
    const change = current - previous;
    if (Math.abs(change) < 0.02) continue;
    const direction = Math.sign(change);
    if (previousDirection !== 0 && direction !== previousDirection) corrections += 1;
    previousDirection = direction;
  }
  return corrections;
}

export function extractCornerMetrics(
  lap: TelemetryLap,
  corner: CornerDefinition,
  options: ComparisonOptions = {},
): CornerMetrics {
  validateLap(lap, 'lap');
  validateCorner(corner, lap.trackLengthM);
  const points = pointsForCorner(lap, corner);
  const start = pointAtDistance(lap, corner.startDistanceM);
  const apex = pointAtDistance(lap, corner.apexDistanceM);
  const end = pointAtDistance(lap, corner.endDistanceM);
  const brakeThreshold = options.brakeThreshold ?? 0.1;
  const throttleThreshold = options.throttlePickupThreshold ?? 0.5;
  const fullThrottleThreshold = options.fullThrottleThreshold ?? 0.95;
  const afterApex = points.filter((point) => point.distanceM >= corner.apexDistanceM);
  const minimumSpeed = points.reduce((minimum, point) =>
    point.speedKph < minimum.speedKph ? point : minimum,
  );

  return {
    elapsedSeconds: end.timeSeconds - start.timeSeconds,
    entrySeconds: apex.timeSeconds - start.timeSeconds,
    exitSeconds: end.timeSeconds - apex.timeSeconds,
    entrySpeedKph: start.speedKph,
    minimumSpeedKph: minimumSpeed.speedKph,
    exitSpeedKph: end.speedKph,
    brakeStartDistanceM: firstWhere(points, (point) => point.brake >= brakeThreshold),
    brakeReleaseDistanceM: lastWhere(points, (point) => point.brake >= brakeThreshold * 0.6),
    throttlePickupDistanceM: firstWhere(
      afterApex,
      (point) => point.throttle >= throttleThreshold && point.brake < 0.05,
    ),
    fullThrottleDistanceM: firstWhere(
      afterApex,
      (point) => point.throttle >= fullThrottleThreshold && point.brake < 0.05,
    ),
    coastingDistanceM: coastingDistance(points),
    steeringCorrections: steeringCorrections(points),
    lateralPositionAtApexM: apex.lateralPositionM,
    sampleCount: points.length,
  };
}

function conditionsSimilarity(subject?: LapConditions, reference?: LapConditions): number {
  if (!subject && !reference) return 0.55;
  if (!subject || !reference) return 0.4;
  const factors: number[] = [];
  const differenceScore = (left: number | undefined, right: number | undefined, scale: number) => {
    if (left === undefined || right === undefined) return;
    factors.push(Math.exp(-Math.abs(left - right) / scale));
  };
  differenceScore(subject.trackTemperatureC, reference.trackTemperatureC, 10);
  differenceScore(subject.airTemperatureC, reference.airTemperatureC, 8);
  differenceScore(subject.fuelStartLitres, reference.fuelStartLitres, 25);
  differenceScore(subject.rainLevel, reference.rainLevel, 0.15);
  if (subject.tyreCompound !== undefined && reference.tyreCompound !== undefined) {
    factors.push(subject.tyreCompound === reference.tyreCompound ? 1 : 0.25);
  }
  if (subject.gameVersion !== undefined && reference.gameVersion !== undefined) {
    factors.push(subject.gameVersion === reference.gameVersion ? 1 : 0.35);
  }
  return factors.length > 0 ? factors.reduce((sum, value) => sum + value, 0) / factors.length : 0.55;
}

function evidence(
  subject: number,
  reference: number,
  unit: InsightEvidence['unit'],
): InsightEvidence {
  return { subject: round(subject, 3), reference: round(reference, 3), difference: round(subject - reference, 3), unit };
}

function insightConfidence(base: ConfidenceScore, relevance = 1): ConfidenceScore {
  return scoreConfidence([
    { id: 'comparison', score: base.score, weight: 1.5 },
    { id: 'effect-size', score: clamp(relevance), weight: 0.8 },
  ]);
}

function buildInsights(
  corner: CornerDefinition,
  subject: CornerMetrics,
  reference: CornerMetrics,
  timeLoss: number,
  entryLoss: number,
  exitLoss: number,
  confidence: ConfidenceScore,
): CornerInsight[] {
  const insights: CornerInsight[] = [];
  const potential = Math.max(0, timeLoss);
  const add = (
    kind: InsightKind,
    title: string,
    message: string,
    action: string,
    proof: InsightEvidence,
    share: number,
    relevance: number,
  ) => insights.push({
    id: `${corner.id}-${kind}`,
    cornerId: corner.id,
    kind,
    title,
    message,
    action,
    evidence: proof,
    potentialGainSeconds: round(potential * share, 3),
    confidence: insightConfidence(confidence, relevance),
  });

  if (Math.abs(timeLoss) >= 0.03) {
    const losing = timeLoss > 0;
    add(
      'corner-time',
      losing ? `${corner.name} is a time-loss hotspot` : `${corner.name} is ahead of reference`,
      losing
        ? `The subject loses ${Math.abs(timeLoss).toFixed(2)} s through the complete corner.`
        : `The subject gains ${Math.abs(timeLoss).toFixed(2)} s through the complete corner.`,
      losing ? 'Prioritize this corner before smaller opportunities.' : 'Preserve this approach while improving elsewhere.',
      evidence(subject.elapsedSeconds, reference.elapsedSeconds, 's'),
      1,
      Math.min(1, Math.abs(timeLoss) / 0.3),
    );
  }

  if (timeLoss > 0.03 && Math.abs(entryLoss - exitLoss) >= 0.02) {
    const entryDominates = entryLoss > exitLoss;
    const subjectValue = entryDominates ? subject.entrySeconds : subject.exitSeconds;
    const referenceValue = entryDominates ? reference.entrySeconds : reference.exitSeconds;
    add(
      'phase',
      entryDominates ? 'Most loss is before the apex' : 'Most loss is after the apex',
      `${Math.max(entryLoss, exitLoss).toFixed(2)} s of the corner loss occurs in the ${entryDominates ? 'entry' : 'exit'} phase.`,
      entryDominates
        ? 'Work on braking and rotation before chasing exit technique.'
        : 'Protect minimum speed and bring throttle application forward.',
      evidence(subjectValue, referenceValue, 's'),
      0.75,
      Math.min(1, Math.abs(entryLoss - exitLoss) / 0.2),
    );
  }

  if (subject.brakeStartDistanceM !== undefined && reference.brakeStartDistanceM !== undefined) {
    const difference = subject.brakeStartDistanceM - reference.brakeStartDistanceM;
    if (Math.abs(difference) >= 5) {
      add(
        'braking-point',
        difference < 0 ? 'Braking starts earlier' : 'Braking starts later',
        `The brake application begins ${Math.abs(difference).toFixed(0)} m ${difference < 0 ? 'before' : 'after'} the reference.`,
        difference < 0
          ? 'Move the initial brake marker later in small, repeatable steps if grip allows.'
          : 'Check whether the later brake point compromises minimum speed or release.',
        evidence(subject.brakeStartDistanceM, reference.brakeStartDistanceM, 'm'),
        0.24,
        Math.min(1, Math.abs(difference) / 25),
      );
    }
  }

  if (subject.brakeReleaseDistanceM !== undefined && reference.brakeReleaseDistanceM !== undefined) {
    const difference = subject.brakeReleaseDistanceM - reference.brakeReleaseDistanceM;
    if (Math.abs(difference) >= 5) {
      add(
        'brake-release',
        difference < 0 ? 'Brake releases earlier' : 'Brake releases deeper',
        `Brake pressure falls below the release threshold ${Math.abs(difference).toFixed(0)} m ${difference < 0 ? 'earlier' : 'later'} than reference.`,
        difference < 0
          ? 'Try a longer, smoother trail-brake release to support rotation.'
          : 'Check that deep trail braking is not suppressing minimum speed.',
        evidence(subject.brakeReleaseDistanceM, reference.brakeReleaseDistanceM, 'm'),
        0.23,
        Math.min(1, Math.abs(difference) / 25),
      );
    }
  }

  const minimumSpeedDifference = subject.minimumSpeedKph - reference.minimumSpeedKph;
  if (Math.abs(minimumSpeedDifference) >= 2) {
    add(
      'minimum-speed',
      minimumSpeedDifference < 0 ? 'Minimum speed is lower' : 'Minimum speed is higher',
      `Minimum speed is ${Math.abs(minimumSpeedDifference).toFixed(1)} km/h ${minimumSpeedDifference < 0 ? 'below' : 'above'} reference.`,
      minimumSpeedDifference < 0
        ? 'Reduce unnecessary deceleration and verify that turn-in still reaches the apex.'
        : 'Keep the speed only if it does not delay throttle or widen the exit.',
      evidence(subject.minimumSpeedKph, reference.minimumSpeedKph, 'km/h'),
      0.28,
      Math.min(1, Math.abs(minimumSpeedDifference) / 10),
    );
  }

  if (subject.throttlePickupDistanceM !== undefined && reference.throttlePickupDistanceM !== undefined) {
    const difference = subject.throttlePickupDistanceM - reference.throttlePickupDistanceM;
    if (Math.abs(difference) >= 5) {
      add(
        'throttle-pickup',
        difference > 0 ? 'Throttle pickup is later' : 'Throttle pickup is earlier',
        `Half throttle arrives ${Math.abs(difference).toFixed(0)} m ${difference > 0 ? 'later' : 'earlier'} than reference.`,
        difference > 0
          ? 'Prioritize rotation before the apex so throttle can begin sooner without adding steering.'
          : 'Preserve the earlier pickup while checking wheelspin and exit width.',
        evidence(subject.throttlePickupDistanceM, reference.throttlePickupDistanceM, 'm'),
        0.28,
        Math.min(1, Math.abs(difference) / 30),
      );
    }
  }

  const exitDifference = subject.exitSpeedKph - reference.exitSpeedKph;
  if (Math.abs(exitDifference) >= 2) {
    add(
      'exit-speed',
      exitDifference < 0 ? 'Exit speed is lower' : 'Exit speed is higher',
      `Exit speed is ${Math.abs(exitDifference).toFixed(1)} km/h ${exitDifference < 0 ? 'below' : 'above'} reference.`,
      exitDifference < 0
        ? 'Trade a little entry ambition for a cleaner rotation and earlier acceleration.'
        : 'Preserve this exit; its benefit continues along the following straight.',
      evidence(subject.exitSpeedKph, reference.exitSpeedKph, 'km/h'),
      0.25,
      Math.min(1, Math.abs(exitDifference) / 12),
    );
  }

  const coastDifference = subject.coastingDistanceM - reference.coastingDistanceM;
  if (Math.abs(coastDifference) >= 10) {
    add(
      'coasting',
      coastDifference > 0 ? 'Longer neutral coast phase' : 'Shorter coast phase',
      `The no-brake/no-throttle distance is ${Math.abs(coastDifference).toFixed(0)} m ${coastDifference > 0 ? 'longer' : 'shorter'} than reference.`,
      coastDifference > 0
        ? 'Connect brake release to throttle pickup more deliberately.'
        : 'Check that the shorter transition remains balanced and repeatable.',
      evidence(subject.coastingDistanceM, reference.coastingDistanceM, 'm'),
      0.18,
      Math.min(1, Math.abs(coastDifference) / 40),
    );
  }

  if (
    subject.lateralPositionAtApexM !== undefined
    && reference.lateralPositionAtApexM !== undefined
  ) {
    const difference = subject.lateralPositionAtApexM - reference.lateralPositionAtApexM;
    if (Math.abs(difference) >= 0.5) {
      add(
        'racing-line',
        'Different apex position',
        `The signed apex position differs by ${Math.abs(difference).toFixed(1)} m from reference.`,
        'Compare the line visually before changing inputs; track-centre sign alone does not identify a better line.',
        evidence(subject.lateralPositionAtApexM, reference.lateralPositionAtApexM, 'm'),
        0.12,
        Math.min(1, Math.abs(difference) / 2),
      );
    }
  }

  const correctionDifference = subject.steeringCorrections - reference.steeringCorrections;
  if (correctionDifference >= 2) {
    add(
      'steering',
      'More steering corrections',
      `The subject makes ${correctionDifference} more meaningful steering reversals through the corner.`,
      'Use a calmer initial steering rate and verify whether entry speed is creating instability.',
      evidence(subject.steeringCorrections, reference.steeringCorrections, 'count'),
      0.12,
      Math.min(1, correctionDifference / 5),
    );
  }

  return insights.sort((left, right) =>
    right.potentialGainSeconds - left.potentialGainSeconds || left.id.localeCompare(right.id),
  );
}

export function compareTelemetryLaps(
  subject: TelemetryLap,
  reference: TelemetryLap,
  corners: readonly CornerDefinition[],
  options: ComparisonOptions = {},
): LapComparison {
  validateLap(subject, 'subject');
  validateLap(reference, 'reference');
  if (Math.abs(subject.trackLengthM - reference.trackLengthM) > 1) {
    throw new RangeError('subject and reference must use the same track layout');
  }
  const similarity = conditionsSimilarity(subject.conditions, reference.conditions);
  const subjectCoverage = subject.samples[subject.samples.length - 1].distanceM
    - subject.samples[0].distanceM;
  const referenceCoverage = reference.samples[reference.samples.length - 1].distanceM
    - reference.samples[0].distanceM;
  const confidence = scoreConfidence([
    {
      id: 'subject-coverage',
      score: coverageConfidence(subjectCoverage, subject.trackLengthM),
      weight: 1.2,
      explanation: 'Distance represented by the subject samples.',
    },
    {
      id: 'reference-coverage',
      score: coverageConfidence(referenceCoverage, reference.trackLengthM),
      weight: 1.2,
      explanation: 'Distance represented by the reference samples.',
    },
    {
      id: 'conditions',
      score: similarity,
      explanation: 'Similarity of temperature, fuel, rain, tyres, and game version.',
    },
    {
      id: 'validity',
      score: subject.valid === false || reference.valid === false ? 0.1 : 1,
      weight: 1.3,
      explanation: 'Invalid laps should not drive strong coaching claims.',
    },
    {
      id: 'reference-quality',
      score: clamp(reference.referenceQuality ?? 0.7),
      explanation: 'Curator or validation quality of the reference lap.',
    },
  ]);

  const cornerComparisons = corners.map((corner): CornerComparison => {
    validateCorner(corner, subject.trackLengthM);
    const subjectMetrics = extractCornerMetrics(subject, corner, options);
    const referenceMetrics = extractCornerMetrics(reference, corner, options);
    const cornerLength = corner.endDistanceM - corner.startDistanceM;
    const expectedSamples = Math.max(3, cornerLength / 20);
    const density = Math.min(subjectMetrics.sampleCount, referenceMetrics.sampleCount) / expectedSamples;
    const cornerConfidence = scoreConfidence([
      { id: 'lap-comparison', score: confidence.score, weight: 1.4 },
      { id: 'corner-density', score: clamp(density), weight: 1 },
    ]);
    const timeLoss = subjectMetrics.elapsedSeconds - referenceMetrics.elapsedSeconds;
    const entryLoss = subjectMetrics.entrySeconds - referenceMetrics.entrySeconds;
    const exitLoss = subjectMetrics.exitSeconds - referenceMetrics.exitSeconds;
    return {
      corner,
      subject: subjectMetrics,
      reference: referenceMetrics,
      timeLossSeconds: round(timeLoss, 4),
      entryLossSeconds: round(entryLoss, 4),
      exitLossSeconds: round(exitLoss, 4),
      confidence: cornerConfidence,
      insights: buildInsights(
        corner,
        subjectMetrics,
        referenceMetrics,
        timeLoss,
        entryLoss,
        exitLoss,
        cornerConfidence,
      ),
    };
  });
  const allInsights = cornerComparisons
    .flatMap((comparison) => comparison.insights)
    .sort((left, right) =>
      right.potentialGainSeconds - left.potentialGainSeconds || left.id.localeCompare(right.id),
    );
  const biggestLosses = [...cornerComparisons]
    .filter((comparison) => comparison.timeLossSeconds > 0)
    .sort((left, right) => right.timeLossSeconds - left.timeLossSeconds);

  return {
    subjectLapId: subject.id,
    referenceLapId: reference.id,
    totalDeltaSeconds: round(subject.lapTimeSeconds - reference.lapTimeSeconds, 4),
    conditionsSimilarity: round(similarity, 4),
    confidence,
    corners: cornerComparisons,
    insights: allInsights,
    biggestLosses,
    summary: {
      totalCornerLossSeconds: round(cornerComparisons.reduce(
        (total, comparison) => total + comparison.timeLossSeconds,
        0,
      ), 4),
      entryLossSeconds: round(cornerComparisons.reduce(
        (total, comparison) => total + comparison.entryLossSeconds,
        0,
      ), 4),
      exitLossSeconds: round(cornerComparisons.reduce(
        (total, comparison) => total + comparison.exitLossSeconds,
        0,
      ), 4),
      largestOpportunityCornerId: biggestLosses[0]?.corner.id,
    },
  };
}
