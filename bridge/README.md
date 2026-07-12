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

Every message has a `type` of either `status` or `telemetry`. The TypeScript
desktop adapter treats unknown fields as forward-compatible additions.

## Bounded transport self-test

The same executable can exercise its deterministic NDJSON transport without
opening LMU or its shared-memory mapping:

```sh
apex-lmu-bridge.exe --self-test --frames=8 --run-id=manual-check > self-test.ndjson
node ../scripts/assert-bridge-self-test.cjs self-test.ndjson 8 manual-check
```

Self-test messages carry `protocolVersion: 1`, `source: "self-test"`, the run
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
