import { describe, expect, it } from 'vitest';
import { generateStrategyCandidates, type StrategyInput } from './strategy';

const baseInput: StrategyInput = {
  remainingLapEquivalents: 20,
  currentRaceLap: 5,
  currentFuelLitres: 20,
  tankCapacityLitres: 50,
  fuel: { mean: 2.5, conservative: 2.7, standardDeviation: 0.08, sampleSize: 12 },
  fuelReserveLitres: 2,
  averageLapTimeSeconds: 100,
  pitLaneLossSeconds: 30,
  refuelLitresPerSecond: 2,
  serviceConcurrency: 'parallel',
  tyres: {
    currentAgeLaps: 2,
    changeTimeSeconds: 18,
    maximumSafeAgeLaps: 15,
    degradationSecondsPerAgeLap: 0.015,
  },
};

describe('strategy generation', () => {
  it('finds the minimum stops from conservative tank range', () => {
    const result = generateStrategyCandidates(baseInput);
    expect(result.minimumStops).toBe(1);
    expect(result.candidates.map((candidate) => candidate.stopCount)).toEqual([1, 2, 3]);
    expect(result.recommended?.stopCount).toBe(1);
  });

  it('shortens the first stint instead of rejecting an asymmetric valid plan', () => {
    const result = generateStrategyCandidates(baseInput);
    const oneStop = result.candidates.find((candidate) => candidate.stopCount === 1);
    expect(oneStop).toBeDefined();
    expect(oneStop?.stints[0].lapEquivalents).toBeLessThan(oneStop?.stints[1].lapEquivalents ?? 0);
    expect(oneStop?.pitStops[0].afterLapEquivalentsFromNow).toBeCloseTo(6.67, 1);
    expect(oneStop?.pitStops[0].fuelToAddLitres).toBeGreaterThan(30);
    expect(oneStop?.pitStops[0].maximumFuelToAddLitres)
      .toBeGreaterThan(oneStop?.pitStops[0].fuelToAddLitres ?? Infinity);
  });

  it('schedules a tyre change when keeping the set would breach maximum safe age', () => {
    const result = generateStrategyCandidates(baseInput);
    const oneStop = result.candidates.find((candidate) => candidate.stopCount === 1);
    expect(oneStop?.pitStops[0].changeTyres).toBe(true);
    expect(oneStop?.projectedPitTimeSeconds).toBeGreaterThan(baseInput.pitLaneLossSeconds);
  });

  it('returns a no-stop candidate when current fuel covers the race', () => {
    const result = generateStrategyCandidates({
      ...baseInput,
      remainingLapEquivalents: 5,
      currentFuelLitres: 30,
      tyres: undefined,
    });
    expect(result.minimumStops).toBe(0);
    expect(result.candidates.some((candidate) => candidate.stopCount === 0)).toBe(true);
  });

  it('moves the first stop earlier when the current tyres are near their safe limit', () => {
    const result = generateStrategyCandidates({
      ...baseInput,
      tyres: { ...baseInput.tyres!, currentAgeLaps: 14, maximumSafeAgeLaps: 15 },
    });
    expect(result.minimumStops).toBe(2);
    expect(result.candidates[0].stints[0].lapEquivalents).toBeLessThanOrEqual(1);
    expect(result.candidates[0].pitStops[0].changeTyres).toBe(true);
  });

  it('treats maximumStops as a hard operational constraint', () => {
    const result = generateStrategyCandidates({ ...baseInput, maximumStops: 0 });
    expect(result.candidates).toHaveLength(0);
    expect(result.minimumStops).toBe(1);
    expect(result.rejected[0].reason).toContain('At least 1');
  });
});
