# Release roadmap

Apex should earn trust with evidence. A beautiful dashboard is not a race
engineer until every number is traced to a known source, unit, sampling rate,
and failure mode.

## Alpha exit gates

- Diff the bridge structs against the shared-memory header shipped with the
  current LMU build.
- Capture and commit licensed, anonymized fixture snapshots for garage, green,
  rain, FCY, pit entry, pit stop, driver swap, disconnect, and finish states.
- Run a two-hour soak test while racing and verify that bridge CPU use, memory,
  frame loss, and reconnect behavior stay bounded.
- Validate fuel, Virtual Energy, timed-finish, and extra-lap predictions against
  manually audited race recordings for every supported class.
- Convert DuckDB channels into the normalized session model; the alpha importer
  currently performs safe schema discovery and extracts metadata, channel,
  event, lap, and lap-time indexes.
- Persist recorded live samples and overlay layouts through clean shutdown,
  crash recovery, and schema migrations.
- Test setup installation across Steam library locations, track folders, read-
  only folders, name collisions, malformed files, and rollback.
- Complete keyboard-only, screen-reader, 125–200% scaling, ultrawide, and
  reduced-motion acceptance passes.

## Beta exit gates

- Publish provenance and licensing for every community setup and reference lap.
- Establish per-car/per-track baselines from opt-in, explicitly licensed data;
  never imply that generated demo traces are professional references.
- Add regression fixtures for game updates and reject unsupported bridge layouts
  instead of silently displaying plausible but wrong values.
- Ship reproducible, signed Windows builds with checksums and a public security
  reporting process.
- Document the formulas, confidence model, assumptions, and known blind spots
  behind every recommendation.

## Deliberate boundaries

- No DLL injection, process-memory scraping, anti-cheat workarounds, or private
  game APIs.
- No copying commercial setup packs, coaching videos, reference telemetry, or
  branding.
- No cloud account, telemetry upload, advertising, or hidden analytics.
- No strategic certainty where the game provides insufficient information;
  uncertainty is part of the answer.
