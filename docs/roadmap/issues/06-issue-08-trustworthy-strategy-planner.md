---
title: "Trustworthy, explainable strategy planner"
issue: 8
issue_url: "https://github.com/ralfboltshauser/apex-lmu/issues/8"
issue_state: "open"
implementation_status: "implemented-locally-release-pending"
plan_order: 6
phase: 1
workstream: "race-strategy"
complexity: "XL"
complexity_score: 5
effort_engineer_days: "25-40"
risk: "high"
confidence: "medium"
depends_on: [7]
soft_dependencies: [6, 13]
blocks: [3]
parallel_with: [13, 6]
source_updated_at: "2026-07-12T12:38:02Z"
source_commit: "9660be5"
last_verified: "2026-07-13"
---

# Issue #8 — trustworthy, explainable strategy planner

## Outcome

Every number on the strategy screen comes from one selected deterministic
candidate. The planner first answers what is feasible, then ranks feasible
plans, explains why one wins, shows what could invalidate it, and labels every
input as measured, manual, configured, assumed, or unavailable. It never renders
credible-looking pit windows, traffic, weather, tyre, driver, or rejoin claims
that are disconnected from the model.

## Implementation evidence — 2026-07-13

The local implementation branch now resolves the screenshot's correctness
failure with a deliberately fuel-only planner:

- `StrategyView` imports the deterministic strategy engine; the hard-coded
  recommendation, scenario times, normalized 60-lap timeline, fuel additions,
  tyre/driver assignments, and P5/P7 rejoin claims are removed.
- Duration, average lap, expected/planning consumption, start fuel, tank,
  reserve, pit-lane loss, and refuel rate are the only active inputs. Each is
  visibly labeled as manual evidence.
- `generateTimedStrategyCandidates` exhaustively couples pit cost back into the
  integer timed-race lap count. Ranking maximizes completed laps before
  comparing modeled time/risk, avoiding the false conclusion that losing a lap
  is a faster strategy.
- Every candidate uses integer-lap stints. Its stop count, stints, timeline,
  fuel additions, exit targets, pit cost, finish fuel, and driver brief all
  derive from the same immutable candidate.
- Weather, traffic/rejoin, tyres, driver rules, and Virtual Energy are displayed
  only in an explicit `Not modeled` list and have no interactive controls.
- A single manual rate no longer manufactures synthetic samples or a confidence
  percentage.
- The issue fixture (240 min, 124.1 s/lap, 4 L/lap, 75 L tank) produces a
  six-stop/seven-stint plan. With the supplied pit/refuel assumptions it
  projects 113 completed laps because the timed solver correctly accounts for
  pit time, rather than the old disconnected 117-lap estimate.

Focused validation passes engine golden/property/invariant tests, renderer
candidate-selection and contradiction regressions, empty-field retention,
EN/DE parity, TypeScript, and a production renderer build. The result was also
inspected at 1600×1100 with no horizontal overflow. Full repository, Windows,
and packaged release gates remain part of the shared release pass.

Live measured rates, VE policy, tyre/service semantics, traffic prediction, and
durable saved plans are future capability slices, not incomplete hidden parts
of this manual fuel model. They remain gated until verified data and rules
exist.

## The issue screenshot is a correctness failure

The concern is larger than spacing. In the screenshot the user entered a
240-minute race, 124.1-second average lap, 4 L/lap, and a 75 L tank. The one real
resource calculation produces:

- 117 projected laps;
- 469.575 L expected including reserve, displayed as 469.6 L;
- six minimum fuel stops, hence at least seven stints.

The selectable cards still claim two or three stops. Their fixed three-stint
timeline covers 60 laps and 209.3 L. The “Track position” card says three stops
but shows only three stints and two pit-table rows; three stops require four
stints.

This split comes directly from the code:

- `StrategyView.tsx:scenarios` hard-codes stop counts, finish times, margins,
  pit positions, and recommendation identity.
- Only the top verdict calls `projectRaceResources`.
- `pitLoss` and weather are editable but affect no output.
- VE affects a whole-race resource projection but constrains no candidate.
- Target fuel, fuel additions, rejoin positions, and scenario times are fixed
  display values.
- The timeline is always normalized to 60 laps.
- Six synthetic samples are manufactured around each manual rate, producing a
  high “confidence” partly from invented dispersion.
- The real `generateStrategyCandidates` engine exists in
  `src/engine/strategy.ts` but is not imported by the view.
- A richer `StintStrategyTimeline` exists but the view implements another fixed
  timeline.
- Empty number fields can throw during render; #7 must land first.

The engine already supports current fuel, tank capacity, conservative fuel
rate, reserve, tyre age/degradation/safety limit, pit loss, refuel rate, and
parallel/sequential service. It does not yet model VE as a per-stint constraint,
weather forecast, driver rules, tyre inventory, multiclass field evolution, or
rejoin position.

There is also a timed-race coupling problem: pit time changes how many laps fit
before the clock reaches zero. Calculating lap count first and adding pit time
afterward is not a complete timed-race strategy model.

## Product decision

Apex should not promise exactly three alternatives. It should present however
many distinct feasible candidates the evidence supports:

1. minimum feasible stops and constraints;
2. the recommended candidate under an explicit objective;
3. materially distinct alternatives and their delta to the recommendation;
4. sensitivity—what input change causes the ranking to flip;
5. unmodeled factors that could invalidate the result.

For the screenshot, the immediate truthful output is a fuel-only baseline of
roughly six stops/seven stints. Exact pit windows and a “track position” plan
cannot be claimed without current/start fuel, conservative consumption, VE
allocation, service rules, and field prediction. Until those exist, hide those
claims or say “Not modeled”.

## Data and view contracts

Introduce explicit types rather than assembling output in JSX:

- `StrategyDraft`: temporary form text and validation state;
- `StrategyInputSnapshot`: complete validated values sent to engines;
- `StrategyAssumption<T>`: value, source, timestamp/sample count, unit, and
  confidence/evidence note;
- `StrategyCandidate`: the one source for card, timeline, stops, and brief;
- `StrategyViewModel`: candidates, recommendation, rejection reasons,
  sensitivities, unsupported factors, and provenance.

Source must be one of `measured`, `manual`, `configured`, `assumed`, or
`unavailable`. A single manual value is not a sample distribution. The user may
provide an explicit spread, or Apex may use measured clean laps; otherwise
confidence must reflect one manual assumption.

Required initial inputs:

- race kind and fixed laps or duration/finish rule;
- elapsed state/current lap progress when planning in-race;
- average and conservative lap-time evidence;
- current/start fuel, tank capacity, expected/conservative consumption, and
  finish reserve;
- pit-lane loss and refuel rate;
- optional tyre/service inputs with explicit provenance;
- class/resource policy, including VE only when validated.

## Implementation plan

### 1. Correctness containment — 2–3 days

- Remove selectable hard-coded candidates, recommendation, margins, pit rows,
  and driver brief values.
- Show one calculated fuel-only feasibility result using existing projections.
- Hide or explicitly mark traffic, rejoin, weather, driver, and tyre outputs as
  not modeled.
- Remove synthetic confidence or relabel a user-configured spread as an
  assumption.
- Add a golden regression fixture matching the issue screenshot.

This slice should ship quickly after #7; it stops Apex from recommending plans
known to contradict its own calculation.

### 2. Separate draft, validated input, and output — 3–5 days

- Use #7's numeric-field state machine; invalid drafts never call an engine.
- Validate cross-field constraints such as current fuel ≤ capacity.
- Build provenance-aware input snapshots and immutable view models.
- Keep the last valid result while an edit is incomplete and explain why
  recalculation is paused.
- Make all EN/DE error and provenance copy structurally matched.

### 3. Wire the fuel-first candidate planner — 6–9 days

- Connect `projectRaceResources` distributions to
  `generateStrategyCandidates` rather than maintaining parallel UI arithmetic.
- Generate integer-lap stint schedules; permit a fractional final projection
  only where the finish model requires it.
- Use current/start fuel, tank, reserve, conservative rate, pit loss, and refuel
  rate for every candidate.
- Enumerate discrete stop patterns and couple pit cost back into timed-race lap
  count through a bounded fixed-point iteration or exhaustive discrete search.
- Return expected and conservative finish fuel, explicit rejection reasons, and
  convergence/failure state.
- Define objective profiles in engine input, not by assigning marketing labels
  to fixed cards.

### 4. Add VE, tyres, and pit-service semantics — 7–12 days

- Model Virtual Energy as a per-stint constraint/allocation, not a whole-race
  percentage. Only enable it after the official bridge/import path exposes a
  verified value and class/event policy.
- Add available tyre sets, compound, current age, maximum safe/useful age, and
  measured or explicitly assumed degradation.
- Verify whether fuel, VE allocation, tyres, repairs, and driver swap are
  parallel or sequential for each supported event/class before calculating
  service time.
- Treat unknown policy as unknown. Never invent a universal ideal pressure,
  degradation rate, or stop procedure.

### 5. Rebuild the UX around explanation — 5–7 days

- Lead with the recommended plan, objective, and concise rationale.
- Present alternatives in a vertical list or comparison table with delta to
  recommendation, stops/stints, pit cost, reserve band, tyre use, modeled risk,
  and confidence.
- Selecting a candidate updates the card, reused `StintStrategyTimeline`, pit
  table, and driver brief from the same object.
- Show cause/effect after edits, for example “4.0 L/lap changes the minimum from
  two to six stops”.
- Separate editable assumptions visually and space alternatives enough to avoid
  accidental selection, but make hierarchy and trade-offs do more work than
  whitespace alone.
- List modeled and unmodeled factors beside the result.

### 6. Add live context and durable plan saving — 3–5 days

- Pass current session/car/track and `liveFuel` from `App.tsx`.
- Preserve manual override and show the source beside every adopted live value.
- Exclude pit/refuel/outlier laps as the existing fuel tracker does.
- Add VE only after its field is verified; `desktop-adapter.ts` currently fills
  virtual energy with zero, which is not evidence.
- Save plans and their full input/provenance schema through #6's durable desktop
  store. Until then, saving remains unavailable rather than weakly persisted.

### 7. Audit against LMU — 4–6 days

- Replay anonymized timed and fixed-distance recordings through current decode.
- Manually audit fuel, extra-lap boundary, stop timing, VE allocation, and
  service duration against LMU for every supported class.
- Include rain, FCY, pit entry/stop/exit, driver swap, disconnect, and finish.
- Do not call the planner race-ready until current real-LMU compatibility and
  the relevant fields are proven.

## Candidate invariants

Automate these as unit/property tests:

- `stints.length === stopCount + 1`;
- `pitStops.length === stopCount`;
- stint distances sum to projected race distance within a documented epsilon;
- every stint satisfies conservative fuel, VE, and tyre constraints;
- fuel/VE targets never exceed capacity/allocation;
- worst-case finish reserve is explicit and non-negative for feasible plans;
- pit markers, rows, summary, and brief all refer to the selected candidate;
- candidates are deterministically ordered with a stable tie-break;
- timed-race iteration converges within a bound or returns a failure, never a
  plausible stale answer;
- unsupported weather/traffic/rejoin inputs cannot affect UI state as if active.

## Acceptance criteria

- The screenshot fixture never presents a two- or three-stop plan as feasible.
- Changing tank, consumption, duration/laps, current fuel, reserve, pit loss, or
  refuel rate changes every dependent output or the irrelevant control is
  absent.
- Weather, traffic, rejoin, driver, tyre, and VE claims appear only when their
  models and inputs are connected.
- A manual single rate cannot manufacture high confidence through fake samples.
- Empty/invalid input never crashes or recalculates as zero.
- Every displayed number traces to the selected candidate and a source.
- The UI states why the recommendation ranks first and what could flip it.
- EN/DE, keyboard-only, screen reader, reduced motion, and 125–200% scaling
  passes succeed.

## Validation matrix

| Layer | Checks |
| --- | --- |
| Engine | Feasibility, ranking, deterministic ties, integer stints, timed convergence, VE, tyres, inventory, service concurrency |
| Properties | Randomized valid tanks/rates/durations; all candidate invariants; no non-finite output |
| Golden cases | Issue screenshot, fixed laps, timed boundary, extra lap, partial current stint, refuel lap, insufficient data |
| Renderer | Every input dependency, invalid draft, candidate selection, source labels, unsupported states, EN/DE |
| Replay | Garage, green, rain, FCY, pit entry/stop/exit, driver swap, disconnect, finish |
| Real Windows/LMU | Each supported class, current header, service semantics, long-session stability |

Run the strategy/fuel engine tests first. Before publication run the complete
repository suite, Windows bridge build, packaged validation, and real-LMU audit.

## Risks and controls

| Risk | Control |
| --- | --- |
| VE not decoded/validated | Capability-gate; never use the current zero placeholder |
| Pit time changes timed distance | Discrete coupled solver with convergence tests |
| Event/class service rules differ | Versioned resource policy verified against recordings |
| Weather has current state but no forecast | Do not activate a weather strategy control without forecast input |
| Traffic/rejoin becomes a hidden guess | Keep it a separate future field-evolution model |
| Tyre targets are car/condition specific | Require measured or licensed versioned evidence |
| UI diverges from engine again | One immutable candidate drives every visual |

## Definition of done

Issue #8 closes after the screenshot regression, candidate invariants, and real
LMU audit all pass; every formerly hard-coded strategy value has been removed or
derived; and no active control remains disconnected from its result.

## Primary references

- [LMU Virtual Energy](https://guide.lemansultimate.com/hc/en-gb/articles/13152376674191-What-is-Virtual-Energy-NRG)
- [LMU multi-function display and pit targets](https://guide.lemansultimate.com/hc/en-gb/articles/13202210967055-Understanding-the-MFD-Multi-Function-Display)
- [LMU limited tyre sets](https://guide.lemansultimate.com/hc/en-gb/articles/13210731599119-What-are-limited-tyres)
- [LMU RealRoad](https://guide.lemansultimate.com/hc/en-gb/articles/13210664727055-What-is-RealRoad-RR)
- [LMU multiclass racing](https://guide.lemansultimate.com/hc/en-gb/articles/13152308004879-What-is-multiclass-racing)
- Repository sources: `src/views/StrategyView.tsx`,
  `src/engine/strategy.ts`, `src/engine/fuel.ts`,
  `src/engine/fuel-plan.ts`, and
  `src/components/visuals/StintStrategyTimeline.tsx`
