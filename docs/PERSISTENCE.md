# Lifetime statistics persistence

Apex stores its small derived lifetime-distance ledger at
`<Electron userData>/data/apex.sqlite3`. It is independent from raw `.apexrec`
debug recordings and imported LMU DuckDB telemetry.

## Metric

The displayed value is physical distance locally tracked while the local player
controlled a car, grouped by LMU's raw vehicle name and class, since Apex
enabled durable tracking. It is not Steam or game lifetime mileage.

Only the live official `lmu-shared-memory` source with vehicle telemetry and
verified `mControl == player` is eligible. Demo, self-test, raw replay, AI,
remote/replay control, repeated/paused time, missing sequences, reconnects,
session/car boundaries, gaps over 250 ms, non-finite values, and implausible
speeds/distances add nothing. Gaps are withheld rather than estimated.

Adjacent eligible speed magnitudes are trapezoid-integrated against LMU game
elapsed time. Small immutable chunks store integer millimetres with algorithm
version, run ID, sequence range, accepted/rejected counts, vehicle model, and
local session evidence. Source-run/sequence uniqueness makes a retried chunk
idempotent. The sub-millimetre rounding carry is stored on the run row, so
restart and duplicate delivery cannot shift distance between cars or sessions.
Participant slots and driver names are not vehicle identity. V1 uses normalized
LMU class plus the raw LMU vehicle name and preserves both. LMU may include a
team, number, year, or livery in that raw name; Apex does not guess which text
to remove, so those variants can remain separate until an explicit alias is
reviewed.

## Durability contract

The main process is the only writer. Renderers and overlay windows can only read
aggregates through narrow IPC, so opening more windows cannot multiply distance.
SQLite uses foreign keys, a bounded busy timeout, WAL, `synchronous=FULL`, and a
single synchronous writer. One mutable crash-recovery accumulator checkpoints
at 250 ms or 12 accepted intervals, whichever comes first. It seals into an
immutable audit chunk every 3,000 accepted intervals (normally 60 seconds at
50 Hz), and at source/session/car/control boundaries or clean close. Clean quit
and updater installation flush and close before exit; Apex attempts a final WAL
checkpoint, while already-committed WAL records remain durable if SQLite
defers it. A failed updater-grade flush or an earlier storage fault prevents
installation. After a write failure, ingestion fails closed instead of retrying
and flooding diagnostics at 50 Hz.

The measured synthetic acceptance case—100 km/h for 36 game seconds—commits
exactly 1,000,000 mm across multiple chunks. Automated forced-close evidence
loses only the uncommitted accumulator and stays below the 250 ms recovery
point. A two-hour, 360,001-frame synthetic soak commits exactly 200,000,000 mm
in 120 immutable chunks and a 135,168-byte database. Native packaged-Windows
forced-process evidence with the real window lifecycle remains a release gate.

## Migrations and recovery

Schema version is stored in `PRAGMA user_version`; the ordered migration row is
checked against the build's SHA-256 migration checksum on every open.
Before changing an existing schema, Apex uses SQLite's backup API to create an
exclusive snapshot plus a JSON manifest containing source/target schema, app
version, byte count, timestamp, and SHA-256. Ordered migrations run in one
transaction and are followed by a quick integrity check.

A future schema is inspected without switching journal mode or changing its
bytes and is refused for writes. A corrupt database causes startup of the
statistics feature to fail with recovery status while the original bytes remain
untouched; there is no delete-and-recreate catch path. Distance chunks and
signed corrections have database triggers forbidding update or deletion.
Session-detail retention therefore cannot delete lifetime totals.

Settings → Data & storage shows tracked-since, total and per-model aggregates,
coverage wording, database health, and an explicit verified local backup action.
Support diagnostics may report schema/health/error counts but must not include
raw telemetry, driver names, Steam IDs, server data, or recording contents.

## Required release evidence

- Node/Linux database, migration, corruption, future-schema, idempotency,
  exclusion, backup-hash, and constant-speed tests;
- Electron's packaged Windows runtime loading `node:sqlite` and retaining a
  seeded total across restart;
- seeded old-schema package upgraded to current with a verified snapshot;
- forced process termination within the 250 ms recovery target;
- two-hour 50 Hz run with main and overlay windows open;
- a subsequent `.apexrec` replay leaving the committed total unchanged.

Focused commands:

```bash
node --test electron/stats-database.node-test.cjs
npm run test:electron:sqlite
npm run test:stats:soak
```

`test:electron:sqlite` executes inside the exact Electron-bundled Node runtime,
not the host Node process. The Windows CI lane runs it natively before the
shared-memory and real-recording desktop tests.
