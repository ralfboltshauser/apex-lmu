# Architecture

## Design constraints

1. Losing the UI must never affect LMU.
2. Raw units are explicit at every boundary.
3. Unsupported fields degrade to `unknown`, never plausible-looking fiction.
4. Every recommendation carries evidence and confidence.
5. Writes are narrow, reversible and user initiated.
6. The application remains useful with networking disabled.

## Processes

### Renderer

React renders the app and the separate overlay entry point. It has no Node
access. `contextIsolation`, sandboxing, and disabled `nodeIntegration` keep game
files and native services behind a small preload API.

### Electron main

The main process owns file dialogs, DuckDB read-only inspection, guarded setup
copying, bridge lifecycle and the transparent overlay window. It also owns the
bounded, in-memory live-analysis session store and the durable normalized lap
database. Bridge statuses may interrupt a session but cannot erase its completed
laps, and genuine track/car/time boundaries archive the old session instead of
replacing it. The renderer receives compact session/lap summaries and requests
one lap payload at a time through narrow IPC; renderer reloads therefore do not
discard active or committed driving history.

Raw recording playback has two intentionally separate orchestrations. Normal
**Replay** temporarily replaces the live bridge and feeds the measured UI and
overlay, including transient Analysis for the current app run, without writing
durable history or lifetime statistics. Explicit **Import into Analysis** hashes
the selected file locally, runs a strict replay without captured-time delays
through the current decoder, and routes only its correlated messages to a dedicated session store
and private staging database. Imported frames never reach the live renderer,
overlay, fuel calibration or lifetime-statistics writer. Only complete validated
replay can atomically merge staging into the durable analysis database;
cancellation or any fault exposes no partial session.
`OverlayManager`
owns display enumeration, validated configuration persistence, hot-plug
fallback, renderer readiness and window lifecycle. External links open in the
operating-system browser; renderer-created windows are denied and unexpected
Chromium permission requests are denied by default.

### LMU bridge

The bridge is a static Windows executable with no administrator requirement.
It maps LMU's official shared memory, normalizes obvious units such as Kelvin
and bar, and writes NDJSON. It retries while LMU is closed and exits cleanly
when Electron stops it.

## Domain boundary

All live, replay and simulated sources implement `TelemetryAdapter`. UI code
consumes `TelemetryFrame`, never transport-specific memory layouts. This lets a
captured recording reproduce a bug without LMU running. Import reconstruction
uses that same current decoder, but its dedicated main-process route publishes
only progress until the durable transaction commits.

## Race engineering

The engine is deliberately deterministic. It uses distributions and explicit
assumptions instead of an LLM. Language models may eventually explain an
already-computed result, but they may not generate the result.

- Race distance handles fixed-lap and timed finishes.
- Resource projection separates optimistic, expected and conservative demand.
- Strategy water-fills stints against first-stint fuel, full-tank fuel and tyre
  safety limits.
- Setup recommendations are reversible experiments and suppress unsafe advice.
- Telemetry comparison aligns by distance and reports phase-specific evidence.

## Persistence

Repositories use versioned envelopes, validate imports and preserve corrupt
payloads for diagnostics. Browser-only preferences use localStorage. The live
analysis store is memory-bounded: finalized in-memory traces are compacted and
old sample payloads may be evicted transparently. A separate versioned SQLite
database durably stores finalized live laps and explicitly imported recording
sessions, including the normalized route and control samples needed for later
evidence review. It applies session/byte retention, payload length, CRC-32 and
SHA-256 checks, and reconstructs derived track models from validated sources.
Current writes expose `lapTimeMs` only for a positive lap time published by LMU
scoring. Sample timestamps determine replay duration but never substitute for
official pace or PB evidence. Timing provenance is stored per lap. Migration
leaves a pre-existing unproven numeric duration and its compressed trace
untouched internally, marks the row `legacy-unknown`, removes its PB and
track-model eligibility, and exposes no pace time. Existing sessions retain
their truthful `lap-quality-v1` policy label instead of being silently
reclassified under the current policy.

Recording import uses a private staging database and a processing-version-aware
SHA-256 identity. The final merge, provenance mapping, track-model rebuild and
retention pass share one transaction. A matching recording hash and processing
version is a no-op while the complete imported batch remains retained. If later
retention removes part of that batch, provenance is invalidated and re-import
can restore it atomically without duplicating retained rows. Durable provenance
contains the recording format, hash, processing and app versions, import time
and counts, but never the raw source path. Normal Replay cannot enter this path.
The raw `.apexrec` remains the authoritative source; normalized history is
derived data produced by the current decoder. LMU DuckDB remains a separate
read-only inspection format.

The import route derives its 40-segment and 2 GiB compressed-payload ceilings
from the destination database, counts zero-lap scoring-only segments toward the
former, caps one import at 2,048 laps and one current lap at 16,384 samples, and bounds asynchronous staging work with decoder stdout
backpressure (four-write high water, two-write low water, eight-write hard
limit). Any overflow fails the isolated transaction rather than degrading or
partially publishing analysis.

A first import deliberately performs whole-file work: an initial SHA-256 pass,
an SHA-256 of the exact opened stream during complete strict decoding, a final
selected-path SHA-256 pass at the commit boundary, and validation of every
staged payload. All digests must agree. Removing intentional timing waits is
not a fixed completion-time guarantee. Captured source-lifecycle events replay
from a generic allowlist; old decoder-error text is discarded and the installed
decoder recomputes those states from raw snapshots.

Durable lifetime distance has a different Electron-main writer backed by an
immutable SQLite ledger; renderers receive aggregates through narrow read IPC
and cannot count frames. Replay, import, demo, AI and remote control are excluded
from that metric. Its source filters, chunking, migration snapshots and recovery
contract are defined in [PERSISTENCE.md](PERSISTENCE.md).

## Patch-day protocol

1. Diff `Support/SharedMemoryInterface` against the pinned fixture.
2. Rebuild the bridge.
3. Replay recorded fixtures through the adapter.
4. Validate ranges and struct offsets.
5. Run a practice session offline.
6. Run an EAC-protected online session without privileged access.
7. Only then mark the new LMU version compatible.

## Diagnostics and supportability

The Electron main process owns a rotating JSONL log under the application user-data directory. It records lifecycle failures, bridge stderr and process exits, renderer termination/load failures, and explicitly reported renderer exceptions. Telemetry frames and setup file contents are never written to this log.

Renderer access is limited to narrow preload calls for running read-only checks, viewing logs, opening the log folder, and exporting a redacted JSON support bundle. A bridge self-test is only considered successful after its correlated completion frame arrives; process launch alone is not success.

## Updates

Packaged Windows builds use `electron-updater` with the GitHub provider and the existing per-user NSIS target. The main process owns update checks, downloads, progress, installation, and logs; the sandboxed renderer receives state and can invoke only narrow check/download/install actions. Automatic checks never imply automatic downloads, and installation requires an explicit restart action.

Each GitHub release must attach the versioned installer and `latest.yml`. The metadata carries the installer's SHA-512 digest. Portable archives use the public Releases page as a manual fallback. The pre-push gate refuses a desktop release unless updater metadata was generated alongside the installer, ZIP, and checksum manifest.
