import { describe, expect, it } from 'vitest';
import {
  compareTelemetryLaps,
  type CornerDefinition,
  type TelemetryLap,
  type TelemetryPoint,
} from './telemetry';

function makePoints(subject: boolean): TelemetryPoint[] {
  const distances = [0, 50, 100, 150, 200, 250, 300, 350, 400];
  const referenceTimes = [0, 5, 10, 12.5, 15, 17, 19, 25, 40];
  const subjectTimes = [0, 5, 10, 13, 15.6, 18, 20, 26, 41];
  return distances.map((distanceM, index) => ({
    distanceM,
    timeSeconds: (subject ? subjectTimes : referenceTimes)[index],
    speedKph: distanceM === 200
      ? subject ? 90 : 100
      : distanceM === 300 ? subject ? 165 : 180 : 200,
    brake: subject
      ? (distanceM >= 100 && distanceM <= 200 ? 0.7 : 0)
      : (distanceM >= 150 && distanceM <= 200 ? 0.7 : 0),
    throttle: distanceM <= 200
      ? 0
      : subject ? (distanceM >= 300 ? 1 : 0.1) : (distanceM >= 250 ? 1 : 0.1),
    steering: distanceM === 200 ? 0.7 : distanceM < 200 ? 0.3 : 0.1,
    lateralPositionM: distanceM === 200 ? (subject ? 1 : 0) : 0,
  }));
}

function makeLap(subject: boolean, valid = true): TelemetryLap {
  return {
    id: subject ? 'subject' : 'reference',
    lapTimeSeconds: subject ? 41 : 40,
    trackLengthM: 400,
    samples: makePoints(subject),
    valid,
    referenceQuality: subject ? undefined : 0.95,
    conditions: {
      trackTemperatureC: 30,
      airTemperatureC: 20,
      fuelStartLitres: 50,
      rainLevel: 0,
      tyreCompound: 'medium',
      gameVersion: '1.2',
    },
  };
}

const corner: CornerDefinition = {
  id: 't1', name: 'Turn 1', startDistanceM: 100, apexDistanceM: 200, endDistanceM: 300,
};

describe('telemetry lap comparison', () => {
  it('aligns by distance and attributes the corner loss', () => {
    const comparison = compareTelemetryLaps(makeLap(true), makeLap(false), [corner]);
    expect(comparison.totalDeltaSeconds).toBe(1);
    expect(comparison.corners[0].timeLossSeconds).toBe(1);
    expect(comparison.summary.largestOpportunityCornerId).toBe('t1');
    expect(comparison.corners[0].entryLossSeconds).toBeCloseTo(0.6, 4);
    expect(comparison.corners[0].exitLossSeconds).toBeCloseTo(0.4, 4);
  });

  it('generates evidence-backed braking, speed, throttle and line insights', () => {
    const comparison = compareTelemetryLaps(makeLap(true), makeLap(false), [corner]);
    const kinds = comparison.insights.map((insight) => insight.kind);
    expect(kinds).toContain('braking-point');
    expect(kinds).toContain('minimum-speed');
    expect(kinds).toContain('throttle-pickup');
    expect(kinds).toContain('exit-speed');
    expect(kinds).toContain('racing-line');
    const braking = comparison.insights.find((insight) => insight.kind === 'braking-point');
    expect(braking?.evidence.difference).toBe(-50);
    expect(braking?.message).toContain('50 m before');
  });

  it('reduces confidence when an invalid lap is used', () => {
    const valid = compareTelemetryLaps(makeLap(true), makeLap(false), [corner]);
    const invalid = compareTelemetryLaps(makeLap(true, false), makeLap(false), [corner]);
    expect(invalid.confidence.score).toBeLessThan(valid.confidence.score);
  });
});
