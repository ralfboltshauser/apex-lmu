/** Shared numerical primitives for the race-engineering modules. */

export const EPSILON = 1e-9;

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function finiteOrThrow(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
  return value;
}

export function nonNegativeOrThrow(value: number, name: string): number {
  finiteOrThrow(value, name);
  if (value < 0) {
    throw new RangeError(`${name} must be greater than or equal to zero`);
  }
  return value;
}


export interface DistributionEstimate {
  readonly mean: number;
  readonly standardDeviation: number;
  readonly standardError: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly sampleSize: number;
  readonly coefficientOfVariation: number;
}

/**
 * Describes finite samples using the unbiased sample standard deviation.
 * Invalid values are rejected rather than silently turning a prediction into NaN.
 */
export function describeSamples(
  samples: readonly number[],
  options: { readonly minimum?: number; readonly name?: string } = {},
): DistributionEstimate {
  const minimum = options.minimum ?? -Infinity;
  const name = options.name ?? 'samples';
  if (samples.length === 0) {
    throw new RangeError(`${name} must contain at least one sample`);
  }

  for (const [index, value] of samples.entries()) {
    finiteOrThrow(value, `${name}[${index}]`);
    if (value < minimum) {
      throw new RangeError(`${name}[${index}] must be at least ${minimum}`);
    }
  }

  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const sumSquaredError = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const standardDeviation = samples.length > 1
    ? Math.sqrt(sumSquaredError / (samples.length - 1))
    : 0;

  return {
    mean,
    standardDeviation,
    standardError: standardDeviation / Math.sqrt(samples.length),
    minimum: samples.reduce((lowest, value) => Math.min(lowest, value), Infinity),
    maximum: samples.reduce((highest, value) => Math.max(highest, value), -Infinity),
    sampleSize: samples.length,
    coefficientOfVariation: Math.abs(mean) > EPSILON
      ? standardDeviation / Math.abs(mean)
      : 0,
  };
}

/** Fast, deterministic approximation of the standard normal CDF. */
export function standardNormalCdf(value: number): number {
  // Abramowitz and Stegun 7.1.26; maximum absolute error is about 7.5e-8.
  const absolute = Math.abs(value);
  const t = 1 / (1 + 0.2316419 * absolute);
  const density = 0.3989422804014327 * Math.exp(-(absolute ** 2) / 2);
  const polynomial = t * (
    0.319381530
    + t * (-0.356563782
    + t * (1.781477937
    + t * (-1.821255978
    + t * 1.330274429)))
  );
  const positiveCdf = 1 - density * polynomial;
  return value >= 0 ? positiveCdf : 1 - positiveCdf;
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
