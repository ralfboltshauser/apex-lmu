---
title: "Premium-grade feature program"
issue: 3
issue_url: "https://github.com/ralfboltshauser/apex-lmu/issues/3"
issue_state: "open"
implementation_status: "requires-decomposition"
plan_order: 8
phase: "0 discovery; 3 implementation"
workstream: "product-portfolio"
complexity: "XL"
complexity_kind: "portfolio-epic"
complexity_score: 5
effort_engineer_days: "55-95 incremental after issues #4/#5/#6/#8; 122-200 total portfolio"
risk: "very-high"
confidence: "low"
initial_slice_depends_on: []
depends_on_for_completion: [4, 5, 6, 8, 13]
overlaps: [4, 5, 6, 8]
parallel_with: [9, 7, 13, 6, 8, 4]
source_updated_at: "2026-07-12T12:27:48Z"
research_baseline: "2026-07-12"
source_commit: "9660be5"
last_verified: "2026-07-12"
---

# Issue #3 — premium-grade feature program

## Outcome

Turn the undefined request “implement all premium features” into a dated,
evidence-backed product program. Every approved capability has a user outcome,
data source, provenance rule, local-first fit, licensing decision, dependency,
acceptance criteria, and independently estimable child issue. Apex implements
the valuable local-only subset across staged releases; it does not clone a
competitor, copy proprietary assets/data, or silently add an account/cloud
business model.

## Scope finding

Issue #3 has no body, named benchmark, acceptance criteria, or comments.
“All premium features” is not a finite engineering requirement:

- “premium” differs across products and changes over time;
- some paid features are simply cloud storage/support, not race-engineering
  capability;
- global leaderboards, team sharing, and huge reference libraries require an
  account, server, consent, moderation, and licensing—the opposite of Apex's
  current local-first product truth;
- proprietary setup packs, reference laps, algorithms, binaries, and UI assets
  cannot be copied;
- a capability cannot be truthful if LMU does not expose or Apex has not
  validated its inputs.

Interpret the issue as **premium-grade user value**, not a paid tier. Apex stays
GPL-3.0-or-later, account-free, analytics-free, upload-free, and useful offline.
GO Fast's proprietary `GOFastMemoryMap.dll` is not part of this repository and
is not an implementation dependency.

The discovery slice starts immediately and converts #3 into a tracking epic.
No one should open a monolithic “premium features” branch.

## Dated market evidence

The purpose of competitor research is to identify recurring user jobs, not to
establish a pixel-for-pixel parity contract.

| Official source | Demonstrated user outcomes | Apex interpretation |
| --- | --- | --- |
| [GO Fast pricing/features](https://go-fast.gg/pricing/) | Telemetry, stint tracking, fuel, pro/friend/self comparisons, leaderboards, setup optimization/installation, overlays | Closest taxonomy to the issue wording; separate local analysis from paid data/network effects |
| [GO Fast telemetry](https://go-fast.gg/telemetry-data/) | Segment analysis, on-track brake/min-speed/acceleration indicators, input comparison, detailed telemetry, multi-session comparison, driving line | Strong evidence for #4 plus real ingestion/comparison child epics |
| [GO Fast stint tracking](https://go-fast.gg/stint-tracking/) | Session overview, stint/sector/lap comparison, progress over time | Supports #6 and a real session/stint explorer |
| [RaceLab overlays](https://racelab.app/?anchor=overlays) | Standings, relative, fuel, inputs, track map, radar, weather, layouts, race events and team fuel sharing | Supports #5/#4; team sharing remains outside current architecture |
| [RaceLab layouts](https://docs.racelab.app/docs/faq/layout-vs-overlay/) | Per-screen overlays, saved span-all-screen layouts, lock/unlock, profile auto-switching | Useful operational benchmark for #5, not a design to copy |
| [Garage 61 Pro](https://garage61.net/pro) | Telemetry analysis, long history, advanced filters, tyre/fuel insights, team analysis, live timing | Local history/filtering is feasible; cloud/team corpus is not implicit |
| [Garage 61 usage](https://garage61.net/docs/usage) | Ghost/reference laps, lap filtering, privacy controls, automatic collection | Own/imported references are feasible with provenance; global data needs new product scope |
| [Track Titan plans](https://app.tracktitan.io/pricing) | Unlimited personal telemetry, own theoretical best, automated tips, pro references, training plans, setup access | Deterministic own-data coaching is feasible; “pro” claims require rights and evidence |
| [Track Titan overview](https://www.tracktitan.io/) | Guided root-cause coaching rather than raw-chart-only analysis | Reinforces Apex's “largest loss → action → trace evidence” product flow |

The matrix is a 2026-07-12 baseline. It must be versioned in the planning
record, but implementation priority comes from Apex's users, available LMU
evidence, and product constraints—not from whichever competitor has the longest
feature list.

## Current Apex capability inventory

| Category | Verified status at `3eb622b` | Disposition |
| --- | --- | --- |
| Official LMU live acquisition | Packed out-of-process bridge, raw checks, locking/liveness; current real-game compatibility remains an alpha gate | Foundation; complete required real-LMU validation |
| Raw capture/replay | Append-safe `.apexrec` stores all raw 50 Hz snapshots and replays through current decoder | Keep exactly; debugging/reproduction format, not normalized history |
| Native DuckDB import | Safe read-only schema/channel/event/lap index discovery only | New normalized-ingestion child epic |
| Fuel calculation | Manual plus clean-lap automatic samples and timed-boundary protection | Real capability; integrate with strategy/history |
| Strategy | Deterministic engines exist; view mixes one calculation with contradictory hard-coded plans | Issue #8 |
| Lap comparison/coaching engine | Distance alignment and evidence-scored reasoning exist | Needs real session ingestion and UI wiring |
| Analysis UI | Generated sessions/traces/insights | New real analysis child epic; retain explicit demo mode |
| Track geometry/brake context | Demo shapes and unused fallback component only | Issue #4 |
| Live tyre/brake state | Measured pressure/temperature/wear fields from player telemetry | Historical/comparability analysis still missing |
| Setup installation | Real user-initiated `.svm` backup/atomic replace/rollback | Keep; extend only with proven round-trip schemas |
| Setup optimizer | Deterministic engine exists; UI proposal is generated/hard-coded | New end-to-end child epic |
| Session/stint/lifetime history | Rich types and tested localStorage repositories, no runtime writer | Issue #6 |
| Overlay runtime/editor | Fixed live window; display/editor choices largely disconnected | Issue #5 |
| Release/change communication | Remote ephemeral update notes only | Issue #9 |
| Global/pro leaderboards, friends/teams | No account/server/licensed corpus | Out of scope under current truth |
| Commercial setup/pro-lap library | No redistribution rights | Out of scope unless licensed explicitly |

Critical technical boundaries:

- `AnalyzeView.tsx` consumes demo arrays and does not call the real comparison
  engine.
- `SetupsView.tsx` consumes generated setup/diff content and does not call
  `recommendSetupChanges` end-to-end.
- `electron/telemetry-import.cjs` stops at bounded schema/index inspection.
- `SessionRepository`, `SetupRepository`, and `SettingsRepository` are not wired
  to production runtime.
- Several normalized fields are zero/100 placeholders. Before any new engine
  consumes them, types must represent absence and adapters must capability-gate
  them.
- Raw recording must remain raw; storing only normalized JSON would make decoder
  regressions irreproducible.

## Product selection framework

For every proposed feature, record:

1. **User job:** the decision or learning outcome, not a competitor name.
2. **Input evidence:** exact LMU field/file/manual input, unit, sampling rate,
   game version, and failure mode.
3. **Truth state:** measured, imported, manual, assumed, generated, or
   unavailable.
4. **Local-first fit:** works with network disabled; if not, reject or create a
   separate explicit product decision.
5. **Rights:** code/data/assets/setup/reference licence and redistribution
   permission.
6. **Safety:** consequence of a wrong result at racing speed.
7. **Reuse/dependencies:** existing engine/component and required #4–#9 work.
8. **Value/cost:** frequency and magnitude of user outcome versus engineering
   and validation effort.

Use a transparent score only to order research:

```text
priority = user_value × evidence_readiness × local_first_fit
           ÷ (implementation_cost × validation_risk)
```

A zero in evidence readiness, local-first fit, or rights is a stop condition,
not a reason to invent a value.

## Approved program structure

### Tranche A — trust and shared foundations

These already have concrete issue plans:

- #9 bilingual release/source-of-truth gate;
- #7 reusable safe numeric inputs;
- #6 durable source/session/history ledger;
- #5 real display-targeted overlay runtime;
- #8 coherent deterministic strategy;
- #4 measured geometry and braking context.

They should remain separate releases and retain their own definitions of done.

### Tranche B — normalized real-session ingestion (12–20 days, XL)

- Discover DuckDB schemas by capability rather than assuming one table layout.
- Read channel data in bounded chunks; retain exact units, frequency, source
  file hash, game version, and missing-channel state.
- Normalize session/lap/stint/event metadata into #6's durable model.
- Derive valid, pit, refuel, incomplete, and outlier laps explicitly.
- Feed raw replay through current decode and the same normalized lap assembler,
  without changing lifetime totals.
- Add licensed anonymized fixtures across game versions/classes and fuzz
  malformed, oversized, and truncated input.

Deliver as smaller child issues for schema discovery, channel reader, lap/stint
assembly, and storage integration.

### Tranche C — real session and stint explorer (6–10 days, L)

- List real sessions, laps, stints, sectors, pace progression, consistency,
  conditions, source, and data-quality coverage.
- Filter the user's own laps by car, track/layout, session type, fuel/tyre/weather
  comparability, date, valid/pit status, and personal best.
- Keep lifetime aggregates in #6; do not duplicate or prune them with session
  detail retention.
- Every empty state distinguishes no data, insufficient channels, corrupt
  import, and generated demo.

### Tranche D — real lap comparison and evidence coaching (15–25 days, XL)

- Wire selected real laps into `compareTelemetryLaps`.
- Gate comparisons on car/layout/conditions and expose match quality.
- Align by distance, integrate #4's measured map, and link every conclusion to
  exact channel ranges.
- Add own-best/theoretical-sector references only from the user's data.
- Suppress coaching when evidence is incomplete or non-repeatable.
- Keep natural-language explanation downstream of deterministic results; an LLM
  never generates the strategy or evidence.

### Tranche E — tyre and brake analysis (8–14 days, L)

- Per-lap/stint pressure, surface/carcass temperature, wear, and brake-temperature
  trends with locations at peak and condition/source labels.
- Compare only similar compound, fuel, weather, track, and game-version data.
- Add target/diagnostic advice only from measured or explicitly licensed
  car-specific evidence. No universal “ideal pressure”.
- Do not write game settings automatically.

### Tranche F — setup optimizer end-to-end (15–25 days, XL)

- Discover and version supported `.svm` schemas per car/game version.
- Parse known parameters while preserving unknown bytes/fields through
  round-trip.
- Connect measured symptom/evidence to `recommendSetupChanges`.
- Change at most one or two related values, state the trade-off, create a child
  revision, validate the output, back up, and install only after explicit user
  action.
- Prove rollback, read-only/collision behavior, and unchanged unknown fields.

### Tranche G — personal references and portable evidence bundles (7–12 days, L)

- Save personal bests and allow manually imported reference laps with schema,
  checksum, source, licence, and units.
- Export bounded CSV/JSON/portable analysis bundles after a privacy warning.
- Never call an imported reference “professional” without verifiable rights.
- No automatic sharing or upload.

### Tranche H — provenance and capability hardening (4–7 days, M)

- Centralize measured/imported/manual/assumed/generated/unavailable badges.
- Remove placeholder values from decision paths.
- Maintain a per-game/header version capability matrix.
- Audit every recommendation back to source, unit, sample range, algorithm
  version, and confidence explanation.

The remaining Tranche B–H estimate is roughly 55–95 engineer-days after reuse
and overlap. Adding the concrete #4/#5/#6/#8 plans gives an overall #3 program
envelope of approximately 122–200 engineer-days. That is why #3 must be a
tracking epic, not one feature branch or release.

## Explicit non-goals under current product truth

- Account, subscription, telemetry upload, advertising, or analytics.
- Global leaderboards, friends/team cloud collaboration, or shared live timing.
- Copying GO Fast/RaceLab/Garage 61/Track Titan code, UI, binaries, algorithms,
  branding, setup packs, or reference data.
- Bundling GO Fast's proprietary DLL or scraping undocumented process memory.
- Claiming a generated/demo trace is a player's measurement.
- Claiming “AI coaching” where advice is not backed by deterministic evidence.
- Universal tyre/setup targets without car/condition/version provenance.
- Automatic setup or game-file writes outside the existing narrow,
  user-initiated, backed-up workflow.

If any of these becomes desired, it needs a separate product/architecture/legal
decision that explicitly changes current scope; issue #3 does not authorize it.

## Execution and child-issue protocol

1. Freeze the dated capability matrix and link it from #3.
2. Mark every row `built`, `partial`, `linked issue`, `approved child issue`,
   `research blocked`, or `out of scope`.
3. Create child issues with one testable outcome, dependency, data contract,
   EN/DE scope, validation fixtures, and effort range.
4. Land #9 before feature releases; use distinct versioned releases for data,
   overlay, strategy, and bridge changes.
5. Do not begin UI implementation before the data/provenance contract passes a
   fixture.
6. Re-audit competitor claims only when prioritizing a tranche; do not let a
   moving pricing page redefine completion silently.
7. Close the tracking epic only when every approved row is shipped or explicitly
   rejected with a recorded reason.

## Program acceptance criteria

- “All premium features” no longer appears as an unbounded completion test.
- Every approved capability has a child issue, owner-ready dependencies,
  source/provenance contract, complexity, acceptance criteria, and validation.
- Every real screen distinguishes measured, imported, manual, assumed,
  generated, and unavailable data.
- Unsupported fields are absent/unknown, not zero or plausible defaults.
- A real anonymized DuckDB/raw fixture deterministically produces sessions,
  laps, stints, and trace evidence.
- Real comparison conclusions link to exact channels and distances.
- Tyre/setup advice names its car, compound/parameter schema, conditions, game
  version, and evidence source.
- Setup output preserves unknown fields, creates a backup, and rolls back.
- Portable references contain schema, checksum, source, rights, and unit data.
- Networking can be disabled without losing core functionality.
- No private/proprietary data or competitor asset enters the repository.
- EN/DE, accessibility, migration, performance, Windows package, and real-LMU
  gates pass for every applicable child.

## Program validation

- Versioned DuckDB/shared-memory fixtures across supported game/header versions.
- Parser fuzzing and malformed/oversized/truncated input tests.
- Unit/property/golden tests for aggregation, alignment, confidence, strategy,
  and setup round-trip.
- Migration tests from every previous desktop schema with interruption,
  rollback, backup hash, and future/corrupt database refusal.
- Multi-hour memory/CPU/storage tests with renderer and overlay open.
- Privacy tests proving no automatic network traffic and no telemetry/setup
  content in diagnostics.
- Real Windows sessions across classes, garage, green, rain, FCY, pits, driver
  swap, disconnect, and finish.
- Full repository validation and release invariants for each tranche.

## Primary risks

| Risk | Response |
| --- | --- |
| Scope moves with competitors | Freeze dated outcomes; Apex child issues define completion |
| LMU channels vary by version/class | Capability discovery, optional fields, versioned fixtures |
| Browser storage cannot hold real sessions | #6 main-process durable database |
| Reference/setup content lacks rights | Personal/licensed imports only with provenance |
| Placeholder normalized values enter engines | Capability hardening before consumption |
| High-rate telemetry overwhelms memory/storage | Bounded streaming, chunking, indexing, retention separate from lifetime ledger |
| “AI” explanation becomes ungrounded | Deterministic result/evidence first; suppress when insufficient |
| One huge release becomes impossible to audit | Child issues and staged versioned releases |

## Definition of done

Issue #3 is complete only when the dated matrix has no unowned approved row:
each is either shipped through its child issue and validation gates or explicitly
rejected with a durable product/data/licensing reason. Competitor parity by
feature count is not a valid close condition.

## Primary references

- [GO Fast feature/pricing matrix](https://go-fast.gg/pricing/)
- [GO Fast telemetry outcomes](https://go-fast.gg/telemetry-data/)
- [GO Fast stint tracking](https://go-fast.gg/stint-tracking/)
- [RaceLab overlay capabilities](https://racelab.app/?anchor=overlays)
- [Garage 61 Pro capabilities](https://garage61.net/pro)
- [Track Titan plans](https://app.tracktitan.io/pricing)
- [Official LMU native telemetry recording](https://guide.lemansultimate.com/hc/en-gb/articles/14524956311695-Telemetry-Recording)
- Repository sources: `README.md`, `docs/PRODUCT.md`, `docs/ROADMAP.md`,
  `docs/ARCHITECTURE.md`, `docs/RECORDINGS.md`, `src/views`, `src/engine`,
  `src/core`, `electron/telemetry-import.cjs`, and `bridge/recording.go`
