# Private Race Memory

Status: implementation contract
Decision date: 2026-07-17
First target release: 0.3.2

## Product decision

Apex will turn a user-selected raw `.apexrec` recording into durable, private
session analysis and a factual session debrief. The raw file remains the
authority. Import always reconstructs its snapshots and runs them through the
decoder in the installed Apex version; normalized history is derived,
replaceable data.

This is an explicit **Import into Analysis** workflow. The existing **Replay**
workflow remains transient debugging/playback and must never write history.

The first release does not claim causal coaching, universal tyre targets,
setup optimization, cloud reference laps, or native LMU DuckDB ingestion.

## Why this is the highest-value next step

The current market has mature live overlays and dashboards. RaceLab advertises
25 LMU overlays and more than 80 data blocks; SimHub, TinyPedal, and Lovely
already cover broad local display and hardware workflows. Building more generic
widgets would make Apex broader without making it more useful or defensible.

Cloud products solve a different problem. Track Titan, GO Fast, MyLMU, and
Garage 61 retain session history and guide post-session review, but their
reference libraries, accounts, uploads, subscriptions, or hosted processing do
not fit Apex's local-first product truth. A small open-source LMU DuckDB viewer
also shows that local charts already exist; Apex's product decision is that
charts alone are not sufficient differentiation.

The resulting position is intentionally narrow:

> A private, account-free LMU race engineer that remembers the user's own
> sessions and explains only what the measured evidence supports.

Current primary sources used for this decision:

- [LMU native telemetry recording](https://guide.lemansultimate.com/hc/en-gb/articles/14524956311695-Telemetry-Recording)
- [RaceLab LMU features](https://racelab.app/lemansultimate/)
- [SimHub current LMU support](https://www.simhubdash.com/download-2/)
- [Track Titan plans and LMU support](https://app.tracktitan.io/pricing)
- [GO Fast telemetry analysis](https://go-fast.gg/telemetry-data/)
- [Garage 61 capture workflow](https://garage61.net/docs/usage/agent)
- [MyLMU product](https://www.mylmu.app/)
- [Telemetry Visualizer for LMU](https://github.com/lamerman/telemetry-visualizer-for-lmu)
- [TinyPedal](https://github.com/TinyPedal/TinyPedal)
- [Lovely Dashboard](https://github.com/Lovely-Sim-Racing/lovely-dashboard)

Vendor pages establish advertised capability, not independent evidence that a
feature is accurate or good.

## Source model

The two supported raw paths have different effects:

| Path | Purpose | Renderer/overlay | Durable analysis | Lifetime stats |
| --- | --- | --- | --- | --- |
| Live LMU | drive and observe | yes | finalized laps | local-player live distance only |
| Replay recording | reproduce/debug | Live/overlay/transient Analysis | never | never |
| Import recording | rebuild private history | progress only | atomic on strict completion | never |

An import must not be implemented by globally enabling replay persistence.
Replay can be cancelled or partial, and its accelerated frames must not appear
to be a live race or count toward lifetime statistics.

## Import transaction

`apexrec-analysis-v3` is the processing contract for the first release. It
records both the cadence-calibrated `lap-quality-v2` policy and the
official-only timing rule. The version changed before release so no import can
be incorrectly deduplicated against either the earlier 12 m coverage experiment
or a development import that synthesized pace from sample duration.

1. The user explicitly chooses one `.apexrec` file.
2. Electron validates that it is a regular file no larger than 8 GiB and hashes
   it locally with SHA-256. The absolute source path never enters renderer
   state, durable history, or diagnostics.
3. The file hash plus processing-contract version forms a stable import ID and
   correlated bridge run ID.
4. A dedicated session accumulator and private staging SQLite database receive
   only that run's messages.
5. The bridge runs without captured-time delays in strict mode. Its reader
   enforces header, decompression, size, checksum, delta/keyframe, and
   truncation safeguards and sends every reconstructed 324,820-byte snapshot
   through the current `decodeSnapshot`. Scoring-before-vehicle
   `waiting-for-vehicle` is an expected lifecycle state; any other decoder
   rejection stops strict replay without completion.
6. The staging database must flush durably and pass schema, integrity, payload
   length, CRC-32, and SHA-256 checks.
7. The bridge SHA-256 hashes the exact opened byte stream it decoded and emits
   the digest only after true EOF. Only correlated `replay-starting` plus
   `replay-complete`, a decoder digest matching the preflight digest, process
   exit zero, and no protocol fault authorize one main-database transaction.
8. The transaction validates ID collisions, copies sessions/laps/payloads,
   records provenance, rebuilds affected derived track models, and applies the
   existing retention policy.
9. Cancellation, strict replay failure, storage failure, shutdown before
   verified finalization, or any validation error deletes staging and exposes no
   partial imported session. Once finalization begins, shutdown waits for its
   all-or-nothing result.

A scoring-only segment can legitimately end before LMU publishes any player
vehicle lap. Such a segment has no durable lap evidence and is explicitly
skipped at the session-finalization boundary. This is narrower than accepting a
database miss: if a session summary contains any lap and its row cannot be
finalized, the import still fails and discards staging. This distinction is what
allows the gathered multi-session recording to pass without manufacturing an
empty analysis session or weakening storage errors.

Re-importing the same file under the same processing version is a no-op while
its complete imported batch remains retained. If bounded retention later
removes part of that batch, provenance is invalidated and re-import can restore
it atomically without duplicating retained rows. A future decoder or
quality-policy change that intentionally requires reprocessing must bump the
processing version. Conflicting content under an existing stable ID is an
error, never an overwrite.

A first import deliberately performs whole-file work: it hashes the complete
selected source, hashes the exact stream while decoding every snapshot without
captured-time delays, re-reads the selected source at the commit boundary, and
validates every staged payload. All three digests must agree. Removing timing
waits does not promise a fixed completion time.

An accepted batch is bounded by the same policy enforced at the transaction
boundary: at most 40 observed finalized session segments (including zero-lap
scoring-only segments), 2 GiB of compressed lap payloads and 2,048 assembled
laps. A current lap retains at most 16,384 samples; overflow
makes that lap explicitly ineligible and non-replayable. Its bounded payload
remains available as integrity evidence in the lap ledger, but the UI will not
present or play it as an exact trace. Asynchronous staging
writes pause decoder stdout at four pending writes, resume at two, and fail
closed if already-buffered output reaches eight. Because compressed size is
known only when a write resolves, staging can transiently exceed 2 GiB by that
bounded in-flight work before the entire import is discarded. The source reader
still has the independent 8 GiB recording limit. These are safety limits, not
claims about how many useful laps a recording ought to contain. Final payload and
deduplication verification is bounded but currently synchronous in Electron's
main process, so an adversarial import near those ceilings may temporarily
delay the interface; moving that work off-main is a follow-on hardening item.

## Durable provenance

The local database records:

- recording SHA-256;
- recording format;
- processing-contract version;
- importing Apex version;
- import timestamp;
- committed session and lap counts;
- the imported session IDs.

The product exposes only provenance needed to understand the analysis. It does
not expose or persist the source path. Imported sessions use a distinct
`imported-recording` source label; they are not presented as a currently live
session.

## Session debrief

The first debrief is deliberately descriptive. It uses complete clean or
limited laps with finite official LMU lap times for pace statistics. Limited
route capture does not erase LMU's official timing evidence; it does prevent
the lap from becoming a trace/PB reference.

An official time exists only when LMU publishes the positive scoring value.
`mCountLapFlag == 2` is not used as a substitute, and elapsed sample timestamps
remain replay duration only. Laps without a published time remain replayable
when they contain at least two valid samples, but cannot contribute pace, PB,
comparison-reference, or learned-track evidence. Historical durations without
durable provenance retain their original trace, are labelled `legacy-unknown`,
lose PB/track-model eligibility, and expose no pace time rather than being
guessed. Their sessions retain the truthful `lap-quality-v1` policy label.

- best lap;
- median pace;
- median absolute deviation as a robust consistency measure;
- first-half versus second-half median change when each half has enough laps;
- counts of clean, limited, ineligible, and untimed laps;
- coverage distribution;
- an ordered lap ledger with quality, time, and delta to the session best.

Fewer than four eligible laps are not enough to claim a trend. Missing or
non-finite inputs produce an unavailable state, never zero. Quality/reason
decisions remain in the versioned main-process policy; React only renders them.

Existing selected-lap functionality remains the evidence drill-down: exact
recorded driven line, speed and controls, brake zones, personal-best comparison,
and locally learned track geometry.

## Deterministic driver debrief

Release 0.4.1 adds a second, deliberately stricter analysis layer. The factual
session summary above can use complete limited laps for authoritative pace, but
the Driver debrief accepts a lap only when it is complete, clean, officially
timed, reference-eligible, replayable and backed by a validated canonical
sample payload. The fastest qualifying lap from the selected session is the
reference. A historical or cross-session personal best cannot replace it.

The main process decodes at most 16 qualifying laps, aligns them on a 16 m
distance grid and evaluates disjoint 256 m zones. A zone is reported only when
at least three non-reference laps are comparable, at least 75% show the same
positive time-loss direction and median loss is at least 80 ms. At least one
concrete brake, throttle, speed or coast difference must also cross its
measurement gate on 75% of comparable laps that are jointly slower in that
zone. The result is deterministic structured data: evidence counts, the
same-session reference, bounded hotspots, observed trace differences, a
measured relative-strength zone, robust pace variability and explicit
limitation codes.

This is not causal coaching and it does not predict recoverable lap time. The
retained lap payload does not contain the fuel phase, tyre state, weather,
traffic, setup or damage context needed to distinguish why two control traces
differ. The interface therefore presents each result as an association to
inspect and a next experiment, with a **Show evidence** path back to the exact
subject/reference traces and reported distance range.

The Driver debrief response contains no sample or world-coordinate arrays,
payload hashes, source paths, driver identity or free-form generated prose.
Choosing **Show evidence** separately requests the named lap traces through the
existing Analysis evidence path. The calculation calls no AI model, has no
cloud dependency and uses the same canonical payload contract for finalized
live laps and strictly imported `.apexrec` laps. Its complete algorithm and
product flow are specified in
[Deterministic driver debrief](DRIVER_DEBRIEF.md).

## Recording-calibrated lap quality

The private recording exposed a measurement error in Apex rather than a decoder
or recording error. The old policy counted occupied 12 m distance bins, while
LMU's effective scoring-distance cadence in the gathered laps is roughly
14–15.5 m. Valid samples therefore skipped bin numbers even though the physical
route was continuous. On the 13.62 km session family, complete laps occupied
only about 93.8% of 12 m bins while their median true circular sample gap was
15.49 m. World movement through every lap wrap matched speed integrated over
time, and the first and final route bins were present.

`lap-quality-v2` uses the smallest tested bin width above that cadence: 16 m.
It retains the 97% occupied-bin threshold and adds a separate circular-gap
guard of 32 m (two bins). The seam gap is calculated as
`firstDistance + trackLength - lastDistance`; the earlier formula incorrectly
treated the two sides of start/finish as separate gaps. The policy explicitly
tolerates circular sample gaps up to 32 m to cover two observed cadences, while
the separate guard prevents gaps above 32 m from being hidden by wider bins.
Observed 43.99 m, 56.67 m, and multi-kilometre bad-lap gaps remain rejected.

At 16 m, the approved fixture retains exactly two clean/reference laps and its
learned route covers 99.627%. The final current-service audit of the private
recording produced 34 clean laps, 28 laps with official LMU times and 24 strict
trace/reference laps from 56 persisted lap payloads. Wider bins added no
observed eligibility and reduced spatial resolution; 14 m happened to pass but
remains below the observed cadence and is more sensitive to bin phase.

Negative transitional lap distances remain unavailable. Shifting them changed
maximum coverage by less than 0.24 percentage points and introduced additional
rejects, so treating them as calibrated coordinates would add an unsupported
assumption.

## Online and offline reasoning

Apex has one supported packed `LMU_Data` input contract and one bridge decoder;
there is no mode-specific branch. This is an implementation fact, not external
proof that LMU makes every producer behavior identical in both modes. Apex also
does not guess whether a race is online because the captured contract has no
authoritative mode field. In recordings users identify as either mode, scoring
may become available before player vehicle telemetry. The bridge therefore
first trusts `mIsPlayer`, then uniquely correlates scoring with the scoring
header's player name when normal player telemetry is not yet available.

Raw recording is what makes retroactive fixes possible. It contains snapshots
from before normalization, so importing with a new Apex version exercises the
new player correlation, sentinel handling, lap-boundary logic, and quality
policy. A normalized JSON recording could not reproduce or repair decoder
mistakes.

Captured mapping/wait/disconnect lifecycle states are replayed from an
allowlist with generic text so interruption evidence survives import. Historical
decoder-error event text is neither trusted nor replayed: the installed decoder
recomputes decoder states from raw snapshots, avoiding stale conclusions and
private scoring-header messages.

The user-labelled online private recording is the release oracle for those
transitions, although the raw mapping does not itself carry an authoritative
online/offline label. The committed approved single-car recording remains the
cross-platform regression fixture. Neither proves all future LMU versions,
cars, tracks, conditions, or both network modes; current-game native Windows
checks remain required.

The Driver debrief inherits this mode boundary. Neither the cohort resolver nor
the deterministic engine receives opponent population, server identity or an
online/offline flag, so finalized live and imported laps follow the same rules
in either user-described mode. That mode-independent implementation is not
proof of current-game offline or EAC-protected online compatibility; fresh
native drives remain release checks whenever they can be gathered.

## Acceptance criteria

### Transaction and privacy

- Successful strict import survives application/database restart.
- Importing the same file twice creates no duplicate session or lap.
- Corrupt, truncated, cancelled, uncorrelated, or storage-failed imports expose
  no new session.
- Ordinary Replay still writes no durable history.
- Imported frames never enter the live renderer, overlay, fuel calibration, or
  lifetime-distance ledger.
- Import renderer state, diagnostics, and the durable database contain no
  absolute import-source path. Explicit transient Replay may show its selected
  path in the existing recording controls.
- Staging is private and removed after success, failure, cancellation, or the
  next startup's stale-work cleanup.

### Determinism and analysis

- Identical file hash and processing version produce identical session/lap IDs
  and payload hashes.
- Replay speed and transport chunking do not change committed summaries.
- Debrief results contain no `NaN` or infinity and do not mutate inputs.
- Pace/trend metrics include complete clean and limited laps with finite
  official LMU times, and exclude incomplete, untimed, and ineligible laps.
- PB, comparison-reference, and learned-track eligibility remain limited to
  the stricter clean/reference-eligible set.
- Driver debrief comparisons use only complete, clean, official,
  reference-eligible and replayable laps from one session, with a maximum of 16
  decoded laps and the fastest strict same-session lap as reference.
- Identical canonical input produces the same review fingerprint, hotspot
  order and structured result regardless of input lap order.
- A reported hotspot has at least three comparable non-reference laps, 75%
  joint positive loss/trace agreement, at least 80 ms median measured loss and
  a concrete trace observation; a missing pattern remains a valid empty result.
- Review output contains no raw sample/coordinate arrays, payload hashes,
  recording paths, identity fields, non-finite values or unrestricted prose.
- Every lap remains inspectable with its quality and reasons.

### Recording evidence

- The approved committed fixture passes its existing strict decoder assertions
  and the new explicit import path: 18,039 frames, restart persistence and
  idempotent re-import.
- The final current-service audit of the user-labelled-online private recording
  passed all 422,467 frames: 63,747 single-car and 358,720 multi-car frames. It
  transitioned from scoring-only to player telemetry, selected the local
  player, atomically committed nine lap-bearing sessions and 56 lap payloads,
  decoded every payload after restart, retained 47 complete/34 clean/28
  officially timed/24 reference-eligible/53 replayable laps, and performed an
  idempotent re-import without starting a second replay. The shipped review
  service then ran twice for every session against the reopened payloads: three
  sessions produced ready reviews with nine bounded hotspots in total, six
  returned explicit insufficient-evidence results, and none returned invalid
  input or a nondeterministic/privacy-invalid result.
- The private file stays untracked and is never uploaded as a release asset.
- Native Windows CI still builds and exercises the real mapping/locking/liveness
  fixture. A fresh current-LMU offline and EAC-protected online drive remains
  the final manual compatibility check when available.

## Follow-on releases and hard gates

1. **Native Lap Lab:** ingest LMU DuckDB channels only after obtaining a real,
   anonymized, versioned fixture. Preserve channel names, units, frequency, and
   missing-channel state; never infer its schema from documentation alone.
2. **Race Execution:** compare strategy plan with measured consumption, pace,
   pit loss, and traffic. Suppress alerts when opponent gaps or finish semantics
   are transitional.
3. **Engineering Experiments:** comparable tyre/brake stints and one-change
   setup A/B tests. Concrete setup writes remain gated on a real versioned
   `.svm` schema fixture.

Generic overlay breadth, a hardware ecosystem, cloud leaderboards, reference
lap marketplaces, and account-backed team services are not priorities under
the current product model.
