# Apex for LMU — agent context

This repository is the complete Apex monorepo: Electron desktop app, React UI,
Go LMU bridge, motion website, tests, packaging and release tooling. Preserve
unrelated working-tree changes; multiple agents may share the checkout.

## Product truth

- Apex is local-first, GPL-3.0-or-later and has no account, analytics or cloud
  runtime. Never imply generated/demo data is measured player data.
- Live integration reads LMU's official `LMU_Data` shared-memory mapping out of
  process. Apex installs no in-game DLL and does not scrape undocumented process
  memory. GO Fast's proprietary `GOFastMemoryMap.dll` is not part of this repo.
- LMU may expose scoring before vehicle telemetry. The bridge first trusts
  `mIsPlayer`, then uniquely correlates scoring with the scoring header's
  `mPlayerName`. Session/car/track/weather can therefore appear before fuel,
  controls, tyres and wheels. Never invent unavailable telemetry values.
- The bridge contract is a packed 324,820-byte little-endian payload. Keep
  explicit offsets, SDK locking, bounds/finite checks and producer-liveness
  checks. Do not replace this with native Go struct casts.

## Raw recorder and replay

- **Settings → Data & storage** records a single `.apexrec` file before or
  during LMU. A separate bridge process captures every raw snapshot at 50 Hz
  before decoding, so the live UI is not interrupted.
- `apex-lmu-raw-v1` is append-safe and uses periodic full keyframes, compressed
  XOR deltas, monotonic timestamps and CRC-32. Replay must pass reconstructed
  bytes through the current `decodeSnapshot`; do not record only normalized
  JSON because that cannot reproduce decoder bugs.
- Treat recordings as private. Raw LMU memory can contain driver names, Steam
  IDs, server details and local paths. Apex never uploads them. The writer has
  an 8 GiB limit and readers must retain size, decompression, checksum and
  truncation safeguards.
- Format and developer workflow: `docs/RECORDINGS.md`. Core implementation:
  `bridge/recording.go`. Desktop orchestration: `electron/lmu-bridge.cjs`.

## Repository map

- `src/`: React app, localization, adapters and race-engineering UI.
- `src/core/`: normalized measured-data contracts and local persistence.
- `src/engine/`: deterministic fuel/strategy/analysis logic.
- `electron/`: sandboxed main/preload services, diagnostics and updater.
- `bridge/`: Windows shared-memory reader, raw recorder/replay and fixtures.
- `apps/website/`: Vercel marketing site; version/download names come from the
  root `package.json` through its Vite config.
- `docs/`: architectural, validation and recording references.

## Required validation

For normal changes, run the relevant focused test first, then before publishing:

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

Bridge changes also require a Windows cross-compile and must preserve the real
Windows CI path. That job builds a separate fixture named `Le Mans Ultimate.exe`
and exercises mapping, locking, liveness, recording, clean stop and replay.
Passing Linux unit tests alone is not sufficient evidence for Win32 behavior.

All rendered English/German copy must remain exhaustively matched. The
`i18n:check` gate rejects raw rendered JSX strings. Keep both languages aligned.

## Release invariant

Desktop-impacting pushes are guarded by `.githooks/pre-push`. If relevant files
changed, bump the root version and commit both manifests first:

```bash
npm version patch --no-git-tag-version
```

The hook reruns all tests and builds the Windows installer, portable ZIP,
`latest.yml` and `SHA256SUMS.txt`; do not bypass it. After a successful push:

1. wait for GitHub `verify`, the real Windows bridge job and Vercel;
2. publish with `npm run release:publish`;
3. verify release assets and SHA-256 checksums;
4. confirm `HEAD`, `origin/main` and `vX.Y.Z` match;
5. confirm `https://apex-lmu.openexp.dev` serves the same version and exact
   installer/ZIP filenames.

The updater and website depend on this version synchronization. Do not create a
tag or release from an unverified or different commit.
