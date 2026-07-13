---
title: "Apex capability and provenance matrix"
type: "product-capability-matrix"
status: "release-candidate"
baseline_date: "2026-07-13"
product_model: "GPL local-first account-free"
owner_issue: 3
review_trigger: "LMU header/game update, new approved fixture, or explicit product-scope change"
---

# Apex capability and provenance matrix

“Premium” in Apex means trustworthy user value, not a paid tier or a copy of a
competitor. This matrix is the finite disposition for issue #3. A capability is
shipped only when its inputs, rights, local-first fit, failure state, and test
evidence are known. A missing fixture or right is a stop condition.

Status meanings:

- **Shipped locally** — implemented and covered by the current release gates.
- **Partial** — the named bounded subset is real; the unavailable remainder is
  explicitly absent.
- **Rejected for current scope** — not approved work under issue #3. Reopening
  it requires the evidence or product decision named in the row.
- **Release gate pending** — code exists locally but native/package/current-game
  evidence still has to pass before publication.

## Finite disposition

| User capability | Status | Evidence/source | Current boundary or reopening requirement |
| --- | --- | --- | --- |
| Official live LMU session data | Shipped locally; release gate pending | Official `LMU_Data`, explicit packed offsets, lock/liveness, real raw replay | Diff the installed current header and complete native current-LMU validation |
| Raw lossless capture/replay | Shipped locally | Opt-in `apex-lmu-raw-v1`, raw 50 Hz snapshots, CRC/keyframes/bounds | Private data; never uploaded automatically |
| Durable lifetime distance | Shipped locally; package gate pending | Live official source + local-player ownership + telemetry + monotonic game time | Replay/demo/AI/remote and invalid gaps never count |
| Multi-display overlay | Shipped locally; hardware gate pending | Electron display/window APIs and measured overlay fields | Physical multi-monitor, DPI and borderless LMU acceptance remains |
| Manual fuel-only strategy | Shipped locally | Manual typed assumptions and deterministic coupled timed-race solver | No live calibration, VE, tyres, weather, driver or traffic claim |
| Measured driven route and braking | Shipped locally; native gate pending | Official world position/game time/brake/speed; real fixture gives 99.16% route coverage and 11 zones | A driven line is not surveyed track limits; high-rate history stays in memory unless the user records raw data |
| Live tyre/brake state | Partial | Official player wheel pressure, surface/carcass temperature, wear and brake temperature | No universal target or diagnosis without car/compound/condition/version evidence |
| Setup installation | Shipped locally | User-selected `.svm`, guarded destination, backup, atomic replacement and rollback | Apex does not parse or optimize unknown setup schemas |
| Manual setup reasoning engine | Partial | Explicit symptom/phase/speed report; deterministic small reversible recommendations | It cannot write concrete values without a real versioned `.svm` schema fixture |
| LMU DuckDB inspection | Partial | Read-only capability discovery, metadata, tables, channels, events and lap indexes | No real DuckDB recording exists in the approved fixture set, so channel ingestion/comparison is not approved |
| Historical session/stint explorer | Rejected for current scope | Requires normalized DuckDB/live sample history and a retention/privacy decision | Reopen with a licensed anonymized DuckDB fixture and bounded retention contract |
| Historical real-lap comparison/coaching | Rejected for current scope | Deterministic comparison engine exists, but no approved normalized historic trace | Reopen after normalized ingestion fixtures; current-session measured brake evidence remains available |
| Car-specific tyre/setup advice | Rejected for current scope | No licensed versioned target corpus or supported setup-schema fixture | Reopen with rights, car/compound/condition/version provenance and failure tests |
| Derived CSV/JSON evidence export | Rejected for current scope | No approved portable schema or privacy UX | Raw `.apexrec` remains the lossless explicit export; define redaction and schema first |
| Personal/imported reference laps | Rejected for current scope | No approved portable reference schema or licence metadata contract | Reopen with checksum, units, source, rights and compatibility rules |
| Global/pro leaderboards and reference library | Rejected | Would require accounts, uploads, moderation and redistribution rights | Requires a separate architecture, privacy, operations and legal decision |
| Friends, teams and cloud live timing | Rejected | No account, server or consent system | Requires an explicit product-model change; issue #3 grants no authority |
| Commercial setup packs or “pro” laps | Rejected | No redistribution licence | Only personal or explicitly licensed content can enter Apex |

## Truth states used by the product

| State | Meaning | Example |
| --- | --- | --- |
| `measured` | Direct official LMU value with a validated contract | fuel, brake pressure, world position |
| `imported` | User-selected file with schema/source metadata | DuckDB metadata inspection |
| `manual` | Explicit user input | strategy planning consumption |
| `configured` | Local application preference | overlay display and opacity |
| `assumed` | Declared model parameter, never disguised as a sample | pit-lane loss |
| `generated` | Seeded demonstration only | demo session and example setup cards |
| `unavailable` | No validated input | live Virtual Energy allocation, opponent speed |

Unsupported normalized fields are optional/absent. The official desktop adapter
does not fill missing acceleration, orientation, G force, engine temperatures,
weather direction/humidity/cloud, opponent speed, tyre slip, Virtual Energy,
hybrid power, or damage with credible-looking zero/100 defaults.

## Release evidence for the current local branch

- bilingual structured changelog and post-update history;
- resilient localized numeric inputs;
- strict 18,039-frame real raw replay through the current decoder;
- durable local-player distance ledger with recovery, backups and soak tests;
- deterministic display-targeted overlay lifecycle;
- coupled integer-lap fuel strategy with a golden issue regression;
- measured route/braking reconstruction with physical position/speed proof;
- full renderer, Electron, SQLite, scripts, Go, i18n, build, audit, Windows
  cross-compile, native E2E, packaging and release checks defined in the shared
  release workflow.

Market research is used only to identify user jobs. It does not grant rights or
turn competitor feature counts into Apex requirements. The dated research and
selection rationale remain in the [issue #3 implementation plan](roadmap/issues/08-issue-03-premium-feature-program.md).
