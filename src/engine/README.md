# Race-engineering core

Pure, deterministic TypeScript algorithms. These modules have no browser, Node,
React, storage, or network dependency, so they can run in the desktop process,
a worker, tests, or a future CLI.

Import public APIs from `src/engine/index.ts`.

## Resource forecast

```ts
const forecast = projectRaceResources({
  race: {
    kind: 'timed',
    durationSeconds: 3600,
    elapsedSeconds: 1800,
    currentLapProgress: 0.4,
    lapTimeSamplesSeconds: recentCleanLapTimes,
  },
  fuel: {
    name: 'Fuel',
    unit: 'L',
    currentAmount: 48,
    reserveAmount: 1.5,
    perLapSamples: recentFuelUse,
  },
  virtualEnergy: {
    name: 'Virtual Energy',
    unit: '%',
    currentAmount: 72,
    reserveAmount: 1,
    perLapSamples: recentVeUse,
  },
});
```

The forecast keeps three ideas separate:

- expected consumption;
- lap-to-lap process spread plus uncertainty in the estimated mean;
- uncertainty in how many laps a timed race will run.

The conservative result is deliberately allowed to include another lap when a
plausible faster run reaches the nominal finishing line before the clock hits
zero. Consumers should show the probability and confidence, not only the worst
number.

## Strategy candidates

Pass `forecast.fuel.perLap` directly as the `fuel` rate to
`generateStrategyCandidates`. Strategies respect conservative tank range, a
short first stint, maximum tyre age, tyre degradation, refuel rate, and parallel
or sequential service.

Pit stops expose:

- the expected fuel addition;
- the maximum addition under conservative consumption;
- the target fuel level on pit exit.

At runtime the target is the stable instruction; actual fuel added depends on
what remains when the car stops.

## Telemetry comparison

`compareTelemetryLaps` aligns samples by distance rather than timestamp. Corner
definitions should start before braking, contain the apex, and end after the
acceleration zone. The result provides phase deltas, event metrics, prioritized
insights, direct evidence, estimated opportunity, and confidence.

Positive time deltas always mean the subject is slower than the reference.
Missing or dissimilar conditions reduce confidence instead of being silently
treated as equivalent.

## Setup recommendations

`recommendSetupChanges` maps a repeatable symptom, phase, speed band, available
car settings, and optional telemetry evidence into small experiments. Advice is
not presented as an optimum. Each result includes the expected effect, likely
tradeoff, confidence, risk, a one-variable experiment, and rollback guidance.

The rule set suppresses a rearward brake-bias suggestion when rear-locking
evidence is already present. Add future safety exclusions in the same style.

## Invariants

- Inputs with impossible ranges or non-finite values throw immediately.
- Algorithms never mutate input arrays or objects.
- Ordering and text output are deterministic.
- Confidence is in the inclusive range `0..1`.
- Units remain explicit at API boundaries.
- A conservative consumption rate must never be lower than its mean.
