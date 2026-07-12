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
copying, bridge lifecycle and the transparent overlay window. External links
open in the operating-system browser; renderer-created windows are denied.

### LMU bridge

The bridge is a static Windows executable with no administrator requirement.
It maps LMU's official shared memory, normalizes obvious units such as Kelvin
and bar, and writes NDJSON. It retries while LMU is closed and exits cleanly
when Electron stops it.

## Domain boundary

All live, replay and simulated sources implement `TelemetryAdapter`. UI code
consumes `TelemetryFrame`, never transport-specific memory layouts. This lets a
captured recording reproduce a bug without LMU running.

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
payloads for diagnostics. Current browser builds use localStorage; the desktop
database boundary is intentionally isolated so SQLite or DuckDB can replace it
without changing UI consumers.

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
