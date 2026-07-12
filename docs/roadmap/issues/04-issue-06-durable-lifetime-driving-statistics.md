---
title: "Durable lifetime driving statistics"
issue: 6
issue_url: "https://github.com/ralfboltshauser/apex-lmu/issues/6"
issue_state: "open"
implementation_status: "implemented locally; native packaged-Windows upgrade and lifecycle acceptance pending"
plan_order: 4
phase: 1
workstream: "local-data-platform"
complexity: "XL"
complexity_score: 5
effort_engineer_days: "20-30"
risk: "high"
confidence: "high"
depends_on: []
merge_after: [9]
blocks: [4, 3]
parallel_with: [13, 8, "#4 SDK feasibility spike"]
source_updated_at: "2026-07-12T12:33:13Z"
source_commit: "9660be5"
implementation_branch: "codex/complete-open-issues"
last_verified: "2026-07-13"
---

# Issue #6 — durable lifetime driving statistics

## Implementation progress — 2026-07-13

Implemented locally on `codex/complete-open-issues`:

- decoded the SDK's signed `VehicleScoringInfoV01::mControl` byte at packed
  offset 197 and mapped every documented value, while retaining unknown as
  ineligible;
- assigned every live bridge process a UUID and admitted only correlated live
  official shared-memory frames with local-player control;
- added one Electron-main `node:sqlite` owner with an immutable millimetre
  ledger, a 250 ms durable crash accumulator, compact 60-second audit chunks,
  deterministic run/chunk identities, durable rounding carry, strict
  source/session/car/control/gap boundaries, and narrow read/backup IPC;
- added WAL + `synchronous=FULL`, a 250 ms/12-interval commit bound, clean and
  updater-grade flushes, fail-closed storage errors, migration checksums,
  transactional rollback, pre-migration SQLite snapshots with SHA-256
  manifests, and exact preservation/refusal of corrupt or future schemas;
- added bilingual Settings totals, per-model sessions, tracked-since, coverage,
  database health/path, recovery states, and verified backup evidence;
- made raw replay explicitly prove it leaves a fresh lifetime ledger at zero;
- added focused database, bridge, updater, UI, Electron-runtime and soak tests.

Local evidence is green for 16 database fault/accuracy tests, all 51 Electron
service tests, the exact 1 km Electron runtime restart/backup smoke, and a
two-hour 360,001-frame soak that retained exactly 200 km in 120 immutable chunks
and a 135,168-byte database. The issue remains open until the branch runs
natively on hosted Windows and a seeded prior package survives upgrade, forced
termination, and packaged
main-plus-overlay lifecycle validation. Wine or host-Node results are not being
claimed as that final evidence.

## Outcome

Apex records locally tracked physical distance driven by the local player,
groups it by stable raw LMU vehicle identity, and shows total/per-car statistics with a clear
“tracked since” date and data-coverage status. Exactly one main-process owner
ingests live frames. Committed history survives restart, crash recovery,
installer/portable updates, and every schema migration. Updates never replace a
future, corrupt, or failed-migration database with an empty default.

## First-principles guarantee

“Never ever delete data” cannot literally cover failed storage hardware, broken
filesystem flushes, or samples that exist only in RAM at power loss. The plan
turns it into testable guarantees:

- **Committed-history guarantee:** an Apex update, migration, retention policy,
  or ordinary restart never deletes or silently rewrites committed distance.
- **Migration guarantee:** every migration has a verified pre-migration snapshot
  and either commits completely or leaves the original intact.
- **Clean-shutdown RPO:** zero accepted intervals lost after the updater/quit
  flush succeeds.
- **Crash RPO target:** at most 250 ms of accepted live intervals lost; benchmark
  and document the final bound before release.
- **Recovery guarantee:** corrupt/future schemas are opened read-only or refused
  with recovery instructions, never reset.
- **Auditability:** totals are derived from a database-guarded monotonic crash
  accumulator, immutable chunks, and explicit signed corrections—not one
  mutable lifetime number.

## Baseline implementation truth at `9660be5`

Apex has useful scaffolding but no production session persistence:

- `src/core/types.ts` defines `RecordedSession`, laps, stints, and samples.
- `SessionRepository` in `src/core/repositories.ts` stores one versioned JSON
  envelope in browser localStorage, but runtime code never instantiates it.
- Live frames in `App.tsx` update React and the fuel tracker only; no session or
  distance reaches durable storage.
- The local repository overwrites an entire value per save, has no cross-entity
  transaction or pre-migration backup, and may filter/normalize entries before
  persisting a migration.
- If localStorage is unavailable, `resolveLocalStorage()` silently returns
  ephemeral `MemoryStorage`. That behavior is unacceptable for mission-critical
  history.
- `SessionRepository.prune()` deliberately deletes old sessions; lifetime totals
  must not depend on retained high-rate session detail.
- `makeCar()` uses `lmu-car-${mID}` and the participant slot as a car number.
  LMU can reuse that slot; it is not a stable model identity.
- Electron main broadcasts the same bridge frame to every window. Counting in
  renderers would double-count whenever the overlay is open.
- `electron-updater` calls `quitAndInstall()` without an awaited database flush,
  WAL checkpoint, integrity check, or close hook.
- NSIS currently preserves Electron user data (`deleteAppDataOnUninstall: false`)
  and downgrades are disallowed, but preservation of a directory alone is not a
  migration strategy.

The raw `.apexrec` recorder is not this database. It correctly preserves every
raw 50 Hz snapshot for decoder reproduction. Lifetime stats are a small derived
ledger and must not replace, rewrite, or upload recordings.

## Metric semantics

Display this definition in product/help copy:

> Physical distance locally tracked while the local player controlled a car,
> grouped by LMU vehicle name and class, since Apex enabled durable tracking.

Accept an interval only when:

- source is the live official `lmu-shared-memory` stream;
- player vehicle telemetry is available;
- control ownership is the local player, not AI/remote/replay;
- game/session time advances monotonically;
- adjacent samples belong to the same source run, session, and canonical car;
- time gap, speed, lap progress, and optional world-position delta pass
  plausibility checks.

Explicitly exclude:

- generated demo, bridge self-test, and `.apexrec` replay;
- AI, remote driver, replay control, or an unknown controller;
- paused/repeated snapshots, teleports/tows, invalid numbers, or unknown gaps;
- distance from before this feature existed.

Do not backfill from demo fixtures or claim Steam/game lifetime mileage. An
imported recording may be analyzed, but replaying it must never change this
ledger. If a future explicit “import into history” feature exists, it needs a
deduplicated provenance-aware import contract and user confirmation.

## Distance algorithm

The current bridge derives speed magnitude from official local velocity. Add
verified telemetry game elapsed/delta time and scoring control ownership. For
each accepted adjacent sample use trapezoidal integration:

```text
distance_m = ((previous_speed_kph + current_speed_kph) / 2 / 3.6)
             × game_elapsed_delta_seconds
```

Why this primary measure:

- speed magnitude counts reverse movement and spins as physical distance;
- game elapsed time pauses with the simulation and avoids wall-clock jumps;
- lap distance alone has seam/reset/teleport behavior and represents route
  progress rather than all physical movement.

Use lap number/distance and world-position delta as cross-checks. Reject and
record coverage gaps rather than estimating through a tow, reconnect, long
pause, or implausible jump. Never connect the last sample of one car/session/run
to the first sample of another.

Convert each accepted interval to integer `distance_mm` at commit boundaries;
do not repeatedly add binary floating-point totals forever. Store algorithm
version and accepted/rejected sample counts so later correction is explicit.

## Single ingestion owner and source identity

Place ingestion in Electron main, directly on the validated bridge broadcast
path before it fans out to windows. The overlay and main renderer are consumers,
not writers.

Add:

- a unique `sourceRunId` for every bridge child/run;
- stable sequence range and protocol source on committed chunks;
- a local installation UUID;
- a sessionizer using run, track/layout, game version, session time/reset,
  player control, and car identity;
- uniqueness constraints that make a retried chunk idempotent.

The shared mapping does not currently expose a proven globally unique session
ID. Generate a deterministic local session key from the source-run ID and the
observed boundary sequence, and preserve that evidence.

## Vehicle identity

Default grouping must not use the transient participant slot or driver:

```text
identity-v1 | normalized vehicle class | normalized raw LMU vehicle name
```

Store the raw name/class alongside the normalized key. LMU can include team,
number, year, or livery in the vehicle name. Do not heuristically strip those
tokens: create separate identities by default and preserve an alias table for
an explicit future merge. A false split is visible and recoverable; silently
merging two distinct cars corrupts history.

Do not derive manufacturer/model truth by blindly taking the first word of a
display string. Maintain display metadata separately from identity.

## Durable database design

Use a main-process SQLite database at:

```text
<Electron userData>/data/apex.sqlite3
```

The first implementation step must prove the exact SQLite driver inside the
packaged Electron 43 Windows runtime. `node:sqlite` avoids an external native
ABI and exposes a backup API in supported Node versions, but its stability and
API in the bundled Electron Node version must be verified. If it fails the gate,
select and package one explicit SQLite binding and test its Windows ABI; do not
quietly substitute DuckDB or browser localStorage.

Recommended tables:

| Table | Purpose |
| --- | --- |
| `schema_migrations` | Version, name, checksum, source/target app version, applied time |
| `app_metadata` | Installation UUID, schema version, tracking start, algorithm version |
| `vehicle_models` | Deterministic ID, normalized source key, raw/display metadata, first/last seen |
| `vehicle_aliases` | Non-destructive mapping of renamed identities |
| `drive_runs` | Source run, deterministic local session key, LMU/game version, timestamps, final state |
| `distance_chunks` | Immutable vehicle/run/sequence range, integer mm, counts, algorithm, unique key |
| `distance_accumulators` | Small crash-recovery checkpoint sealed at 60 seconds and boundaries |
| `distance_corrections` | Append-only signed corrections with reason and timestamp |

Query totals from durable accumulators, chunks, and corrections. High-rate raw
telemetry remains in
`.apexrec`/session storage; the odometer commits small batches at the validated
crash-RPO cadence.

Use foreign keys, busy timeout, explicit journal/synchronous policy, prepared
statements, one writer, and bounded transactions. Benchmark WAL plus an
appropriately durable sync mode on packaged Windows rather than copying a
generic performance recommendation.

## Migration, backup, and update protocol

### Startup

1. Hold the existing single-instance lock.
2. Open/recover the journal and run quick/integrity checks appropriate to size.
3. Refuse writes for corrupt or future schemas; preserve the file and expose a
   read-only recovery/export state.
4. Before any schema change, stop writers, checkpoint/close, create an exclusive
   snapshot, fsync it, hash it with SHA-256, and write a manifest with source and
   target schema/app versions.
5. Apply ordered checksummed migrations inside one transaction.
6. Run post-migration integrity and domain invariants.
7. Start live ingestion only after all gates pass.

Never implement a catch block that deletes the database and starts empty. Never
run destructive migration cleanup before the replacement data and backup have
been verified.

### Normal quit and updater install

1. Stop accepting frames.
2. Flush/finalize the accumulator.
3. Checkpoint the journal and close the database.
4. Only then permit normal exit or call `quitAndInstall()`.

Give `UpdateManager` an awaited pre-install hook. If it cannot flush/close, do
not launch the installer; report a local error and recovery steps. Portable and
manual installer upgrades must exercise the same next-start migration path.

### User controls

- Provide verified backup/export and database-health actions in Settings.
- An explicit delete/reset action, if retained, requires confirmation and an
  optional export; automatic retention never deletes lifetime totals.
- Diagnostics expose health, schema, backup manifest, and error counts—not
  telemetry, driver names, Steam IDs, or raw paths.

## Implementation plan

### 1. Runtime/storage proof — 1–2 days

- Prove SQLite open, transaction, backup, integrity check, WAL checkpoint, and
  packaged load on Windows Electron.
- Benchmark the crash-RPO commit cadence under 50 Hz input.
- Record the driver/durability decision in `docs/PERSISTENCE.md`.

### 2. Database and recovery service — 4–6 days

- Add an injectable `electron/stats-database.cjs` service.
- Implement schema bootstrap, checked migrations, pre-migration snapshots,
  manifests, corruption/future-version refusal, and read-only queries.
- Add disk-full, permission, truncated journal, failed backup, and interrupted
  migration fault tests.

### 3. Bridge/source/session identity — 3–5 days

- Add run UUID/source metadata at the bridge-manager boundary.
- Verify and decode game elapsed/delta time and scoring control ownership from
  the installed official header.
- Carry source/time/control through `bridge/protocol.go` and renderer types as
  optional additive data with version compatibility.
- Replace transient participant-slot grouping with class + raw-name identity.

### 4. Odometer and exactly-once ledger — 4–6 days

- Implement the main-process sessionizer, interval validator, integration,
  integer conversion, checkpoint/finalize behavior, and unique chunks.
- Flush on car/control/session/source/reconnect/shutdown boundaries.
- Record rejected interval counts and coverage without storing high-rate private
  samples in the stats database.
- Prove duplicate/reordered frames cannot change a committed total.

### 5. Narrow read IPC and statistics UI — 3–4 days

- Expose read-only `getLifetimeStats()` plus explicit backup/health actions.
- Add total and per-car ranking with session count, first/last driven, tracked
  since, and optional coverage caveat to Home or a focused Activity view.
- Add Settings health, location, backup/export, migration status, and recovery.
- Provide truthful empty/error/future-schema states in EN and DE.

### 6. Updater, packaging, and soak proof — 5–7 days

- Wire awaited pre-install/quit flush and failure behavior.
- Build seeded previous-schema packages and test N-2→current upgrades.
- Force process termination during accumulation/migration and verify bounds and
  recovery.
- Run the two-hour 50 Hz soak with main and overlay windows open.

## Acceptance criteria

- A constant 100 km/h for 36 game seconds records 1.000 km within the specified
  integer rounding tolerance.
- Reverse driving counts; paused, AI/remote/replay/self-test/demo, tow/teleport,
  and unknown-gap intervals add zero.
- Car, session, control, source, and reconnect boundaries never bridge samples.
- Opening any number of renderer/overlay windows cannot duplicate totals.
- Retrying a committed sequence range is idempotent.
- Clean shutdown commits every accepted interval; forced crash loss stays
  within the published RPO.
- Totals survive restart, reinstall, portable/manual update, and every supported
  old-schema migration.
- Every migration creates a checksum-verified backup first; failure rolls back
  and preserves original plus backup.
- Future/corrupt databases are never overwritten with defaults.
- Session-detail retention cannot delete lifetime totals.
- UI shows tracked-since, total, per-car distance, and withheld coverage
  honestly; no generated data appears in a real history.
- Stats and backups remain local; support bundles contain health only.

## Validation matrix

| Area | Automated Linux/Node | Packaged Windows | Real LMU/manual |
| --- | --- | --- | --- |
| SQLite | Schema, migrations, rollback, corruption/future version, backup hash, disk-full faults | Driver load, WAL, restart, installer/portable upgrade | Forced kill/recovery |
| Integration | Constant/variable speed, reverse, pause, gaps, boundaries, integer rounding | Known-speed bridge fixture persisted exactly | Pits, tow, AI, driver swap |
| Source filter | Demo/self-test/replay excluded | Live and replay bridge processes | Raw replay never changes total |
| Exactly once | Duplicate/reordered/chunk retry | Main plus overlay windows | Reconnect/bridge restart |
| Update | Pre-install flush success/failure | N-2→current and same-version reinstall | Downloaded update with existing history |
| Performance | Synthetic 50 Hz benchmark | Packaged soak | Two-hour practice/race |
| UI/privacy | DTO, EN/DE, empty/error/future states | Keyboard/scaling, offline | Review database/export copy |

## Risks and controls

| Risk | Control |
| --- | --- |
| SQLite binding fails in packaged Electron | Phase-zero Windows proof and explicit fallback decision |
| Participant ID merges unrelated cars | Model identity from normalized class/name with preserved aliases |
| Multiple renderers double-count | Exactly one Electron-main writer |
| Replay/demo pollutes real totals | Source/control gates plus regression tests |
| Power loss loses in-memory intervals | Small durable accumulator and measured crash RPO |
| Migration normalizer drops records | Immutable ledger, backup, transaction, post-invariants |
| User interprets stats as historic LMU lifetime | Prominent “tracked since” definition |

## Definition of done

Issue #6 closes only after a seeded old packaged build accumulates known mileage,
updates to the new build, migrates with a verified backup, retains the exact
committed total, survives a forced crash within the stated RPO, and excludes a
subsequent raw replay from the total.

## Primary references

- [SQLite atomic commit](https://sqlite.org/atomiccommit.html)
- [SQLite backup API](https://sqlite.org/backup.html)
- [SQLite integrity checking](https://sqlite.org/pragma.html#pragma_integrity_check)
- [Node SQLite API and backup](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- Repository sources: `src/core/types.ts`, `src/core/storage.ts`,
  `src/core/repositories.ts`, `src/core/desktop-adapter.ts`, `src/App.tsx`,
  `electron/main.cjs`, `electron/lmu-bridge.cjs`, `electron/updater.cjs`,
  `bridge/lmu_contract.go`, and `bridge/protocol.go`
