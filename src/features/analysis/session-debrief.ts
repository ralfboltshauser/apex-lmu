import { lapPlaybackAvailable } from './lap-availability';

export type SessionDebriefLapState = 'current' | 'complete' | 'incomplete';
export type SessionDebriefLapQuality = 'clean' | 'limited' | 'ineligible';

/**
 * Structural subset of ApexAnalysisLapSummary used by the debrief engine.
 * Keeping the engine independent of the desktop global makes it usable in
 * renderer tests and other pure analysis contexts without widening its input.
 */
export interface SessionDebriefLapInput {
  readonly id: string;
  readonly number: number;
  readonly state: SessionDebriefLapState;
  readonly quality: SessionDebriefLapQuality;
  readonly reasons: readonly string[];
  readonly lapTimeMs: number | null;
  /** Missing means provenance is unknown and must not be treated as official. */
  readonly timingSource?: 'official' | 'unavailable' | 'legacy-unknown';
  readonly coverage: number;
  /** A retained payload is required before the lap can be used as a trace reference. */
  readonly samplesAvailable: boolean;
  readonly replayable?: boolean;
  readonly referenceEligible?: boolean;
  readonly officialTimePending?: boolean;
}

export interface SessionDebriefInput {
  readonly laps: readonly SessionDebriefLapInput[];
}

export type LapPaceUnavailableReason =
  | 'lap-not-complete'
  | 'official-time-pending'
  | 'official-time-unavailable'
  | 'pace-quality-ineligible';

export type LapPaceComparison =
  | {
      readonly paceEligible: true;
      readonly deltaToBestMs: number;
    }
  | {
      readonly paceEligible: false;
      readonly deltaToBestMs: null;
      readonly reason: LapPaceUnavailableReason;
    };

export interface SessionDebriefLapLedgerEntry {
  readonly id: string;
  readonly number: number | null;
  readonly state: SessionDebriefLapState;
  readonly quality: SessionDebriefLapQuality;
  readonly reasons: readonly string[];
  readonly officialLapTimeMs: number | null;
  readonly coverage: number | null;
  /** Separate from pace eligibility: this controls PB/trace reference use. */
  readonly referenceEligible: boolean;
  readonly paceComparison: LapPaceComparison;
}

export interface SessionDebriefCounts {
  readonly total: number;
  readonly clean: number;
  readonly limited: number;
  readonly ineligible: number;
  readonly officiallyTimed: number;
  readonly untimed: number;
  readonly paceEligible: number;
  readonly referenceEligible: number;
}

export interface SessionDebriefPace {
  readonly paceEligibleLapCount: number;
  readonly bestLapId: string;
  readonly bestLapTimeMs: number;
  readonly medianLapTimeMs: number;
  /** With one pace-eligible lap there is no observed lap-to-lap dispersion. */
  readonly medianAbsoluteDeviationMs: number | null;
}

export interface SessionDebriefCoverage {
  readonly paceEligibleLapCount: number;
  readonly median: number;
  readonly minimum: number;
  readonly maximum: number;
}

export interface SessionDebriefHalfComparison {
  readonly firstHalfLapCount: number;
  readonly secondHalfLapCount: number;
  readonly middleLapExcluded: boolean;
  readonly firstHalfMedianLapTimeMs: number;
  readonly secondHalfMedianLapTimeMs: number;
  /** Positive means the later half's median time was slower. */
  readonly deltaMs: number;
}

export interface SessionDebrief {
  readonly counts: SessionDebriefCounts;
  readonly pace: SessionDebriefPace | null;
  readonly coverage: SessionDebriefCoverage | null;
  readonly halfComparison: SessionDebriefHalfComparison | null;
  readonly laps: readonly SessionDebriefLapLedgerEntry[];
}

interface PreparedLap {
  readonly input: SessionDebriefLapInput;
  readonly inputIndex: number;
  readonly number: number | null;
  readonly officialLapTimeMs: number | null;
  readonly coverage: number | null;
  readonly paceUnavailableReason: LapPaceUnavailableReason | null;
}

const MINIMUM_HALF_COMPARISON_LAPS = 4;

function finitePositive(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function finiteCoverage(value: number): number | null {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function finiteLapNumber(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle];
  const lower = ordered[middle - 1];
  const upper = ordered[middle];
  return lower + (upper - lower) / 2;
}

function officialLapTime(lap: SessionDebriefLapInput): number | null {
  if (lap.state !== 'complete' || lap.officialTimePending === true || lap.timingSource !== 'official') return null;
  return finitePositive(lap.lapTimeMs);
}

function referenceEligible(lap: SessionDebriefLapInput, officialLapTimeMs: number | null): boolean {
  return lapPlaybackAvailable(lap) && lap.referenceEligible === true && officialLapTimeMs !== null;
}

function paceUnavailableReason(
  lap: SessionDebriefLapInput,
  lapTimeMs: number | null,
): LapPaceUnavailableReason | null {
  if (lap.state !== 'complete') return 'lap-not-complete';
  if (lap.officialTimePending === true) return 'official-time-pending';
  if (lapTimeMs === null) return 'official-time-unavailable';
  if (lap.quality === 'ineligible') return 'pace-quality-ineligible';
  return null;
}

function prepareLaps(laps: readonly SessionDebriefLapInput[]): PreparedLap[] {
  return laps
    .map((lap, inputIndex) => {
      const lapTimeMs = officialLapTime(lap);
      return {
        input: lap,
        inputIndex,
        number: finiteLapNumber(lap.number),
        officialLapTimeMs: lapTimeMs,
        coverage: finiteCoverage(lap.coverage),
        paceUnavailableReason: paceUnavailableReason(lap, lapTimeMs),
      };
    })
    .sort((left, right) => {
      if (left.number === null && right.number !== null) return 1;
      if (left.number !== null && right.number === null) return -1;
      if (left.number !== null && right.number !== null && left.number !== right.number) {
        return left.number - right.number;
      }
      return left.inputIndex - right.inputIndex;
    });
}

/**
 * Builds a deterministic factual summary from durable lap summaries.
 *
 * Pace comparisons use completed, finite official times from clean and limited
 * laps. Reference eligibility remains separate because incomplete route data
 * can prevent PB/trace comparison without erasing the measured official time.
 * The function does not infer causes, repair malformed data, or turn an
 * insufficient sample into coaching advice.
 */
export function buildSessionDebrief(session: SessionDebriefInput): SessionDebrief {
  const prepared = prepareLaps(session.laps);
  const paceEligible = prepared.filter(
    (lap): lap is PreparedLap & { readonly officialLapTimeMs: number } => (
      lap.paceUnavailableReason === null && lap.officialLapTimeMs !== null
    ),
  );
  const paceTimes = paceEligible.map((lap) => lap.officialLapTimeMs);
  const bestLapTimeMs = paceTimes.length > 0 ? Math.min(...paceTimes) : null;

  const laps: SessionDebriefLapLedgerEntry[] = prepared.map((lap) => ({
    id: lap.input.id,
    number: lap.number,
    state: lap.input.state,
    quality: lap.input.quality,
    reasons: [...lap.input.reasons],
    officialLapTimeMs: lap.officialLapTimeMs,
    coverage: lap.coverage,
    referenceEligible: referenceEligible(lap.input, lap.officialLapTimeMs),
    paceComparison: lap.paceUnavailableReason === null
      && lap.officialLapTimeMs !== null
      && bestLapTimeMs !== null
      ? {
          paceEligible: true,
          deltaToBestMs: lap.officialLapTimeMs - bestLapTimeMs,
        }
      : {
          paceEligible: false,
          deltaToBestMs: null,
          reason: lap.paceUnavailableReason ?? 'official-time-unavailable',
        },
  }));

  const qualityCounts = prepared.reduce(
    (counts, lap) => ({ ...counts, [lap.input.quality]: counts[lap.input.quality] + 1 }),
    { clean: 0, limited: 0, ineligible: 0 },
  );
  const officiallyTimed = prepared.filter((lap) => lap.officialLapTimeMs !== null).length;

  let pace: SessionDebriefPace | null = null;
  if (bestLapTimeMs !== null) {
    const medianLapTimeMs = median(paceTimes);
    const medianAbsoluteDeviationMs = paceTimes.length >= 2
      ? median(paceTimes.map((lapTimeMs) => Math.abs(lapTimeMs - medianLapTimeMs)))
      : null;
    const bestLap = paceEligible.find((lap) => lap.officialLapTimeMs === bestLapTimeMs);

    if (bestLap) {
      pace = {
        paceEligibleLapCount: paceTimes.length,
        bestLapId: bestLap.input.id,
        bestLapTimeMs,
        medianLapTimeMs,
        medianAbsoluteDeviationMs,
      };
    }
  }

  const paceEligibleCoverage = paceEligible
    .map((lap) => lap.coverage)
    .filter((coverage): coverage is number => coverage !== null);
  const coverage = paceEligibleCoverage.length > 0
    ? {
        paceEligibleLapCount: paceEligibleCoverage.length,
        median: median(paceEligibleCoverage),
        minimum: Math.min(...paceEligibleCoverage),
        maximum: Math.max(...paceEligibleCoverage),
      }
    : null;

  let halfComparison: SessionDebriefHalfComparison | null = null;
  if (paceTimes.length >= MINIMUM_HALF_COMPARISON_LAPS) {
    const halfSize = Math.floor(paceTimes.length / 2);
    const firstHalf = paceTimes.slice(0, halfSize);
    const secondHalf = paceTimes.slice(-halfSize);
    const firstHalfMedianLapTimeMs = median(firstHalf);
    const secondHalfMedianLapTimeMs = median(secondHalf);
    halfComparison = {
      firstHalfLapCount: firstHalf.length,
      secondHalfLapCount: secondHalf.length,
      middleLapExcluded: paceTimes.length % 2 === 1,
      firstHalfMedianLapTimeMs,
      secondHalfMedianLapTimeMs,
      deltaMs: secondHalfMedianLapTimeMs - firstHalfMedianLapTimeMs,
    };
  }

  return {
    counts: {
      total: prepared.length,
      ...qualityCounts,
      officiallyTimed,
      untimed: prepared.length - officiallyTimed,
      paceEligible: paceEligible.length,
      referenceEligible: prepared.filter((lap) => referenceEligible(lap.input, lap.officialLapTimeMs)).length,
    },
    pace,
    coverage,
    halfComparison,
    laps,
  };
}
