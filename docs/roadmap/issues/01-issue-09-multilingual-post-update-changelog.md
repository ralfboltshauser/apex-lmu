---
title: "Multilingual post-update changelog and release gate"
issue: 9
issue_url: "https://github.com/ralfboltshauser/apex-lmu/issues/9"
issue_state: "open"
implementation_status: "implemented; focused validation passed; packaged Windows update proof pending"
plan_order: 1
phase: 0
workstream: "release-and-update-experience"
complexity: "M"
complexity_score: 3
effort_engineer_days: "6-10"
risk: "medium"
confidence: "high"
depends_on: []
blocks_merge_order: [7, 13, 6, 8, 4, 3]
parallel_with: [7]
source_updated_at: "2026-07-12T12:41:08Z"
source_commit: "9660be5"
last_verified: "2026-07-12"
---

# Issue #9 — multilingual post-update changelog and release gate

## Implementation progress — 2026-07-12

Implemented on `codex/complete-open-issues`:

- one dependency-free bilingual catalog covering v0.1.0–v0.1.14;
- strict schema/SemVer/date/locale-parity validation and deterministic generated
  `CHANGELOG.md`;
- release-body generation from the same catalog and pre-push validation against
  the pushed commit rather than a dirty working tree;
- atomic main-process acknowledgement with corrupt-state preservation,
  downgrade safety, narrow preload IPC, and local diagnostics;
- a post-onboarding, main-window-only reveal with skipped-release handling,
  explicit acknowledgement, focus trapping, Escape support, reduced-motion
  compatibility, immediate language switching, and safe write-failure behavior;
- complete offline version history under Settings → About.

Focused catalog, Electron, renderer-integration, i18n, TypeScript, production
build, and visual Electron smoke checks pass. The GitHub issue remains open until
the final release runs a real packaged Windows N→N+1 update and proves user-data
preservation, one-time acknowledgement, offline history, and release artifact
content.

## Outcome

After Apex starts on a newer version, the main application—not the click-through
overlay—shows a small, accessible “What’s new” experience exactly once. The
same complete release history remains available under Settings. Notes are
bundled with the application in English and German, work offline, and are the
same reviewed content used to publish the GitHub release. A desktop release
cannot pass the pre-push gate unless the current package version has structurally
complete notes in every supported language.

## Evidence from the issue and code

The issue explicitly requires three things: reveal notes after an update,
retain a manual Settings entry point, and reject releases without both EN and
DE content.

The current implementation provides only part of that flow:

- `electron/updater.cjs` receives GitHub `releaseNotes` while an update is
  available or downloaded. That state is in memory and is not a post-install
  history.
- `src/views/SettingsView.tsx` shows those remote notes only when
  `updateState.releaseNotes` is populated. Once the new version starts and is
  “up to date”, the notes are normally absent.
- No service records the last version successfully seen by this user.
- `scripts/pre-push-release.cjs` enforces version bumps, tests, installer/ZIP,
  `latest.yml`, and checksums, but does not inspect release-note content.
- `scripts/publish-release.cjs` uses `gh release create --generate-notes`, so the
  published copy is generated independently of the in-app EN/DE copy.
- `package.json` is at `0.1.13`, while `CHANGELOG.md` contains only `0.1.0`.
  GitHub has published tags `v0.1.0` through `v0.1.13`. There is therefore no
  complete local history to render today.

The updater's remote notes remain useful before download, but they cannot be
the post-update source of truth: the feature must work offline and select the
active UI language. `electron-updater` itself documents that `releaseNotes` may
be a string or a list when `fullChangelog` is enabled; Apex already normalizes
both shapes, but the result is not localized.

## Product rules

1. One reviewed structured catalog is the source of truth for the UI, release
   gate, and GitHub release body.
2. A version is acknowledged only when the user dismisses the reveal or opens
   its detail—not merely when the process starts and crashes.
3. First install must be distinguishable from an update. A fresh user should
   see a compact welcome/release entry only if product design explicitly opts
   in; it must not be falsely described as an update.
4. Skipping multiple releases shows every entry newer than the last
   acknowledged version, newest first.
5. The overlay window never opens the reveal and never records acknowledgement.
6. Release notes are structured React content, not unsanitized remote HTML.
7. EN and DE must have matching semantic structure, not merely non-empty blobs.

## Proposed release-note contract

Create a versioned catalog, for example under `release-notes/`, with one file
per version. JSON keeps the release script independent of the renderer build:

```json
{
  "schemaVersion": 1,
  "version": "0.1.14",
  "releasedAt": "2026-07-12",
  "en": {
    "title": "Safer planning inputs",
    "summary": "A short user-facing summary.",
    "highlights": [
      { "id": "numeric-inputs", "title": "Inputs no longer fail when cleared", "body": "..." }
    ],
    "knownLimitations": []
  },
  "de": {
    "title": "Sicherere Planungseingaben",
    "summary": "Eine kurze Zusammenfassung für Nutzer.",
    "highlights": [
      { "id": "numeric-inputs", "title": "...", "body": "..." }
    ],
    "knownLimitations": []
  }
}
```

The checker must validate:

- exact SemVer match with the root `package.json`;
- one unique entry per version and strictly ordered versions;
- identical locale keys, highlight IDs, ordering, and limitation IDs;
- non-empty user-facing title, summary, and body fields;
- valid dates and schema versions;
- no raw HTML, scriptable links, or unsupported fields;
- the current version's file is included in the packaged renderer;
- the GitHub notes renderer can consume the same schema.

Do not make `CHANGELOG.md`, generated GitHub notes, and the UI three manually
maintained sources. Generate the relevant Markdown section and GitHub body from
the catalog, or make `CHANGELOG.md` an explicitly generated artifact checked for
drift.

## Implementation plan

### 1. Add catalog validation and bootstrap history

- Add a small dependency-free parser/checker under `scripts/` and unit-test it
  with missing locale, mismatched IDs, duplicate versions, malformed SemVer,
  empty text, and current-version mismatch fixtures.
- Add `npm run release-notes:check` and include it in `test:all` or the existing
  i18n gate so local and CI behavior match pre-push behavior.
- Backfill tagged releases `0.1.0`–`0.1.13` from tagged diffs and existing
  GitHub/repository notes. Both languages require human review; a generated
  translation is not sufficient evidence.
- Mark alpha limitations honestly. Historical notes must not retroactively
  claim real-game validation that had not occurred.

### 2. Build a release catalog reader in the renderer

- Validate at build/test time and expose a typed, immutable catalog to React.
- Select `en` or `de` through the existing `I18nProvider`; language switching
  must update an open changelog immediately.
- Add a Settings “What’s new”/“Version history” section that works when offline
  and lists every bundled version.
- Retain the current updater card's remote pre-download notes, but label them as
  update-channel information and do not use them as the historical catalog.

### 3. Persist version acknowledgement in the main process

- Add a narrow main-process service under Electron user data with a versioned
  state such as `lastAcknowledgedVersion`, `firstSeenVersion`, and `updatedAt`.
- Expose only `getWhatsNewState()` and `acknowledgeWhatsNew(version)` through
  validated preload IPC. The renderer must not receive arbitrary filesystem
  access.
- Write atomically using a temporary file plus rename, or store the state in the
  durable application database once #6 exists. Corrupt state must preserve the
  file for diagnostics and safely show the current notes rather than deleting
  history.
- Compare SemVer, not strings. Downgrades and development versions must not
  acknowledge a future version or loop forever.

### 4. Add the post-update reveal

- In the main application route, wait until i18n and first-run onboarding are
  ready. Never mount the reveal for `?overlay=1`.
- If one or more catalog versions are newer than the acknowledged version, open
  a compact dialog/drawer with summary, highlights, limitations, “Done”, and
  “View all in Settings”.
- Trap and restore focus, support Escape, expose a dialog name/description, and
  respect reduced motion. Do not put the primary close target outside the
  keyboard order.
- Acknowledge the highest displayed version only after explicit dismissal or
  detail navigation succeeds.
- Define bootstrap behavior explicitly: on the first release containing this
  feature, existing installations may see that release once; genuinely fresh
  installs receive first-install wording rather than “updated”.

### 5. Gate and publish from the same source

- Run `release-notes:check` in `scripts/pre-push-release.cjs` immediately after
  detecting desktop changes and before the expensive package build.
- Require the pushed commit's current version entry, not an uncommitted working
  tree file. Tests should exercise the script against temporary Git histories.
- Render a GitHub release body from the current catalog entry and change
  `scripts/publish-release.cjs` from `--generate-notes` to `--notes-file`.
- Include clear EN and DE sections in the public body. Generated commit lists
  may be appended, but cannot replace the reviewed user-facing notes.
- Keep the existing version/artifact/checksum invariants unchanged.

### 6. Instrument diagnostics without analytics

- Record local diagnostic events for catalog parse failure, version-state read
  failure, and acknowledgement write failure.
- Do not record the user's reading behavior, send analytics, or add a network
  request. The catalog is bundled and the acknowledgement remains local.

## Acceptance criteria

- Updating an installed Windows build from version N to N+1 and restarting
  shows the N+1 EN or DE note once in the main window.
- Dismissing it, restarting twice, and reopening the overlay does not reshow it.
- Changing language while the reveal/history is open switches every note field.
- Updating from N to N+3 shows N+1, N+2, and N+3 in a deterministic order and
  acknowledges all only after explicit completion.
- A fresh install follows the documented first-install behavior and is never
  falsely told an update was installed.
- Settings exposes the bundled history with networking disabled.
- Missing German content, mismatched highlight IDs, an absent current version,
  or stale generated Markdown fails locally, in CI, and in pre-push.
- `release:publish` uses the reviewed current catalog entry.
- The updater still requires explicit download and explicit restart/install;
  this feature does not weaken consent.

## Validation matrix

| Layer | Required checks |
| --- | --- |
| Catalog | Valid/invalid schemas, SemVer ordering, locale parity, current-version match, deterministic Markdown |
| Renderer | First reveal, focus/keyboard behavior, language switch, reduced motion, manual history, overlay exclusion |
| Electron | Atomic acknowledgement, corrupt/missing state, downgrade, development build, multiple skipped versions |
| Release scripts | Desktop diff with/without note, version bump without note, note without version bump, pushed-commit versus dirty-tree behavior |
| Packaged Windows | Install N, run/acknowledge, update to N+1, restart, preserve user data, offline Settings history |
| Regression | Existing updater events, `latest.yml`, checksum, portable ZIP fallback, i18n structural check |

Run `electron/updater.node-test.cjs` as the focused starting point, add a
dedicated release-note script test, then run the complete repository validation.

## Risks and controls

| Risk | Control |
| --- | --- |
| Three release-note sources drift | Generate UI index, Markdown, and GitHub body from one catalog |
| A crash marks unread notes as seen | Acknowledge only after user action |
| Existing users get a confusing first reveal | Explicit bootstrap/first-install state and copy |
| Remote GitHub Markdown injects UI content | Render bundled structured fields, not remote HTML |
| Contributors bypass the check through another publish path | Put validation in `test:all`, pre-push, and `release:publish` |
| Historical backfill makes false claims | Reconstruct from tagged diffs and preserve the alpha boundary |

## Definition of done

The issue is complete only after a real packaged N→N+1 Windows update proves
the reveal, acknowledgement, Settings history, EN/DE switching, and user-data
preservation, and a deliberately incomplete N+2 note is rejected before release
artifacts are built.

## Primary references

- [electron-builder auto-update documentation](https://www.electron.build/docs/features/auto-update/)
- [`electron-updater` `fullChangelog` behavior](https://www.electron.build/docs/api/electron-updater.class.appupdater/)
- Repository sources: `electron/updater.cjs`, `electron/main.cjs`,
  `electron/preload.cjs`, `src/views/SettingsView.tsx`,
  `scripts/pre-push-release.cjs`, and `scripts/publish-release.cjs`
