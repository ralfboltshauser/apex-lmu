# Apex LMU bridge

This small Windows sidecar reads Le Mans Ultimate's official `LMU_Data`
mapping and writes newline-delimited JSON to stdout. It runs out of process so a
reader fault cannot crash LMU or the Apex UI. No DLL is injected into the game.

The parser is implemented locally from Studio 397's packed byte contract in
`Le Mans Ultimate/Support/SharedMemoryInterface`. It does not cast mapped bytes
to native Go structs. Every consumed scalar has an explicit offset and is
bounds-checked and rejected if it is non-finite. Reads use the SDK's named lock.
The x64 contract has a 324,820-byte data payload and four bytes of final C++
tail padding.

Build from any Go host:

```sh
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -o bin/apex-lmu-bridge.exe .
```

Messages use `status`, `telemetry`, or recorder-only `recording` types. The
TypeScript desktop adapter treats unknown fields as forward-compatible additions.

Protocol v2 represents unavailable normalized session end time, lap distance,
and relative timing as JSON `null`. A separately bounded `lapDistanceRawM`
retains LMU's signed start/finish coordinate for lap-boundary detection; UI
progress and analysis samples consume only the normalized non-negative field.
Transient decode errors remain non-destructive for one second before the bridge
reports `stale-data`, while true `waiting-for-vehicle` states remain immediate.

The additive vehicle contract includes official packed world position
(`mPos`), game elapsed time and lap-start time when per-vehicle telemetry is
available. Scoring rows also expose official world position for opponents. All
axes and times are finite/bounds checked; absence remains absence. The checked
real recording validates 18,035 position frames and compares coordinate motion
against integrated LMU speed, with its 5th/median/95th percentile ratios all
within 0.99–1.01. Apex therefore does not infer positions from lap percentage
or a demo circuit.

## Raw record and replay

The bridge can record the complete shared-memory payload before decoding and
replay it later through the current decoder. The desktop app owns the normal
workflow; direct bridge usage is useful for automated debugging:

```sh
apex-lmu-bridge.exe --record=C:\captures\session.apexrec --app-version=dev
# write "stop" plus a newline to stdin to finalize
apex-lmu-bridge.exe --replay=C:\captures\session.apexrec --replay-speed=0
```

The append-safe, checksummed and delta-compressed format is documented in
[`docs/RECORDINGS.md`](../docs/RECORDINGS.md). A recorder is a separate bridge
process, so capture does not interrupt the live UI. Replay temporarily replaces
the live source and then hands control back to it.

## Bounded transport self-test

The same executable can exercise its deterministic NDJSON transport without
opening LMU or its shared-memory mapping:

```sh
apex-lmu-bridge.exe --self-test --frames=8 --run-id=manual-check > self-test.ndjson
node ../scripts/assert-bridge-self-test.cjs self-test.ndjson 8 manual-check
```

Self-test messages carry `protocolVersion: 2`, `source: "self-test"`, the run
ID, and the `bridge-contract-v1` fixture ID. The process emits one starting
status, exactly the requested number of telemetry frames, one completion
status, then exits. `--frames` is bounded to 1–256 and run IDs are restricted to
safe correlation characters.

This proves executable launch, JSON framing, Electron IPC, and renderer
normalization when invoked through the desktop app. It deliberately does not
open or validate LMU shared memory or compatibility with the installed game
version. The Windows-only named-section fixture tests cover the real mapping,
lock, packed decoder, process transport, and disconnect path without launching
the game.

## Liveness boundary

Windows named sections remain alive while any process owns a handle. The bridge
therefore refuses to open the mapping until it has a synchronization handle to
`Le Mans Ultimate.exe`, monitors that process for exit, and also closes and
reopens the mapping once per second. Another telemetry consumer can retain a
stale section name, but that section alone cannot pass the process gate. A
mapped view being readable is never treated as proof that the producer is
alive.

The bridge currently samples at the requested 10–100 Hz under the SDK's named
lock. It does not claim event-driven reads: `LMU_Data_Event` is an update
notification, not producer identity, and is not used as a liveness signal.
