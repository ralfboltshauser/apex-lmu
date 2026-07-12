---
title: "Reusable Windows end-to-end replay harness"
issue: 13
issue_url: "https://github.com/ralfboltshauser/apex-lmu/issues/13"
issue_state: "open"
labels: ["documentation", "enhancement"]
implementation_status: "not-started; fixture PR pending"
plan_order: 3
phase: 0
workstream: "windows-end-to-end-validation"
complexity: "XL"
complexity_score: 5
effort_engineer_days: "17-27"
risk: "high"
confidence: "medium"
depends_on_external: ["PR #11 merges the named 27,407,993-byte recording with the documented SHA-256"]
merge_after: [9]
blocks: [4]
soft_dependencies_for: [6, 8, 3]
parallel_with: [7, "#3 research and decomposition", "#6 schema design"]
source_created_at: "2026-07-12T20:05:04Z"
source_updated_at: "2026-07-12T20:05:04Z"
source_commit: "9660be5"
last_verified: "2026-07-12"
---

# Issue #13 — reusable Windows end-to-end replay harness

## Outcome

A contributor or GitHub Actions can launch the real Windows desktop app against
the checked-in LMU raw recording, replay it deterministically through the
current decoder, and prove that facts survive every production boundary:

```text
.apexrec reader -> decodeSnapshot -> bridge NDJSON -> Electron orchestration
-> preload/IPC -> desktop adapter/state -> rendered UI
```

The run has a unique identity, event-driven completion, bounded failure modes,
and guaranteed child-process cleanup. It requires neither LMU nor administrator
rights, an injected DLL, undocumented process memory, an account, analytics, or
a cloud service. Failures identify the boundary that broke without printing or
uploading private raw-memory contents.

## Verified prerequisite state

Issue #13 names this fixture:

| Property | Required value |
| --- | --- |
| Path | `data/recordings/apex-lmu-session-2026-07-12-19-23-14TESTAUFNAMERALF.apexrec` |
| Format | `apex-lmu-raw-v1` |
| Size | 27,407,993 bytes |
| SHA-256 | `de981c660456f1cf006f39f35a654ac19496d60bd43357bf203349755e3af6ff` |
| Writer | Apex `0.1.13`, official `LMU_Data` mapping |
| Sensitivity | Private raw LMU shared memory |

At this plan's verification point the file is **not on `main`**. It exists only
in open draft PR
[#11](https://github.com/ralfboltshauser/apex-lmu/pull/11), branch
`agent/add-test-recording`. Therefore implementation can build the harness and
use a developer-supplied path, but the canonical green CI job cannot become
required until PR #11 is reviewed and merged with the exact size and hash above.
The harness must fail clearly—never skip green—when the manifest or fixture is
missing.

The recording is intentionally real and private. Before merging PR #11, the
owner must explicitly confirm that publishing its raw contents in a public
repository is acceptable. A checksum proves identity and integrity; it does
not provide consent or anonymization.

## Current implementation truth

The repository already provides valuable lower layers. Preserve and reuse them:

- `bridge/recording.go` enforces metadata and payload bounds, decompression
  limits, monotonic timestamps, CRC-32, full/delta reconstruction, and the
  8 GiB ceiling. `runReplay` passes reconstructed 324,820-byte snapshots into
  the current `decodeSnapshot` and emits production-shaped NDJSON.
- `--replay-speed=0` already removes timing delays; `1..16` scales recorded
  timing. Do not create a second recording parser or normalized JSON fixture.
- replay emits `replay-starting`, telemetry, and `replay-complete`, but replay
  messages have no run ID. A truncated tail emits `replay-partial` and still
  proceeds to `replay-complete`; this may be appropriate for append-safe user
  recovery but cannot count as strict E2E success.
- `electron/lmu-bridge.cjs` pauses live telemetry, launches replay, forwards
  NDJSON to every window, and resumes live mode. It hard-codes speed `1`, does
  not correlate replay messages, and currently treats exit code 0 as complete
  without proving that the completion frame was observed.
- `electron/main.cjs` exposes replay only through a native file picker.
  `preload.cjs` exposes a narrow `startReplay()` call with no path, speed, run
  ID, or strictness option. This is appropriate for users but not automatable.
- `DesktopTelemetryAdapter` ignores self-test frames and maps recording replay
  through the production adapter. Existing tests cover mapping and a mocked
  bridge lifecycle, not the real process-to-renderer chain.
- `.github/workflows/ci.yml` has an excellent real Win32 mapping fixture job. It
  compiles a separate executable named `Le Mans Ultimate.exe`, exercises the
  named mapping/lock/liveness path, records a short synthetic capture, and
  replays it through the bridge. It does not launch Electron or the UI.
- no browser/Electron automation dependency is installed. Playwright's Electron
  driver is a viable option, but it is officially marked experimental and does
  not intercept native dialogs. The design below avoids the dialog and keeps a
  replaceable runner boundary.

This means the missing work is orchestration, observation, assertions, failure
controls, and CI policy—not a new recorder.

## Architecture

### 1. Keep one production data path

The harness must launch the same bridge binary, call `runReplay`, forward the
same NDJSON, use the same preload subscription, and instantiate the same
`DesktopTelemetryAdapter` and React application as a normal replay. Test code
may select the input and observe bounded state; it may not inject already
decoded frames into React or replace `decodeSnapshot`.

Use three layers with distinct failure messages:

| Layer | Purpose | Runs where | Authority |
| --- | --- | --- | --- |
| A: recording contract | Verify manifest/hash, strict reader behavior, decoded facts, and NDJSON protocol | Go tests on Linux and Windows | Fast diagnosis of raw/decode regressions |
| B: source desktop E2E | Launch Electron from the built renderer, drive real replay, inspect user-visible state, prove teardown | `windows-latest`, local Windows | Required PR test for desktop/bridge/adapter changes |
| C: packaged smoke | Launch the produced portable app or unpacked distribution and repeat a compact assertion set | workflow dispatch, release, or desktop-impacting main builds | Proves packaging/resource paths without taxing every edit |

Layer A does not substitute for B, and B does not substitute for the existing
Win32 named-mapping fixture. The two tests validate different official paths:
recorded real LMU bytes versus live kernel-object integration.

### 2. Add a narrow replay launch contract

Extract the replay request from the native-dialog handler into a validated main
process service. The user IPC continues to open a dialog and supplies speed 1.
The E2E launcher supplies an absolute fixture path, speed 0, strict mode, and a
unique run ID before the renderer starts.

Recommended request shape:

```ts
interface ReplayRequest {
  filePath: string
  speed: number       // production 1; tests 0
  strict: boolean     // tests reject partial/truncated input
  runId: string       // 1-64 safe correlation characters
}
```

Do not expose arbitrary paths or test controls through the normal renderer API.
Accept startup arguments only when an explicit E2E environment gate is present,
validate the run ID with the bridge's existing character rule, require an
absolute `.apexrec` path, and canonicalize it before launch. Log only basename,
size, hash, mode, and run ID—not driver/server/path-bearing telemetry.

Candidate launch interface:

```powershell
$env:APEX_E2E = '1'
electron . --apex-e2e-replay="C:\...\fixture.apexrec" `
  --apex-e2e-run-id="replay-$env:GITHUB_RUN_ID-$env:GITHUB_RUN_ATTEMPT"
```

The exact parser belongs in a separately unit-tested module, not at top level in
`main.cjs`. E2E mode must disable automatic update checks and external shell
actions, isolate `userData` to a temporary directory, and never affect the
installed user's data. It must not weaken `sandbox`, `contextIsolation`, or the
permission-deny handlers.

### 3. Correlate the full lifecycle

Extend replay mode—not just self-test mode—with a validated `--run-id`. Every
replay status and telemetry message carries that ID. The Electron manager owns
an explicit state machine:

```text
idle -> starting -> replaying -> complete
                   |    |        ^
                   |    +-> stopped
                   +------> failed
```

`complete` is legal only after all of the following are true:

1. the process was spawned for the current run ID;
2. `replay-starting` with that run ID was observed;
3. at least one expected session/scoring frame and vehicle-telemetry frame were
   accepted by the adapter;
4. `replay-complete` with that run ID was observed;
5. the NDJSON stream closed cleanly and the bridge exited 0;
6. the renderer reported its final assertion snapshot for that same run ID.

An exit 0 without `replay-complete`, a completion event from a previous run,
duplicate completion, mismatched run ID, nonzero exit, spawn error, unreadable
stdout, invalid NDJSON, or deadline expiry is failure. Preserve `replay-partial`
for user recovery but make it terminal failure in strict E2E mode.

Do not synchronize with fixed sleeps. Wait on correlated state transitions with
bounded per-stage and whole-run deadlines. The bridge should remain accelerated
but process every snapshot in order; speed 0 means no pacing, not sampling or
coalescing.

### 4. Observe production state without a test backdoor

Use accessible UI and a minimal, read-only E2E report assembled from the same
state that renders the UI. Preferred split:

- Playwright Electron launches the source app, obtains the first `BrowserWindow`,
  navigates/clicks normal UI, and asserts stable roles, text, and `data-testid`
  attributes only where semantic roles cannot identify a value.
- A test-only reporter records aggregate milestones and a final allowlisted
  projection: run ID, counts, availability transitions, selected car/track,
  numeric ranges, pit state sequence, fuel extrema, lap duration, and fatal-error
  count. It must not serialize raw bridge messages or identity-bearing fields.
- The reporter is available only when `APEX_E2E=1`; normal preload surface and
  TypeScript declarations remain unchanged. Prefer a temp-file NDJSON report or
  a dedicated main-process observer over exposing all application state to the
  renderer.

This dual observation prevents a false green where internal state is right but
the UI is broken, or visible placeholder text looks right while real telemetry
never traversed the adapter.

Playwright is the pragmatic initial driver because it can launch Electron,
await windows/events, inspect the renderer, observe process closure, and run on
Windows. Isolate it behind `scripts/e2e/launch-electron.cjs` so it can be
replaced if its experimental Electron support becomes unreliable. Pin the exact
version and use Playwright's event/locator waiting; do not add browser downloads
that an Electron-only run does not need.

### 5. Put expected facts in a reviewed manifest

Create a sidecar fixture manifest, for example
`data/recordings/apex-lmu-session-2026-07-12-19-23-14TESTAUFNAMERALF.expected.json`.
It should contain only publishable expectations and tolerances:

- fixture format, byte size, SHA-256, capture/writer metadata;
- expected status ordering and scoring-only frame count;
- canonical track, car, and class values after confirming exact decoded strings;
- dry weather and ambient/track temperature ranges;
- minimum evidence for non-zero throttle/brake/steering;
- lap-time range around 99.6 seconds;
- ordered `pit -> driving -> pit` evidence;
- initial/final/minimum/maximum fuel ranges proving consumption and refuel;
- required tyre, wheel, and brake availability/ranges;
- exactly zero opponents for this session;
- fields that must remain absent/unknown rather than becoming zero.

Do not copy the issue's approximate claims blindly. First run a small review
tool over the fixture using the current decoder, print an allowlisted summary,
and have that summary reviewed. Record ranges wide enough for floating-point
representation but narrow enough that a wrong unit or field offset fails.
Manifest changes require the same review as decoder-contract changes; updating
expectations merely to make a failing build green is prohibited.

## Assertion matrix

### Positive path

The canonical E2E test proves:

- fixture size and SHA-256 match before launch;
- the app and exact expected bridge binary start under a fresh run/user-data ID;
- replay starts, reaches completion, exits cleanly, and updates the recorder UI;
- initial no-player/waiting state appears without invented telemetry;
- four scoring-only frames precede player vehicle telemetry, as stated by the
  issue and confirmed from the fixture;
- session, track, car, class, weather, and temperatures eventually appear;
- throttle, brake, and steering each provide non-zero measured samples;
- a lap close to 99.6 seconds is assembled once, not duplicated;
- the ordered lifecycle includes pits, driving, and a later pit state;
- fuel falls while driving and later rises during refueling;
- tyre/wheel/brake measurements become available with physically plausible
  values and units;
- opponent count remains zero—no demo opponent leaks into replay;
- unavailable source fields render as unknown/unavailable, never fabricated
  zero or demo data;
- relevant screens remain responsive and show internally consistent values;
- renderer/main diagnostics contain no fatal error or unhandled rejection;
- closing the app terminates replay and leaves no bridge descendant alive.

Assertions must tolerate gradual capability arrival. Scoring before vehicle
telemetry is correct LMU behavior, not a transient failure.

### Negative controls

Every important detector needs a test that makes it fail:

| Control | Expected result |
| --- | --- |
| Missing or relative fixture path | Rejected before spawning; nonzero test result |
| Size/hash mismatch | Rejected before replay; expected and actual metadata reported safely |
| Corrupted byte in a temp copy | Reader/CRC failure; no completion |
| Truncated temp copy | Strict run fails on `replay-partial`; user-mode recovery remains covered separately |
| Deliberately wrong expected car/lap range | Assertion fails, proving the manifest is consulted |
| Suppressed vehicle telemetry | Capability deadline fails, not a generic global timeout |
| Suppressed completion frame with exit 0 | Lifecycle fails |
| Bridge crash/nonzero exit | Child failure is surfaced with run ID and bounded stderr |
| Old completion/report file | Rejected by run ID and fresh temp-directory ownership |
| Renderer crash or fatal diagnostic | Run fails even if bridge completed |
| Hung bridge or renderer | Whole-run deadline kills the process tree and fails |

Create corrupt and truncated variants in the runner's temporary directory. Do
not commit multiple copies of the private 27 MB recording.

## Work packages and estimates

### A. Fixture admission and expectation manifest — 2–3 days

- review PR #11 privacy consent, path, size, hash, Git attributes, and repository
  impact;
- add a manifest loader with strict schema and SHA/size verification;
- build an allowlisted bridge-summary command used to derive initial expected
  facts;
- add manifest self-tests for wrong hash, bad schema, unsafe tolerances, and
  missing fixture;
- document the rule for replacing or adding a recording without weakening old
  assertions.

### B. Correlated strict bridge replay — 3–4 days

- permit validated run IDs in replay mode and attach them to all messages;
- distinguish clean complete, partial/truncated, decode-warning, and terminal
  reader errors without weakening append-safe interactive replay;
- add cancellation/parent-liveness behavior appropriate to Electron teardown;
- test speed 0 ordering, correlation, completion, partial handling, corruption,
  output failure, and bounded cancellation in Go;
- preserve all existing size, decompression, checksum, and decoder safeguards.

### C. Testable Electron orchestration — 4–6 days

- extract replay request validation and startup parsing from `main.cjs`;
- extend `LmuBridgeManager` with speed/strict/run-ID options and an explicit
  lifecycle state machine;
- isolate E2E `userData`, disable update side effects, and select the fixture
  without a native file dialog;
- surface correlated adapter/renderer milestones to a privacy-safe observer;
- guarantee restart, explicit stop, window close, crash, and timeout cleanup;
- unit-test stale frames, missing completion, spawn/stream failures, and live
  bridge resume semantics with injected fakes.

### D. Desktop runner, facts, and negative controls — 5–7 days

- add a pinned Electron automation driver and reusable Node launcher;
- build once, launch the real bridge and renderer, and use stable roles/locators;
- implement positive aggregate assertions and focused screen assertions;
- implement all negative controls against temporary copies and controlled fault
  injection;
- emit a compact JUnit/JSON summary and failure-only screenshot/trace with no
  raw telemetry or private identity data;
- prove back-to-back runs cannot pass from stale state.

### E. Windows CI and packaged smoke — 2–4 days

- add `test:e2e:windows:replay` and a dedicated Windows workflow job;
- cache npm/Go dependencies but never cache user data or prior E2E reports;
- retain the existing `windows-bridge-self-test` unchanged as an independent
  gate;
- use path filters or a documented desktop-impact predicate so documentation-
  only changes do not always spend the full E2E cost;
- run source E2E on relevant pull requests/main; run the compact packaged smoke
  on workflow dispatch and the release/pre-push-equivalent path;
- enforce per-stage and job timeouts, always upload safe diagnostics on failure,
  and always kill the process tree.

### F. Contributor documentation — 1–3 days

- extend `docs/RECORDINGS.md` with the fixture/manifest/E2E workflow;
- extend `docs/WINDOWS_VALIDATION.md` with what real replay proves and does not
  prove;
- link the command from `bridge/README.md`, root development docs, and CI;
- document privacy, expected runtime, failure interpretation, fixture update
  review, local prerequisites, and cleanup.

Total: **17–27 engineer-days**, rated **XL** because it crosses Go, process
lifecycle, Electron security boundaries, React state, Windows automation, CI,
packaging, and sensitive test data. The estimate excludes waiting for PR #11
consent/review and time spent diagnosing a genuine decoder bug revealed by the
recording.

## Parallelization and sequencing

1. Merge #9 before this desktop-impacting feature so its eventual release has
   complete EN/DE notes and the version gate is active.
2. Review/merge PR #11 or make an explicit decision not to publish the fixture.
   Packages A and the final CI green state depend on that decision.
3. Packages B and C can proceed in parallel after agreeing the lifecycle/run-ID
   protocol. Do not let the Electron test invent a second status model.
4. Package D starts when both strict bridge replay and the E2E observer exist.
5. Package E first lands as non-required/manual while flake and runtime data are
   measured, then becomes required after a defined stability window.
6. Package F lands in the same PR as the commands it documents.

Issue #6 schema design and #8's pure deterministic strategy engine can proceed
alongside the harness. Require this harness before issue #4 claims real
recording/UI acceptance. Use it as a soft release gate for #6, #8, and the
remaining #3 features whenever they consume replayed telemetry or alter the
desktop pipeline.

Issue #5's overlay implementation already landed in v0.1.14. Add an overlay
assertion only if it can be made deterministic on GitHub's single-display
runner; real multi-monitor/DPI/fullscreen validation remains a separate
hardware matrix and must not be falsely claimed by this fixture.

## CI policy

Use GitHub's hosted Windows runner for the standard repeatable job. Pin a named
stable Windows image once the harness is green rather than allowing
`windows-latest` image migration to create unexplained flakes; test image
upgrades in a non-required lane first. A public repository's standard hosted
Windows runner has enough disk for a 27 MB fixture, dependencies, and the built
app, but record actual job duration before choosing the final cadence.

Suggested trigger policy:

| Change | Bridge real replay | Source desktop E2E | Packaged smoke |
| --- | --- | --- | --- |
| Bridge/decoder/recording contract | Required | Required | Main/release |
| Electron/preload/adapter/app state | Not separately required if unchanged | Required | Main/release |
| Relevant React UI/engine | Optional fast summary | Required | Release |
| Packaging/build scripts | Fast bridge check | Required | Required |
| Docs/website only | Skip | Skip | Skip |
| Scheduled/manual | Required | Required with negative controls | Required |

Path filtering is an optimization, not an excuse to miss dependency changes.
Centralize the desktop-impact paths and test that predicate against known file
lists. Always provide `workflow_dispatch` for local/CI reproduction.

## Privacy and security gates

- Obtain explicit publication consent for the exact PR #11 hash.
- Never upload the raw fixture, corrupted copies, bridge NDJSON, screenshots
  containing driver/server identities, or full application state as CI
  artifacts. Repository checkout is the only intended fixture transfer.
- Allowlist report fields and redact filesystem/user names from diagnostics.
- Use fresh temporary directories with owner-only permissions where possible;
  delete working copies in an unconditional cleanup step.
- Keep Electron `sandbox: true`, `contextIsolation: true`, `nodeIntegration:
  false`, permission denial, and narrow preload IPC.
- Validate all startup arguments in the main process. E2E mode must not accept
  arbitrary JavaScript, remote URLs, preload paths, or shell commands.
- The fixture contains measured player data; label it as a test recording, not
  current live telemetry or an anonymized public dataset.

## Validation plan

Run focused checks in this order:

1. Go reader/replay/CLI tests, including real-fixture summary and every malformed
   temp-copy control.
2. `electron/lmu-bridge.node-test.cjs` plus new launch/parser/observer tests.
3. renderer adapter/state tests using the reviewed manifest projection.
4. local Windows source E2E twice consecutively, then once with each negative
   control group.
5. existing real Win32 named-mapping suite.
6. packaged portable/installer smoke on Windows.

Then run the repository gates:

```bash
npm ci
npm run i18n:check
npm run lint
npm run build
npm run build:site
npm run test:all
npm run build:bridge:win
npm audit --audit-level=high
```

The final PR additionally requires a green hosted-Windows replay job, a green
unchanged named-mapping fixture job, proof that failure artifacts contain no
private raw values, and the version/manifests bump required for desktop-impacting
changes.

## Definition of done

- [ ] PR #11's exact fixture has explicit publication approval and matches the
      manifest size/SHA-256 on `main`.
- [ ] One command runs the source desktop replay locally on Windows; a second
      command runs the packaged smoke.
- [ ] Both commands use reconstructed raw bytes through the current
      `decodeSnapshot` and production IPC/adapter/UI paths.
- [ ] Run-ID correlation and event-driven stage deadlines make stale or missing
      output impossible to pass.
- [ ] The reviewed positive assertions cover every fact in issue #13, including
      four scoring-only frames and truthful unknowns.
- [ ] Every listed negative control is automated and demonstrated to fail for
      the intended reason.
- [ ] App, bridge, renderer, and descendants terminate on success, failure,
      timeout, and user stop.
- [ ] The real replay job and existing named-mapping job are separately green on
      Windows.
- [ ] Source and packaged coverage are explicit; neither is claimed by a test
      that launches only the other.
- [ ] CI reports are useful but contain no raw recording, names, server data,
      Steam IDs, or local paths.
- [ ] `docs/RECORDINGS.md`, Windows validation, and contributor commands explain
      how to run, diagnose, and safely update the fixture.
- [ ] Required repository validation and release/version invariants pass.

## Sources

- [GitHub issue #13](https://github.com/ralfboltshauser/apex-lmu/issues/13)
- [Fixture PR #11](https://github.com/ralfboltshauser/apex-lmu/pull/11)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
- [Playwright `ElectronApplication` API](https://playwright.dev/docs/api/class-electronapplication)
- [GitHub-hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- Repository sources: `bridge/recording.go`, `bridge/cli.go`,
  `bridge/shared_memory_fixture_windows_test.go`, `electron/lmu-bridge.cjs`,
  `electron/main.cjs`, `electron/preload.cjs`,
  `src/core/desktop-adapter.ts`, `.github/workflows/ci.yml`,
  `docs/RECORDINGS.md`, and `docs/WINDOWS_VALIDATION.md`.
