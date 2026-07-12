# Raw session recordings

The session recorder exists to reproduce LMU integration bugs without the game.
It captures the source bytes before Apex decodes them, so a recording can test a
new bridge rather than merely replaying conclusions produced by an old bridge.

## User flow

1. Open **Settings → Data & storage** and choose **Record session**.
2. Choose a destination for the single `.apexrec` file. Recording begins even
   if LMU is not running yet.
3. Start LMU, join the relevant practice or race session, and drive normally.
4. Return to Apex and choose **Stop & save**. Wait for **Complete** before
   sharing the file.
5. A developer can choose **Replay a recording** on the same card. Apex pauses
   the live bridge, streams the recording through the current decoder at its
   original timing, and resumes the live bridge afterwards.

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

## Privacy

Raw LMU shared memory can contain driver names, Steam IDs, server name/address
details and local LMU paths. Exact raw bytes are necessary for contract and
offset debugging, so these fields are not redacted. Apex stores the file only
at the path chosen by the user and never uploads it. Treat `.apexrec` files as
private debugging attachments.

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
evidence, and opponent count—not driver, Steam, server, or local-path data.

Run the current decoder and bridge protocol check on Linux or Windows:

```bash
npm run test:recording-replay
```

On Linux the command uses `go run`; on Windows CI it uses the compiled bridge
from `APEX_LMU_BRIDGE_EXE`. Replay is strict, accelerated, and correlated by a
fresh run ID. A missing/mismatched fixture, corrupt/truncated stream, absent
completion, omitted empty-opponent array, wrong fact, or nonzero bridge exit is
a failure.

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
main-window responsiveness. It then closes the entire process tree. The test
disables updater side effects and accepts no arbitrary script, URL, preload, or
recording path from the renderer.

Never upload the raw recording, replay NDJSON, screenshots containing identity
data, or temporary corrupt copies as CI artifacts. To replace the fixture,
review publication consent, update the binary and manifest together, derive
only allowlisted facts through the current decoder, and demonstrate that a
deliberately wrong expectation fails before accepting the new hash.
