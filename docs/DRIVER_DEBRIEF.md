# Deterministic driver debrief

Status: implementation contract
Decision date: 2026-07-18
First target release: 0.4.0

## Product decision

Apex turns a set of trustworthy laps from one measured session into a short,
repeatable driver debrief. The result is computed locally by a bounded
deterministic module. It does not call a model, upload telemetry, use a hosted
reference library, or generate unrestricted prose.

The debrief answers a deliberately narrow question:

> Where does this driver's own fastest eligible lap differ repeatedly from
> the other trustworthy laps in this session, and which trace difference is
> concrete enough to test next?

It does not claim why the difference exists. Fuel load, tyres, weather,
traffic, setup, damage and racecraft are not retained in the current canonical
lap payload, so the debrief cannot use or diagnose them. Its time values are
observed gaps to one measured same-session reference, never predicted or
recoverable gain.

## What the manual investigation taught us

The private recording was first investigated outside the product by streaming
all 422,467 reconstructed snapshots through the current packed decoder and the
same session/lap accumulator used by the desktop app. The private aggregate
contained no raw frames, identities or source path. The investigation then:

1. separated the recording into measured session segments instead of treating
   a multi-session file as one race;
2. accepted only positive official LMU lap times for pace;
3. audited lap quality, player control, pits, route coverage and sample gaps
   before comparing technique;
4. compared laps on distance, not sample index or wall-clock position;
5. split the route into bounded spatial zones and looked for differences that
   recurred across several clean laps;
6. used medians and median absolute deviation (MAD) so a single interrupted or
   unusually slow lap could not dominate the conclusion;
7. inspected controls and speed only to describe an association, then rejected
   explanations the retained evidence could not distinguish; and
8. explicitly withheld tyre-life, target-pressure, setup, traffic-causality and
   fuel-range advice when field semantics or required context were missing.

This sequence is the important meta-result. The difficult part was not finding
the largest number; it was proving that the number belonged to the player, the
same session, a complete lap, an authoritative time and a comparable location.
The first private aggregation attempt itself failed on a null-position edge
case. It emitted no result, the correction was proven on all 18,039 frames of
the approved public fixture, and only then was the private file replayed again.
That fail-closed workflow is now part of the product design.

### Sanitized findings from the gathered race

The longest dry, multi-car Paul Ricard run contained 17 complete laps, 15 with
positive official times and 12 that also passed the strict clean/reference
gate. Its fastest official strict lap was 1:52.533; another was 1:52.596, only
0.063 s away. The 12-lap median was 1:54.256 with 0.742 s MAD. One isolated
2:07.440 lap inflated ordinary standard deviation: excluding only that
greater-than-two-minute anomaly leaves an 11-lap median of 1:54.246 and 1.158 s
standard deviation. The recording contains no event label that distinguishes
a spin, avoidance, correction or other cause, so the manual result calls it an
isolated pace anomaly and nothing more.

Manual equal-distance splits repeatedly concentrated ordinary loss around
3.61–4.13 km. Near 3.93 km, later brake onset and higher loss were strongly
associated in this cohort, while minimum speed varied widely. The defensible
experiment was therefore to inspect preparation and exit consistency, not the
generic instruction “brake later.” A separate zone near 4.78 km had a narrow
64.3–68.6 km/h minimum-speed band and behaved as a repeatable relative
strength. A stitched best-split sum was 1:49.644, but those pieces never
occurred together; it was rejected as a prediction of available improvement.

The shipped fixed-grid engine independently reports the same broad stable
problem area under stricter trace gates: 3.584–3.840 km and 3.840–4.096 km are
recurring hotspots in the imported run, while 4.608–4.864 km is a recurring
relative-strength zone. It reports the measured direction and representative
laps, not the manual correlation coefficient or causal prose.

The run also measured a 3.007 L median usable-lap fuel burn with a narrow
2.967–3.088 L 10th–90th percentile range, but the exposed capacity channel was
zero. Fuel-to-empty beyond simple observed-rate arithmetic was therefore
withheld. The tyre-wear field moved in the wrong direction for a trustworthy
remaining-life label and was quarantined. Another populated run improved from
2:13.220 to 1:50.619 while the published gap-ahead channel was almost always at
or below two seconds, so it was treated as traffic/start context rather than a
clean technique trend. The solo wet Le Mans run improved across three official
laps from 4:30.149 to 4:28.730, but weather changed concurrently; the manual
analysis does not attribute that improvement to the driver alone.

These are sanitized measurements, not demo data and not universal targets.
Position movement is not counted as overtakes, opponent population is not used
as proof of online mode, and correlations are not promoted to causes.

Distance-aligned reference laps and per-segment timing are established
motorsport-analysis primitives. AiM's official RaceStudio manual describes a
time-compare reference and a split report that divides every lap into segments
and reports time spent in each segment. It also calls a sum of best splits
*theoretical*, because the splits can come from different laps. Apex therefore
does not present a stitched best-sector sum as achievable improvement:

- <https://www.aim-sportline.com/docs/racestudio3/manual/html/analysis.html>

MAD is used for descriptive pace variability because it gives tail extremes
less influence than standard deviation:

- <https://itl.nist.gov/div898/handbook/eda/section3/eda356.htm>

The exact gates below are Apex policy decisions calibrated to the available
LMU cadence and product truth; the sources above do not validate those
thresholds.

## Authoritative input cohort

The main process resolves one session and considers a lap only when all of the
following are true:

- state is `complete`;
- timing source is `official` and the time is finite and positive;
- quality is `clean`;
- `referenceEligible` is true;
- exact replay is available; and
- a canonical sample payload is present and its authoritative session/lap
  metadata agrees with the selected evidence.

For durable and imported history, opening that payload additionally verifies
the stored compressed length, CRC-32 and SHA-256 before it reaches the review
engine. The live fallback uses the same in-memory canonical lap contract, but
has no compressed blob or checksum to validate. It is used only while no
durable copy of that session exists; a durable integrity fault fails closed.

The fastest qualifying lap in that session is the reference. A faster lap from
another session, car or historical personal best cannot silently replace it.
At most 16 laps are decoded for one review. The reference and an explicitly
selected eligible lap are pinned; remaining slots are sampled evenly in
chronological order. The result reports total, eligible, excluded and
cohort-limited counts plus every directly observed exclusion reason.

The strict cohort intentionally excludes limited laps even though their
official times can contribute to the factual session debrief. Technique
comparison requires the stronger spatial evidence needed to line up controls.

## Deterministic calculation

### 1. Canonical distance grid

Each accepted lap is resampled onto a 16 m grid. Interpolation is bounded by
adjacent measured points and treats start/finish as a circular seam. LMU can
briefly publish an already-new-lap timestamp while distance still belongs to
the completed lap's finish. During investigation the transition appeared in a
compacted in-memory representation and in the full canonical payload; shipped
playback now removes either form after validation. One canonical wet-lap
instance contains nine 50 Hz suffix samples from 2.505 through 162.505 ms,
holds distance 3.142 m before the finish, and follows a prefix whose endpoint
is 17.495 ms from LMU's official completed-lap time.

A shared playback sanitizer removes only that measured producer-transition
shape: one monotonic suffix of at most 26 samples, every suffix timestamp at
most 250 ms, every suffix point within 32.001 m of the finish, and a pre-reset
endpoint within 250 ms of the official lap time. The sample cap covers the
bridge's bounded 100 Hz maximum over that temporal window while still rejecting
an unbounded repeated suffix. At least three prefix samples are required. A
second reset, a 251 ms value, a point beyond the finish window, a 27-sample
suffix, or any other near miss remains untouched and makes review validation
fail. The checksum-bearing canonical payload remains byte-for-byte unchanged
for private audit and reprocessing; only playback views and the engine's
validated analysis copy omit the proven transition suffix.

After finite, monotonic, channel and circular-coverage validation, the official
lap time deliberately closes the resampled endpoint. Public segment values are
rounded, then the final disjoint segment absorbs only the rounding remainder so
their sum equals the official lap delta by construction. This equality is an
accounting invariant, not independent evidence that validates the official
time. The engine never fills a missing trace hole with zero.

The grid is grouped into disjoint 256 m zones, with one shorter final zone when
the track length is not a multiple of 256 m. For every non-reference lap,
positive zone loss means that lap took longer than the reference in the same
distance range. Summing all zone losses must reproduce its official
lap-time delta to the reference.

### 2. Repeated hotspot gate

A zone can become a hotspot only when:

- at least three non-reference laps are comparable;
- at least 75% have the same positive time-loss direction;
- median observed loss is at least 80 ms; and
- at least one retained trace difference crosses its measurement gate:
  16 m for an input marker, 3 km/h for speed, or 32 m for extra coasting.

Trace observations are computed from explicit thresholds on brake, throttle,
speed and coast state. They are emitted as enum codes plus numbers. The engine
does not emit localized copy or causal language. Stable numeric and enum
tie-breaks make hotspot order independent of object order, process timing and
locale.

The top result is a next experiment, not an instruction that promises lap
time. For example, the UI may say that throttle reached its threshold later in
most compared laps and invite the driver to inspect that zone against the
reference. It must not say delayed throttle *caused* the time gap; the same
trace could reflect traffic, balance, line choice or a necessary correction.

### 3. Strength and variability

The same review reports a measured strength: first a zone with a relative gain
in at least 75% of comparisons, or, when none passes that gate, the zone whose
median absolute gap is closest to the reference (an exact tie prefers the
non-negative median). This prevents a single negative outlier from being
presented as a recurring strength. It also reports median lap time plus MAD when
enough laps exist. These remain observations about the accepted cohort. A
missing hotspot is a valid `no repeated pattern` outcome, not a reason to lower
the evidence gate until a statement appears.

## Output and privacy boundary

The driver-review IPC returns only a versioned structured result containing:

- algorithm and input fingerprints;
- status and evidence accounting;
- same-session reference identity and official time;
- selected-lap comparison when eligible;
- bounded hotspot ranges, recurrence, observed deltas, enum observations and
  safe lap IDs needed to open evidence;
- strength and robust variability summaries; and
- explicit limitation codes.

No driver name, Steam ID, server, source path, raw frame, payload hash, world
coordinate array or unrestricted engine-generated prose crosses that review
boundary. The output is checked against an exact runtime schema, and every
returned lap identity must belong to the resolved input cohort. React owns all
English/German copy and formats only finite numbers.

**Show evidence** is a separate, explicit read. It calls the existing
`getAnalysisLap` path for the normalized subject/reference pair after the
structured review has selected them. Those bounded normalized lap samples and
the existing Analysis summary and provenance fields enter only the sandboxed
renderer's evidence view and remain feedback-redacted. Raw LMU memory snapshots
and the recording's source path do not enter the renderer; this separate replay
response is not part of the driver-review output contract.

## Product flow and interface

The feature belongs inside **Analysis**, because its claims are inseparable
from the existing local session selector, quality ledger and exact lap replay.
It does not add another navigation destination.

For a selected session, Analysis opens on two tabs:

1. **Driver debrief** — one primary next focus, up to a few repeated hotspots,
   one measured strength, evidence counts and collapsed method/limits;
2. **Lap evidence** — the existing map, distance/time replay, speed and control
   traces, brake zones and factual lap ledger.

Choosing **Show evidence** on a hotspot selects its representative lap, loads
the same-session reference, switches to Lap evidence, seeks the start of the
reported range and highlights that range on the circuit map and traces. The
control must work by keyboard, move focus to the evidence heading and retain a
clear selected state. Motion is limited to short state feedback and respects
reduced-motion preferences.

Explicit empty states cover no session, fewer than four strict laps, no
official reference, unavailable/evicted payloads, no repeated hotspot and
invalid evidence. A technically valid result with no repeated hotspot is shown
as such; it is not displayed as an error or replaced with generic coaching.

## Live, imported, online and offline behavior

There is one driver-review engine and one canonical lap-payload contract:

```text
official LMU_Data snapshots
        |
        +-- live bridge --------> LiveSessionStore --+
        |                                           |
        +-- strict .apexrec ----> import staging ----+--> validated lap payloads
                                                        --> driver review
```

Finalized live laps and atomically imported recording laps therefore use the
same cohort gates, distance grid and output schema. The engine has no opponent
count, server field or online/offline branch. That is why its calculation is
mode-independent.

This is not proof that every LMU version produces identical data in every
network condition. The supported shared-memory payload has no authoritative
online/offline field, so Apex must not infer one. The user-labelled private
recording is a strong multi-car release oracle and also contains single-car
segments, but population alone does not prove mode. Synthetic engine tests and
the approved raw fixture exercise the mode-free path; a current-game native
offline race and EAC-protected online race remain separate manual compatibility
checks whenever recordings are available.

## Acceptance criteria

- The same canonical input yields byte-for-byte equivalent structured review
  output and fingerprint regardless of input lap order.
- Segment losses telescope to the official lap delta, including across the
  circular seam.
- Sign, threshold boundary, recurrence, tie-break and insufficient-evidence
  tests are explicit.
- More than 16 eligible laps remain bounded while the reference and selected
  eligible lap stay pinned.
- Corrupt durable length, checksum, hash or metadata never reaches the review
  engine; a fault cannot fall back to a stale live subset.
- The exact nine-sample canonical terminal transition is withheld from
  playback and review after live finalization and after import/restart, while
  every tested near miss remains intact and fails strict review validation.
- The review IPC never returns evidence samples. Only an explicit **Show
  evidence** action loads the normalized subject/reference pair through the
  existing evidence IPC.
- Every enum and rendered state has matched English and German copy.
- Clicking a hotspot opens the reported subject/reference lap pair at the
  reported distance range.
- The private recording completes strict current-decoder import and produces a
  deterministic review without committing any private oracle output. The exact
  release audit yields three ready and six insufficient-evidence session
  results, zero invalid results, and nine bounded hotspots across the three
  ready sessions.
- The approved recording, Linux tests, Windows cross-compile, real Windows
  shared-memory job, packaged replay and the complete release gates remain
  green.

## Deliberately deferred

Rich-condition parity is a later persistence contract. Adding fuel phase,
compound, tyre state, weather, traffic, race position or setup context requires
bounded canonical fields, versioned provenance, import reprocessing semantics
and fixtures that prove each field's meaning. In particular, tyre wear from the
private recording moved in a direction incompatible with a trustworthy
remaining-life label; tyre-life and setup advice remain unavailable until the
current official SDK definition and a native monotonicity test establish the
field semantics.
