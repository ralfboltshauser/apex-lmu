import { clamp, round } from './common';

export interface ConfidenceFactor {
  readonly id: string;
  readonly score: number;
  readonly weight?: number;
  readonly explanation?: string;
}

export type ConfidenceLabel = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

export interface ConfidenceScore {
  readonly score: number;
  readonly percent: number;
  readonly label: ConfidenceLabel;
  readonly factors: readonly ConfidenceFactor[];
  readonly limitingFactor?: ConfidenceFactor;
}

export function confidenceLabel(score: number): ConfidenceLabel {
  if (score < 0.3) return 'very-low';
  if (score < 0.5) return 'low';
  if (score < 0.7) return 'medium';
  if (score < 0.87) return 'high';
  return 'very-high';
}

/**
 * Combines independent evidence. The weighted mean communicates overall quality,
 * while a small weakest-link penalty prevents one missing critical input from
 * being hidden by several perfect inputs.
 */
export function scoreConfidence(factors: readonly ConfidenceFactor[]): ConfidenceScore {
  if (factors.length === 0) {
    return { score: 0, percent: 0, label: 'very-low', factors: [] };
  }

  const normalized = factors.map((factor) => ({
    ...factor,
    score: clamp(factor.score),
    weight: Math.max(0, factor.weight ?? 1),
  }));
  const totalWeight = normalized.reduce((sum, factor) => sum + factor.weight, 0);
  const weightedMean = totalWeight > 0
    ? normalized.reduce((sum, factor) => sum + factor.score * factor.weight, 0) / totalWeight
    : 0;
  const limitingFactor = normalized.reduce((worst, factor) =>
    factor.score < worst.score ? factor : worst,
  );
  const weakestLinkPenalty = 0.15 * (weightedMean - limitingFactor.score);
  const score = round(clamp(weightedMean - weakestLinkPenalty), 4);

  return {
    score,
    percent: Math.round(score * 100),
    label: confidenceLabel(score),
    factors: normalized,
    limitingFactor,
  };
}

/** Saturating evidence score: ten clean laps is useful; thirty is strong. */
export function sampleSizeConfidence(sampleSize: number, strongAt = 20): number {
  if (sampleSize <= 0 || strongAt <= 0) return 0;
  return clamp(1 - Math.exp(-sampleSize / (strongAt / 3)));
}

/** Converts relative sample spread into confidence, with a soft tolerance. */
export function dispersionConfidence(coefficientOfVariation: number, tolerance = 0.08): number {
  if (coefficientOfVariation < 0 || tolerance <= 0) return 0;
  return clamp(Math.exp(-((coefficientOfVariation / tolerance) ** 2) / 2));
}

/** Scores how much of a requested distance range is represented by samples. */
export function coverageConfidence(coveredDistance: number, requestedDistance: number): number {
  if (requestedDistance <= 0) return 0;
  return clamp(coveredDistance / requestedDistance);
}
