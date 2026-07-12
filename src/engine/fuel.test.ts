import { describe, expect, it } from 'vitest';
import { projectRaceLaps, projectRaceResources, projectResource } from './fuel';

describe('race distance projection', () => {
  it('projects a fixed-lap race from current lap progress', () => {
    const projection = projectRaceLaps({
      kind: 'laps',
      totalLaps: 30,
      completedLaps: 10,
      currentLapProgress: 0.25,
    });
    expect(projection.expectedLapEquivalents).toBe(19.75);
    expect(projection.conservativeLapEquivalents).toBe(19.75);
  });

  it('detects an uncertain timed-race extra-lap boundary', () => {
    const projection = projectRaceLaps({
      kind: 'timed',
      durationSeconds: 3_600,
      elapsedSeconds: 2_960,
      currentLapProgress: 0.5,
      lapTimeSamplesSeconds: [94, 98, 100, 102, 106],
    });
    expect(projection.expectedLapEquivalents).toBe(6.5);
    expect(projection.extraLapRisk?.possible).toBe(true);
    expect(projection.extraLapRisk?.probability).toBeGreaterThan(0.01);
    expect(projection.conservativeLapEquivalents).toBeGreaterThanOrEqual(7.5);
  });

  it('supports series which mandate a complete extra lap after zero', () => {
    const standard = projectRaceLaps({
      kind: 'timed', durationSeconds: 1_800, elapsedSeconds: 1_500,
      currentLapProgress: 0.5, lapTimeSamplesSeconds: [100, 100, 100],
    });
    const plusOne = projectRaceLaps({
      kind: 'timed', durationSeconds: 1_800, elapsedSeconds: 1_500,
      currentLapProgress: 0.5, lapTimeSamplesSeconds: [100, 100, 100],
      finishRule: 'line-after-zero-plus-one',
    });
    expect(plusOne.expectedLapEquivalents).toBe(standard.expectedLapEquivalents + 1);
  });
});

describe('resource projection', () => {
  const race = projectRaceLaps({
    kind: 'laps', totalLaps: 10, completedLaps: 0, currentLapProgress: 0,
  });

  it('reports expected and uncertainty-aware requirements', () => {
    const projection = projectResource({
      name: 'Fuel', unit: 'L', currentAmount: 26, reserveAmount: 1,
      perLapSamples: [2.4, 2.5, 2.6, 2.5, 2.45, 2.55],
    }, race);
    expect(projection.requiredToFinish.optimistic)
      .toBeLessThan(projection.requiredToFinish.expected);
    expect(projection.requiredToFinish.expected)
      .toBeLessThan(projection.requiredToFinish.conservative);
    expect(projection.finishBalance.expected).toBeCloseTo(0, 5);
    expect(projection.status).toBe('marginal');
  });

  it('calculates the saving required per lap when short', () => {
    const projection = projectResource({
      name: 'Fuel', unit: 'L', currentAmount: 22, reserveAmount: 1,
      perLapSamples: [2.45, 2.5, 2.55],
    }, race);
    expect(projection.status).toBe('short');
    expect(projection.savePerLap.expected).toBeCloseTo(0.4, 3);
    expect(projection.savePerLap.conservative).toBeGreaterThan(projection.savePerLap.expected);
  });

  it('projects fuel and Virtual Energy together without coupling their units', () => {
    const projection = projectRaceResources({
      race: { kind: 'laps', totalLaps: 5, completedLaps: 0, currentLapProgress: 0 },
      fuel: { name: 'Fuel', unit: 'L', currentAmount: 15, perLapSamples: [2, 2.1, 1.9] },
      virtualEnergy: {
        name: 'Virtual Energy', unit: '%', currentAmount: 100,
        perLapSamples: [18, 19, 20], reserveAmount: 2,
      },
    });
    expect(projection.fuel.unit).toBe('L');
    expect(projection.virtualEnergy?.unit).toBe('%');
    expect(projection.virtualEnergy?.requiredToFinish.expected).toBeCloseTo(97, 5);
  });
});
