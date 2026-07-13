import { describe, expect, it } from 'vitest';
import {
  generateStrategyCandidates,
  generateTimedStrategyCandidates,
  type StrategyInput,
} from './strategy';

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
    expect(oneStop?.pitStops[0].afterLapEquivalentsFromNow).toBe(6);
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

  it('couples pit time back into a timed race and keeps every stint on a lap boundary', () => {
    const result = generateTimedStrategyCandidates({
      durationSeconds: 4 * 60 * 60,
      currentFuelLitres: 75,
      tankCapacityLitres: 75,
      fuel: { mean: 4, conservative: 4 },
      fuelReserveLitres: 0.6,
      averageLapTimeSeconds: 124.1,
      pitLaneLossSeconds: 48.2,
      refuelLitresPerSecond: 2,
      serviceConcurrency: 'parallel',
    });

    expect(result.minimumStops).toBe(6);
    expect(result.recommended?.stopCount).toBe(6);
    expect(result.projectedLapCount).toBeLessThan(117);
    expect(result.recommended?.stints).toHaveLength(7);
    expect(result.recommended?.pitStops).toHaveLength(6);
    expect(result.recommended?.stints.every((stint) => Number.isInteger(stint.lapEquivalents))).toBe(true);
    expect(result.recommended?.stints.reduce((total, stint) => total + stint.lapEquivalents, 0))
      .toBe(result.projectedLapCount);
    expect(result.recommended!.projectedRaceTimeSeconds).toBeGreaterThanOrEqual(4 * 60 * 60);
    expect(result.recommended!.projectedRaceTimeSeconds - 124.1).toBeLessThan(4 * 60 * 60);
  });

  it('orders timed alternatives deterministically and preserves candidate invariants', () => {
    const input = {
      durationSeconds: 90 * 60,
      currentFuelLitres: 60,
      tankCapacityLitres: 60,
      fuel: { mean: 3, conservative: 3.2 },
      fuelReserveLitres: 2,
      averageLapTimeSeconds: 100,
      pitLaneLossSeconds: 35,
      refuelLitresPerSecond: 2.5,
      serviceConcurrency: 'parallel' as const,
    };
    const first = generateTimedStrategyCandidates(input);
    const second = generateTimedStrategyCandidates(input);

    expect(second).toEqual(first);
    expect(first.candidates.length).toBeGreaterThan(1);
    for (const candidate of first.candidates) {
      expect(candidate.stints).toHaveLength(candidate.stopCount + 1);
      expect(candidate.pitStops).toHaveLength(candidate.stopCount);
      expect(candidate.stints.reduce((total, stint) => total + stint.lapEquivalents, 0))
        .toBeGreaterThan(0);
      expect(candidate.pitStops.every((stop) => stop.targetFuelOnExitLitres <= input.tankCapacityLitres)).toBe(true);
    }
  });

  it('preserves fuel and shape invariants across a range of valid manual plans', () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const tank = 40 + seed % 80;
      const reserve = seed % 5;
      const expected = 1.5 + (seed % 12) * 0.2;
      const planning = expected + (seed % 4) * 0.08;
      const result = generateTimedStrategyCandidates({
        durationSeconds: (30 + seed * 7) * 60,
        currentFuelLitres: tank - seed % 9,
        tankCapacityLitres: tank,
        fuel: { mean: expected, conservative: planning },
        fuelReserveLitres: reserve,
        averageLapTimeSeconds: 70 + seed % 100,
        pitLaneLossSeconds: 20 + seed % 50,
        refuelLitresPerSecond: 1 + (seed % 7) * 0.25,
      });

      for (const candidate of result.candidates) {
        expect(candidate.stints).toHaveLength(candidate.stopCount + 1);
        expect(candidate.pitStops).toHaveLength(candidate.stopCount);
        expect(candidate.stints.every((stint) => Number.isInteger(stint.lapEquivalents))).toBe(true);
        expect(candidate.stints.every((stint) => stint.conservativeFuelUseLitres + reserve <= tank + 1e-6)).toBe(true);
        expect(candidate.pitStops.every((stop) => stop.targetFuelOnExitLitres <= tank + 1e-6)).toBe(true);
        expect(Object.values(candidate).filter((value) => typeof value === 'number').every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('fails closed when a full tank cannot cover one whole timed-race lap', () => {
    const result = generateTimedStrategyCandidates({
      durationSeconds: 60 * 60,
      currentFuelLitres: 1,
      tankCapacityLitres: 1,
      fuel: { mean: 10, conservative: 10 },
      fuelReserveLitres: 0.1,
      averageLapTimeSeconds: 60,
      pitLaneLossSeconds: 30,
      refuelLitresPerSecond: 1,
    });
    expect(result.minimumStops).toBe(Number.POSITIVE_INFINITY);
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected[0].reason).toContain('no usable conservative range');
  });
});
