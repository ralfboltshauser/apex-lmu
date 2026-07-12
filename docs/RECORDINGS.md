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
