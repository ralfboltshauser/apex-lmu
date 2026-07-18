# Raw session recordings

The session recorder captures source bytes before Apex decodes them. A recording
can therefore reproduce an LMU integration bug without the game. When a decoder
or quality-policy change intentionally bumps the processing contract, the same
raw evidence can rebuild private analysis instead of preserving conclusions
produced by an older build.

## User flow

1. Open **Settings → Data & storage** and choose **Record session**.
2. Choose a destination for the single `.apexrec` file. Recording begins even
   if LMU is not running yet.
3. Start LMU, join the relevant practice or race session, and drive normally.
4. Return to Apex and choose **Stop & save**. Wait for **Complete** before
   sharing the file.
5. Choose **Replay a recording** on the same card to inspect it transiently.
   Apex pauses the live bridge, streams the recording through the current
   decoder at its original timing, feeds the measured Live workspace, overlay
   and transient Analysis, and resumes the live bridge afterwards. Replay never
   writes durable Analysis history or lifetime statistics.
6. Choose **Import .apexrec** in **Analysis** only when the recording should
   become durable private history. Apex checks and decodes the complete file,
   then publishes validated normalized history under bounded retention in one
   local transaction.

## Replay versus Import into Analysis

| Action | Intended use | Visible while decoding | Durable effect |
| --- | --- | --- | --- |
| **Replay a recording** | Reproduce or inspect the captured run | Live workspace, overlay and transient Analysis | None; lifetime statistics and durable Analysis history are unchanged |
| **Import .apexrec** | Rebuild private session history | Import progress only | Bounded validated history appears atomically in Analysis |

Import hashes the file locally and runs strict unthrottled replay through the
current decoder. A matching hash and processing version is a no-op while its
complete imported batch remains retained. If bounded retention later removes
part of that batch, provenance is invalidated and re-import can restore it
without duplicating retained rows. A dedicated accumulator and staging database
receive only that correlated run. Truncation, corruption, cancellation, a
changed source file, any current-decoder rejection, or any storage fault
discards staging and exposes no partial history. `waiting-for-vehicle` is not a
decoder fault: it is the expected scoring-before-telemetry lifecycle and can
occur in both user-described online and offline sessions.
Imported frames do not enter the Live workspace, overlay, fuel calibration or
lifetime-distance ledger. Apex does not infer whether the captured session was
online or offline; recordings from either user-described mode contain the
official snapshots that were actually captured and use the same decoder.
If scoring identifies a transient session that ends before any player lap is
available, Import skips that zero-lap segment. A missing database row for a
session that does contain lap evidence remains a hard failure.

A first import deliberately reads the complete source to calculate SHA-256,
hashes the exact opened stream while decoding every snapshot without
captured-time delays, reads the selected source again at the commit boundary,
requires all three digests to agree, and validates every staged lap payload.
This is whole-file work with local progress, not a fixed completion-time
promise. Cancellation before finalization discards staging; after finalization
begins, Apex waits for the all-or-nothing result.

The import accumulator accepts at most 40 finalized session segments, including
zero-lap scoring-only segments; it can commit at most 2 GiB of compressed lap
payloads and 2,048 laps. A current lap is capped at 16,384
samples and becomes explicitly ineligible/non-replayable on overflow. The
bounded payload remains ledger integrity evidence, but is not exposed as exact
lap replay. Staging
writes use decoder-pipe backpressure (pause at four outstanding writes, resume
at two) plus a hard eight-write bound for output already buffered in transit.
Compressed-size enforcement occurs as writes resolve, so private staging can
briefly exceed 2 GiB by that bounded in-flight work before a fail-closed discard.
Crossing any limit publishes no partial history.

## What is captured

- every 324,820-byte `LMU_Data` snapshot acquired under the SDK lock at 50 Hz,
  before validation or decoding;
- monotonic time for each snapshot;
- mapping, connection, waiting, disconnect and decoder-error transitions;
- format, capture time, Apex version, sample rate and source-contract metadata.

The file therefore includes fields Apex does not currently display. It does
not include game binaries, screen/video/audio capture, network packets, setup
file contents, Apex account data (there is no account), or anything outside the
official shared-memory block.

## Format: `apex-lmu-raw-v1`

`.apexrec` is an append-safe binary stream:

1. `APEXLMUREC1\n` magic;
2. little-endian 32-bit JSON metadata length and UTF-8 metadata;
3. independent records with kind, monotonic nanoseconds, raw size, compressed
   size and CRC-32;
4. a full zlib-compressed keyframe every 250 snapshots;
5. zlib-compressed XOR deltas between keyframes.

Independent checksums make corruption explicit. If the app or PC stops during
capture, replay consumes all complete records and reports the incomplete tail.
Readers enforce metadata, payload and decompression limits. Writers stop at an
8 GiB safety limit.

Replay reproduces an allowlisted set of captured source-lifecycle transitions
(mapping, waiting, connection and disconnect) with generic text. It deliberately
does not replay historical decoder-error messages: the current decoder derives
those states again from the raw snapshots, and old free text can contain private
identity data.

## Privacy

Raw LMU shared memory can contain driver names, Steam IDs, server name/address
details and local LMU paths. Exact raw bytes are necessary for contract and
offset debugging, so these fields are not redacted. Apex stores the file only
at the path chosen by the user and never uploads it. Treat `.apexrec` files as
private debugging attachments.

An Analysis import stores derived normalized session/lap evidence and sanitized
provenance in Apex's private local database. Provenance includes the recording
hash, format, processing contract, import time and counts; it does not store the
raw source path. The raw file remains authoritative and is not copied into the
database or uploaded.

## Command-line replay

The bundled bridge can replay on Windows without LMU:

```powershell
apex-lmu-bridge.exe --replay="C:\captures\practice.apexrec" --replay-speed=1
```

`--replay-speed=0` removes timing delays for automated tests; values up to 16
accelerate replay. Output is the same versioned NDJSON protocol used by the
live Electron adapter.

Round-trip, corruption, current-decoder and Windows named-mapping tests cover
the writer and reader. The Windows CI fixture records a separate simulated LMU
producer, stops the recorder cleanly, reads the resulting file and replays it
through the packaged bridge.

## Real-recording regression harness

The repository also contains one explicitly approved private test recording and
an allowlisted expectation manifest under `data/recordings/`. The manifest pins
the exact byte count and SHA-256 before any replay starts. It contains only
reviewable aggregate expectations—track/car/class, capability timing, control
ownership transitions, ranges, lap time, pit sequence, fuel movement, wheel
evidence, opponent count, world-coordinate bounds, and coordinate-motion versus
speed consistency—not driver, Steam, server, or local-path data.

Run the current decoder and bridge protocol check on Linux or Windows:

```bash
npm run test:recording-replay
```

On Linux the command uses `go run`; on Windows CI it uses the compiled bridge
from `APEX_LMU_BRIDGE_EXE`. Replay is strict, accelerated, and correlated by a
fresh run ID. The harness then exercises the explicit Analysis import, restart
persistence and hash/version deduplication against a temporary private database.
A missing/mismatched fixture, corrupt/truncated stream, absent completion,
omitted empty-opponent array, wrong fact, non-atomic import or nonzero bridge
exit is a failure.

The Windows source-desktop test additionally requires a built renderer and
bridge:

```powershell
npm run build
npm run build:bridge:win
npm run test:e2e:windows:replay
```

After building Windows artifacts, run the same boundary against the packaged
application instead of source Electron:

```powershell
$env:APEX_E2E_EXECUTABLE = 'release/win-unpacked/Apex for LMU.exe'
npm run test:e2e:windows:replay
```

It launches Electron with isolated temporary user data, starts the same replay
through validated test-only orchestration, observes the production preload/IPC
stream while the normal desktop adapter and React UI consume it. It also opens
the production overlay on an enumerated display, checks exact bounds,
non-focusable/topmost state, live opacity/widget configuration, measured replay
content, deterministic close, lifetime-stat exclusion, track/car rendering and
main-window responsiveness. It also requires the real recording to reconstruct
a 99% covered route, expose all 11 stable braking zones in Live and Analysis,
and keep the map/chart evidence distance-aligned. It then closes the entire
process tree. The test
disables updater side effects and accepts no arbitrary script, URL, preload, or
recording path from the renderer.

Never upload the raw recording, replay NDJSON, screenshots containing identity
data, or temporary corrupt copies as CI artifacts. To replace the fixture,
review publication consent, update the binary and manifest together, derive
only allowlisted facts through the current decoder, and demonstrate that a
deliberately wrong expectation fails before accepting the new hash.
