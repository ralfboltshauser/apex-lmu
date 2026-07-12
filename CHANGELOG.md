# Changelog

All notable changes to Apex for LMU are documented here. The project follows
[Semantic Versioning](https://semver.org/) while it develops toward a stable
data contract.

## [0.1.0] - 2026-07-12

First public alpha.

### Added

- Windows LMU shared-memory bridge using explicit packed offsets, SDK locking,
  range validation, process liveness and reconnect handling.
- Measured live pit wall for session, player, standings, weather, fuel, hybrid,
  tyres and brakes.
- Transparent, always-on-top, click-through overlay with disconnect cleanup.
- Read-only LMU DuckDB schema, metadata, channel, event and lap inspection.
- Deterministic fuel, Virtual Energy, finish, strategy, comparison, coaching and
  setup-recommendation engines.
- Guarded `.svm` installer with durable backups, read-only handling, atomic
  replacement and rollback.
- Seeded multiclass demo and clearly labeled example workspaces.
- Guided onboarding, local-only settings, accessibility preferences and
  reduced-motion support.
- Per-user NSIS installer and portable Windows ZIP.
- Linux, Wine/Win32 and Windows VM validation suites.

### Known boundaries

- Current real-game LMU compatibility has not yet been established.
- Live-session recording and DuckDB-to-analysis ingestion are not implemented.
- Analysis/coaching workspaces use labeled generated fixtures.
- Overlay widgets cannot yet be freely positioned.
- Windows binaries are not code-signed.

[0.1.0]: https://github.com/ralfboltshauser/apex-lmu/releases/tag/v0.1.0
