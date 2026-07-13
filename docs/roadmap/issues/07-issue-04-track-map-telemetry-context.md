---
title: "Measured track map and braking context"
issue: 4
issue_url: "https://github.com/ralfboltshauser/apex-lmu/issues/4"
issue_state: "open"
implementation_status: "implemented-locally-native-windows-pending"
plan_order: 7
phase: 2
workstream: "telemetry-analysis-and-geometry"
complexity: "XL"
complexity_score: 5
effort_engineer_days: "12-20 after issue #6; 18-28 standalone"
risk: "high"
confidence: "medium"
depends_on: [6, 13]
parallelizable_spike: "official SDK coordinate/geometry proof"
blocks: [3]
parallel_with: []
source_updated_at: "2026-07-12T12:28:17Z"
source_commit: "9660be5"
last_verified: "2026-07-13"
---

# Issue #4 — measured track map and braking context

## Outcome

Measured sessions show a locally reconstructed route from official LMU world
positions. A selected real lap colors the places where the local player braked,
marks application/release, and synchronizes the map, charts, and selected
insight by lap distance. Live mode learns the route locally and places cars only
from measured coordinates. Until enough geometry exists, Apex shows a partial
route or honest distance strip—never a generic/demo circuit presented as real.

## Implementation evidence — 2026-07-13

The local implementation branch now carries a measured live and analysis path:

- The packed bridge decodes telemetry `mElapsedTime`, `mLapStartET`, and `mPos`
  plus scoring `mPos` using explicit little-endian offsets, bounds, and finite
  checks. The fields are additive/optional through the normalized contract.
- The approved real recording contributes 18,035 finite position frames. World
  displacement divided by speed integrated over game time is 0.99988 / 1.00001
  / 1.00007 at the 5th/median/95th percentiles. This independently proves the
  coordinate/time interpretation rather than accepting merely plausible axes.
- That recording reconstructs two clean laps, 354 robust 12 m route bins,
  99.16% coverage, geometry fingerprint `34f2b542`, and 11 stable braking zones.
- Electron main owns a bounded live-session store with stable logical session
  and lap IDs. Bridge waiting/disconnect/run changes cannot erase compatible
  completed laps; genuine track/car/time/lap-counter resets archive a session.
- The store deduplicates repeated LMU game-time snapshots, records explicit
  quality reasons for control, pit, gap, teleport, and invalid-sample evidence,
  and keeps incomplete or ineligible laps visible without using them as clean
  references. Finalized traces are compacted and old payload eviction preserves
  lap summaries.
- Braking uses application/release hysteresis, minimum duration/sample count,
  chatter-gap merging, isolated-spike rejection, and retains application, peak,
  release, duration, entry/minimum/exit speed, and sample count.
- Measured Live renders the locally reconstructed driven line, exact measured
  player/opponent positions, coverage state, heat segments, and a textual brake
  list. No opponent coordinate means no marker.
- Measured Analysis lists the current runtime's sessions and every completed,
  incomplete, and current lap. It defaults to the latest loaded clean completed
  lap instead of the final partial lap, loads the selected trace on demand, and
  exposes stable quality/reason labels. Selected brake evidence, map segment,
  distance cursor, speed trace, and brake trace remain synchronized; zone rows
  are keyboard buttons with complete textual evidence.
- `CircuitTrackMap` no longer silently substitutes its generated demo path when
  an explicit measured point set is empty. Measured marker and segment lookup
  preserve LMU lap distance rather than SVG arc-length percentage.

The normal product keeps this high-rate analysis in bounded Electron-main
memory so a renderer reload does not clear it, and reconstructs it
from an explicitly chosen private `.apexrec` when replayed. It does not silently
persist or upload high-rate position/pedal history. Durable automatic history
would require a separate user-facing privacy/retention decision; the raw
recorder remains the lossless opt-in path.

Focused and full local gates pass: packed offset/rejection tests, geometry and
brake engine tests, renderer safety/interaction tests, all 18,039 real frames,
110 renderer tests, 54 desktop tests, scripts, Go, Electron SQLite, production
build, EN/DE, TypeScript, and Windows cross-compile. The native source/package
Windows E2E now requires 99% route coverage and all 11 zones in both views; the
hosted run and an installed-header diff remain release gates.

## Current implementation truth

Apex visually contains circuit shapes, but none answers this issue for measured
data:

- The real measured branch of `LiveView.tsx` has no map.
- `LiveCircuit` is a hard-coded generated SVG used only by the demo branch.
- Home's Spa/Le Mans outlines are also hard-coded demo content.
- `CircuitTrackMap.tsx` is reusable but currently unused. If given too few
  points, it silently substitutes `defaultTrackPoints`, which is unsafe for a
  measured screen.
- That component places progress along rendered 2D polyline length rather than
  the LMU lap-distance coordinate, so markers can drift on irregular or
  elevated routes.
- `AnalyzeView.tsx` explicitly uses `demoSessions`, `lapTrace`,
  `referenceTrace`, and generated insights; DuckDB/live samples are not wired.
- `src/engine/telemetry.ts` can identify brake start/release and compare laps by
  distance, but no live/import adapter creates a real `TelemetryLap`.
- No authoritative corner catalog/names exist in the repository.

The bridge already exposes scoring `lapDistanceM`, but leaves potentially
required official fields undecoded:

- player telemetry game elapsed time and lap-start time;
- player world `mPos`—the candidate packed vector immediately before the local
  velocity currently decoded at player base `+184`;
- scoring control owner and scoring world position for opponents.

`desktop-adapter.ts` currently fills lap elapsed, axes, acceleration,
orientation, and other unavailable motion fields with zero. Those placeholders
cannot be used for geometry or analysis.

Historical analysis also needs durable session/lap samples. Issue #6 supplies
the single writer, source/session identity, migrations, and storage substrate.
The official-offset feasibility spike can run in parallel, but the completed
feature should not create a second persistence system.

## First-principles feasibility

If the installed official LMU header confirms the candidate fields, each local
player sample can provide:

```text
(world_x_m, world_z_m, lap_distance_m, brake_0_to_1,
 game_elapsed_s, lap_start_s, control_owner)
```

That is sufficient to draw the actual driven trajectory and locate braking
without downloading a commercial/copyrighted map. Scoring coordinates can
place opponents even though their pedal inputs are unavailable.

What it does **not** provide is a surveyed road-edge polygon or authoritative
corner name/boundary. Product copy should say “locally reconstructed route” or
“driven line”. Do not claim exact track limits, racing-line optimality, or named
corners until an appropriately licensed and versioned source exists.

The installed `Support/SharedMemoryInterface` header and a current real
`.apexrec` are the release authority. A remembered rFactor layout or public copy
may guide the spike but cannot approve packed offsets.

## Domain contract changes

Add optional measured fields rather than default zeroes:

```ts
interface WorldPositionM { x: number; y: number; z: number }

interface TelemetrySample {
  // existing fields
  worldPositionM?: WorldPositionM
  gameElapsedMs?: number
  lapElapsedMs?: number
  controlOwner?: 'local-player' | 'ai' | 'remote' | 'replay' | 'unknown'
}
```

The bridge must bounds-check every finite coordinate and time using explicit
packed offsets. Extend the protocol additively with a declared compatible
version, update self-test/Windows fixtures, and keep older recordings usable.
Because `.apexrec` preserves raw snapshots, replay through the current decoder
can recover newly decoded position fields from old recordings when the bytes
contain them.

Track/layout identity should combine normalized name, explicit layout when
available, verified length, game/header version, and a geometry fingerprint.
A name slug alone can collide across layouts.

## Session and lap assembly

Build on #6's source/session pipeline:

- deduplicate snapshots by run/sequence/game time;
- detect session boundaries from source run, session identity, track/layout,
  elapsed resets, and game state;
- detect lap boundaries with lap number, lap-start time, and distance wrap;
- preserve incomplete/out/pit laps as incomplete instead of closing a fake lap;
- split gaps, teleports, control changes, reconnects, and time resets;
- retain measured player samples for analysis and derive a reduced geometry
  cache separately;
- never let demo, self-test, or replay mutate live history automatically.

Convert the assembled player lap into the existing `TelemetryLap` contract with
real lap-distance/time, speed, throttle, brake, steering, and optional lateral
position. Keep raw provenance and quality flags beside it.

## Route reconstruction

### Analysis route

For a selected lap, render its ordered X/Z world-position samples directly
after rejecting invalid jumps. Preserve lap distance on every point; the map
cursor uses distance lookup, not SVG arc-length percentage.

### Reusable live route

- Ignore pit-lane/invalid/incomplete samples for the main route model.
- Bin accepted samples by lap distance and compute a median/robust center point
  over multiple clean laps.
- Smooth only enough to remove sample noise; do not move braking markers off
  their original measured points.
- Treat the start/finish seam circularly.
- Compute a geometry fingerprint and never reuse a cache for a conflicting
  layout/length.
- Before a full lap, draw only learned segments and label progress. A linear
  distance strip is an acceptable fallback; the demo outline is not.

For presentation, discard elevation only in the projection, then translate,
rotate, and uniformly scale into the SVG viewport while preserving aspect ratio.
Use lap distance to disambiguate self-crossing tracks.

## Braking-zone model

Detect brake zones over measured samples with hysteresis:

- enter when brake exceeds an application threshold for a minimum duration or
  sample count;
- exit only below a lower release threshold;
- merge very short chatter gaps;
- reject isolated spikes;
- retain application distance, peak pressure/distance, release distance, end,
  duration, entry/minimum/exit speed, and source sample range.

Thresholds are analysis parameters with tests, not claims about ideal driving.
Resample comparison laps to a common metre-based distance grid. Never align by
array index, capture wall time, or SVG position.

## Interaction design

### Analysis

- The map and telemetry chart share one distance selection.
- Hover/focus/click on a brake zone highlights the same distance range on speed,
  brake, and throttle traces.
- Selecting an insight moves both cursors and explains the delta using measured
  values.
- Overlay comparison laps only when track/layout coordinate systems match.
- Provide a textual list—“brake applied at 4,218 m, peak 86%, released at
  4,301 m”—for keyboard and screen-reader use.

### Live

- Show a “learning route” state until coverage is sufficient.
- Place the player from telemetry and opponents from scoring world positions.
- If opponent coordinates are unavailable or stale, omit the marker rather than
  derive a fake position from a demo path.
- The map must not encourage prolonged attention while driving; default detail
  stays minimal.

## Implementation plan

### 1. Official SDK and recording proof — 2–3 days

- Diff the current installed official headers against the pinned contract.
- Verify telemetry/scoring world position, axes, units, time, lap start, and
  control enumeration in garage, green, pits, AI/replay, disconnect, and finish.
- Capture licensed anonymized raw fixtures with known path/brake events.
- Stop if the fields are absent/different; use a distance strip rather than
  guessing offsets.

### 2. Bridge and normalized contract — 2–4 days

- Decode bounded finite positions/times/control with explicit offsets.
- Add optional player/opponent/source fields to protocol and TypeScript guards.
- Remove zero placeholders from any new decision path.
- Extend Go decoder, raw-replay, self-test, and complete Win32 mapping fixtures.

### 3. Session/lap assembler — 3–5 days

- Consume #6's durable ingestion and source identity.
- Implement boundaries, dedupe, gaps, pits, control changes, invalid/incomplete
  laps, and `TelemetryLap` conversion.
- Store provenance/quality and keep geometry caches derived/rebuildable.

### 4. Geometry and braking engine — 4–6 days

- Implement X/Z projection, lap-distance bins, circular seam, robust aggregation,
  teleport/outlier rejection, and geometry fingerprints.
- Implement brake hysteresis, zone metrics, comparison-grid resampling, and
  bidirectional distance lookup.
- Property-test translation/rotation/scale invariance and self-crossing routes.

### 5. Refactor `CircuitTrackMap` and live integration — 3–5 days

- Replace the progress-only/fallback API with measured points that retain lap
  distance and quality.
- Add explicit empty, learning, partial, complete, stale, and demo modes.
- Remove automatic demo geometry from measured mode.
- Use the component in measured Live with minimal car markers.

### 6. Real analysis integration — 4–6 days

- Add durable real session/lap selectors beside an explicitly separate demo
  mode.
- Render measured braking heat segments and application/release markers.
- Synchronize map/chart/insight selection and add the textual zone list.
- Gate comparison on layout/quality and explain why incompatible laps cannot be
  overlaid.

### 7. Windows, real-LMU, visual, and accessibility proof — 3–5 days

- Validate multiple tracks/layouts, pit routes, incomplete laps, reconnects,
  rain, FCY, driver/control changes, and record/replay equivalence.
- Complete keyboard, screen-reader, 125–200% scaling, ultrawide, color-vision,
  and reduced-motion passes.
- Measure long-session geometry memory/CPU bounds.

## Acceptance criteria

- A selected real lap displays its measured driven shape, never a hard-coded or
  demo circuit.
- Brake color and application/release markers use the same sample's measured
  world position, brake input, and lap distance.
- Map and chart cursors agree within one documented resampling bin.
- Hysteresis produces stable zones under threshold noise and rejects spikes.
- Incomplete laps remain visibly partial; pit/out-laps cannot deform the cached
  main route.
- Conflicting layouts never share geometry.
- Before geometry exists, the UI says it is learning or shows a distance strip.
- Replay through the current decoder reconstructs the same map/zone output from
  the same raw recording.
- Opponent markers use measured scoring coordinates or are absent. Only local
  player braking is shown.
- Accessibility exposes every highlighted zone textually and by keyboard.
- No track/telemetry data leaves the computer.

## Validation matrix

| Area | Linux/unit | Windows fixture/package | Real LMU/manual |
| --- | --- | --- | --- |
| Packed fields | Offsets, bounds/finite failures, optional compatibility | Named mapping, NDJSON, record/replay, cross-compile | Installed-header diff and axes/units |
| Session/laps | Boundaries, dedupe, gaps, pits, incomplete/control change | Fixture lifecycle/reconnect | Garage, pits, AI/replay, finish |
| Geometry | X/Z transform, bins, seam, outliers, fingerprints, self-crossing | Deterministic world path | Several tracks/layouts and pit lanes |
| Braking | Hysteresis, noise, resampling, cursor lookup | Known brake zones | Visual check against driven points |
| UI | Modes, cross-selection, incompatible laps, EN/DE/a11y | Packaged scaling/ultrawide | Real workflow review |
| Performance | Large-lap benchmark | 50 Hz packaged soak | Two-hour session |

Bridge work must run the focused Go tests, Windows cross-compile, and complete
real Windows fixture path. Linux unit tests alone cannot approve the offsets.

## Risks and controls

| Risk | Control |
| --- | --- |
| Remembered/public SDK layout is wrong | Installed official header plus real raw fixture is the release gate |
| A driven line is mistaken for track edges | Precise product terminology and no polygon claim |
| Demo fallback contaminates real UI | Explicit source modes; measured mode has no default geometry |
| Pit/off-track samples deform route | Quality flags, pit exclusion, robust distance bins |
| Position marker drifts from charts | Preserve LMU lap distance on every geometry point |
| Different layouts collide | Layout/length/game-version identity plus geometry fingerprint |
| High-rate points exhaust memory | Durable chunking and rebuildable reduced geometry cache |

## Definition of done

Issue #4 closes only after an anonymized real recording replays into the same
measured route and braking zones, map/chart distance agreement is automated,
pit/incomplete laps cannot poison the route, and the installed-header plus
Win32 validation path passes.

## Primary references

- [LMU native DuckDB telemetry recording](https://guide.lemansultimate.com/hc/en-gb/articles/14524956311695-Telemetry-Recording)
- [LMU update adding the official shared-memory header](https://guide.lemansultimate.com/hc/en-gb/articles/14556121957775-V1-2-Update-2)
- [Garage 61's rationale for accurate track maps](https://garage61.net/whatsnew/202302181043)
- Repository sources: `bridge/lmu_contract.go`, `bridge/protocol.go`,
  `bridge/recording.go`, `src/core/desktop-adapter.ts`,
  `src/engine/telemetry.ts`, `src/components/visuals/CircuitTrackMap.tsx`,
  `src/views/LiveView.tsx`, and `src/views/AnalyzeView.tsx`
