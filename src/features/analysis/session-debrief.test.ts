import { describe, expect, it } from 'vitest';
import {
  buildSessionDebrief,
  type SessionDebriefInput,
  type SessionDebriefLapInput,
} from './session-debrief';

function lap(
  number: number,
  lapTimeMs: number | null,
  overrides: Partial<SessionDebriefLapInput> = {},
): SessionDebriefLapInput {
  return {
    id: `lap-${String(number)}`,
    number,
    state: 'complete',
    quality: 'clean',
    reasons: [],
    lapTimeMs,
    timingSource: lapTimeMs === null ? 'unavailable' : 'official',
    coverage: 0.98,
    samplesAvailable: true,
    referenceEligible: true,
    officialTimePending: false,
    ...overrides,
  };
}

function session(laps: readonly SessionDebriefLapInput[]): SessionDebriefInput {
  return { laps };
}

describe('session debrief', () => {
  it('returns explicit empty evidence for a session with no laps', () => {
    expect(buildSessionDebrief(session([]))).toEqual({
      counts: {
        total: 0,
        clean: 0,
        limited: 0,
        ineligible: 0,
        officiallyTimed: 0,
        untimed: 0,
        paceEligible: 0,
        referenceEligible: 0,
      },
      pace: null,
      coverage: null,
      halfComparison: null,
      laps: [],
    });
  });

  it('reports a one-lap best and median while withholding dispersion and half comparison', () => {
    const result = buildSessionDebrief(session([lap(1, 90_000, { coverage: 0.96 })]));

    expect(result.pace).toEqual({
      paceEligibleLapCount: 1,
      bestLapId: 'lap-1',
      bestLapTimeMs: 90_000,
      medianLapTimeMs: 90_000,
      medianAbsoluteDeviationMs: null,
    });
    expect(result.coverage).toEqual({
      paceEligibleLapCount: 1,
      median: 0.96,
      minimum: 0.96,
      maximum: 0.96,
    });
    expect(result.halfComparison).toBeNull();
    expect(result.laps[0].paceComparison).toEqual({ paceEligible: true, deltaToBestMs: 0 });
  });

  it('calculates even and odd medians and median absolute deviation without rounding', () => {
    const even = buildSessionDebrief(session([lap(1, 100_000), lap(2, 102_000)]));
    expect(even.pace).toMatchObject({
      paceEligibleLapCount: 2,
      medianLapTimeMs: 101_000,
      medianAbsoluteDeviationMs: 1_000,
    });
    expect(even.halfComparison).toBeNull();

    const odd = buildSessionDebrief(session([
      lap(1, 100_000),
      lap(2, 101_000),
      lap(3, 105_000),
    ]));
    expect(odd.pace).toMatchObject({
      paceEligibleLapCount: 3,
      medianLapTimeMs: 101_000,
      medianAbsoluteDeviationMs: 1_000,
    });
  });

  it('compares equal chronological halves only when both contain at least two pace-eligible laps', () => {
    const result = buildSessionDebrief(session([
      lap(4, 104_000),
      lap(1, 100_000),
      lap(5, 105_000),
      lap(3, 103_000),
      lap(2, 102_000),
    ]));

    expect(result.laps.map((entry) => entry.number)).toEqual([1, 2, 3, 4, 5]);
    expect(result.halfComparison).toEqual({
      firstHalfLapCount: 2,
      secondHalfLapCount: 2,
      middleLapExcluded: true,
      firstHalfMedianLapTimeMs: 101_000,
      secondHalfMedianLapTimeMs: 104_500,
      deltaMs: 3_500,
    });
  });

  it('retains official pace facts for a recording-shaped cohort of 35 limited coverage laps', () => {
    const limitedLaps = Array.from({ length: 35 }, (_unused, index) => lap(
      index + 1,
      100_000 + index * 100,
      {
        quality: 'limited',
        reasons: ['coverage-low'],
        coverage: 0.75,
        referenceEligible: false,
      },
    ));
    const result = buildSessionDebrief(session(limitedLaps));

    expect(result.counts).toMatchObject({
      limited: 35,
      officiallyTimed: 35,
      paceEligible: 35,
      referenceEligible: 0,
    });
    expect(result.pace).toMatchObject({
      paceEligibleLapCount: 35,
      bestLapTimeMs: 100_000,
      medianLapTimeMs: 101_700,
      medianAbsoluteDeviationMs: 900,
    });
    expect(result.coverage).toEqual({
      paceEligibleLapCount: 35,
      median: 0.75,
      minimum: 0.75,
      maximum: 0.75,
    });
    expect(result.laps.every((entry) => entry.paceComparison.paceEligible)).toBe(true);
    expect(result.laps.every((entry) => entry.referenceEligible === false)).toBe(true);
  });

  it('includes limited official laps in pace while quality excludes ineligible AI and pit laps', () => {
    const result = buildSessionDebrief(session([
      lap(1, 100_000, { coverage: 0.97, referenceEligible: true }),
      lap(2, 101_000, {
        quality: 'limited',
        reasons: ['coverage-low'],
        referenceEligible: false,
        coverage: 0.8,
      }),
      lap(3, 99_000, {
        quality: 'ineligible',
        reasons: ['ai-control'],
        referenceEligible: false,
      }),
      lap(4, 98_000, {
        quality: 'ineligible',
        reasons: ['pit'],
        referenceEligible: false,
      }),
      lap(5, 103_000, { state: 'incomplete', referenceEligible: false }),
      lap(6, null, { quality: 'limited', referenceEligible: false }),
    ]));

    expect(result.counts).toEqual({
      total: 6,
      clean: 2,
      limited: 2,
      ineligible: 2,
      officiallyTimed: 4,
      untimed: 2,
      paceEligible: 2,
      referenceEligible: 1,
    });
    expect(result.pace).toMatchObject({
      paceEligibleLapCount: 2,
      bestLapId: 'lap-1',
      bestLapTimeMs: 100_000,
      medianLapTimeMs: 100_500,
      medianAbsoluteDeviationMs: 500,
    });
    expect(result.coverage).toEqual({
      paceEligibleLapCount: 2,
      median: 0.885,
      minimum: 0.8,
      maximum: 0.97,
    });
    expect(result.laps.map((entry) => entry.paceComparison)).toEqual([
      { paceEligible: true, deltaToBestMs: 0 },
      { paceEligible: true, deltaToBestMs: 1_000 },
      { paceEligible: false, deltaToBestMs: null, reason: 'pace-quality-ineligible' },
      { paceEligible: false, deltaToBestMs: null, reason: 'pace-quality-ineligible' },
      { paceEligible: false, deltaToBestMs: null, reason: 'lap-not-complete' },
      { paceEligible: false, deltaToBestMs: null, reason: 'official-time-unavailable' },
    ]);
    expect(result.laps.map((entry) => entry.referenceEligible)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('excludes a finite duration without official provenance from pace and PB evidence', () => {
    const result = buildSessionDebrief(session([
      lap(1, 90_000, { timingSource: 'legacy-unknown', referenceEligible: true }),
      lap(2, 91_000, { timingSource: 'unavailable', referenceEligible: true }),
    ]));

    expect(result.counts).toMatchObject({
      officiallyTimed: 0,
      untimed: 2,
      paceEligible: 0,
      referenceEligible: 0,
    });
    expect(result.pace).toBeNull();
    expect(result.laps.map((entry) => entry.officialLapTimeMs)).toEqual([null, null]);
    expect(result.laps.map((entry) => entry.paceComparison)).toEqual([
      { paceEligible: false, deltaToBestMs: null, reason: 'official-time-unavailable' },
      { paceEligible: false, deltaToBestMs: null, reason: 'official-time-unavailable' },
    ]);
    expect(result.laps.every((entry) => entry.referenceEligible === false)).toBe(true);
  });

  it('keeps official pace but withholds a trace reference when its sample payload was evicted', () => {
    const result = buildSessionDebrief(session([
      lap(1, 90_000, { samplesAvailable: false, referenceEligible: true }),
    ]));

    expect(result.pace).toMatchObject({ bestLapId: 'lap-1', bestLapTimeMs: 90_000 });
    expect(result.counts).toMatchObject({ paceEligible: 1, referenceEligible: 0 });
    expect(result.laps[0]).toMatchObject({
      officialLapTimeMs: 90_000,
      referenceEligible: false,
      paceComparison: { paceEligible: true, deltaToBestMs: 0 },
    });
  });

  it('keeps official pace but withholds an incomplete overflow payload as a trace reference', () => {
    const result = buildSessionDebrief(session([
      lap(1, 90_000, { replayable: false, referenceEligible: true }),
    ]));

    expect(result.pace).toMatchObject({ bestLapId: 'lap-1', bestLapTimeMs: 90_000 });
    expect(result.counts).toMatchObject({ paceEligible: 1, referenceEligible: 0 });
    expect(result.laps[0]).toMatchObject({
      officialLapTimeMs: 90_000,
      referenceEligible: false,
      paceComparison: { paceEligible: true, deltaToBestMs: 0 },
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1])(
    'suppresses the invalid official lap time %s rather than emitting non-finite metrics',
    (invalidLapTime) => {
      const result = buildSessionDebrief(session([
        lap(Number.NaN, invalidLapTime, { coverage: Number.POSITIVE_INFINITY }),
      ]));

      expect(result.pace).toBeNull();
      expect(result.coverage).toBeNull();
      expect(result.counts).toMatchObject({ officiallyTimed: 0, untimed: 1, paceEligible: 0 });
      expect(result.laps[0]).toMatchObject({
        number: null,
        officialLapTimeMs: null,
        coverage: null,
        paceComparison: {
          paceEligible: false,
          deltaToBestMs: null,
          reason: 'official-time-unavailable',
        },
      });
      const numericValues: number[] = [];
      JSON.stringify(result, (_key, value: unknown) => {
        if (typeof value === 'number') numericValues.push(value);
        return value;
      });
      expect(numericValues.every(Number.isFinite)).toBe(true);
    },
  );

  it('keeps distribution outputs finite for extreme finite lap times', () => {
    const result = buildSessionDebrief(session([
      lap(1, Number.MAX_VALUE),
      lap(2, Number.MAX_VALUE),
    ]));

    expect(result.pace).toMatchObject({
      bestLapTimeMs: Number.MAX_VALUE,
      medianLapTimeMs: Number.MAX_VALUE,
      medianAbsoluteDeviationMs: 0,
    });
    expect(Number.isFinite(result.pace?.medianLapTimeMs)).toBe(true);
  });

  it('is deterministic across input permutations and never mutates frozen input', () => {
    const first = Object.freeze(lap(1, 101_000, { reasons: Object.freeze(['coverage-low']) }));
    const second = Object.freeze(lap(2, 99_000, { reasons: Object.freeze([]) }));
    const third = Object.freeze(lap(3, 100_000, { reasons: Object.freeze([]) }));
    const chronological = Object.freeze([first, second, third]);
    const shuffled = Object.freeze([third, first, second]);
    const chronologicalInput = Object.freeze({ laps: chronological });
    const shuffledInput = Object.freeze({ laps: shuffled });

    const before = JSON.stringify({ chronologicalInput, shuffledInput });
    const firstResult = buildSessionDebrief(chronologicalInput);
    const secondResult = buildSessionDebrief(shuffledInput);

    expect(secondResult).toEqual(firstResult);
    expect(JSON.stringify({ chronologicalInput, shuffledInput })).toBe(before);
    expect(firstResult.laps[0].reasons).not.toBe(first.reasons);
  });
});
