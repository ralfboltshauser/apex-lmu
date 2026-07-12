<p align="center">
  <img src="assets/icon.png" width="88" alt="Apex for LMU app icon">
</p>

<h1 align="center">Apex for LMU</h1>

<p align="center">
  Local-first race engineering for Le Mans Ultimate.<br>
  Live telemetry, strategy, analysis, setup safety and a click-through HUD — no account and no cloud.
</p>

<p align="center">
  <a href="https://github.com/ralfboltshauser/apex-lmu/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/ralfboltshauser/apex-lmu/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/ralfboltshauser/apex-lmu/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/ralfboltshauser/apex-lmu?include_prereleases&sort=semver"></a>
  <a href="LICENSE"><img alt="GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0--or--later-9bea3c"></a>
  <img alt="Windows x64" src="https://img.shields.io/badge/platform-Windows%20x64-3b82f6">
  <img alt="Local only" src="https://img.shields.io/badge/data-local%20only-22c55e">
  <a href="https://apex-lmu.openexp.dev"><img alt="Website" src="https://img.shields.io/badge/website-apex--lmu.openexp.dev-b9f34a"></a>
</p>

![Apex command center](artifacts/final-home-truthful.png)

> [!IMPORTANT]
> Apex is a public alpha. The app, native bridge, packaging and deterministic
> Windows fixture path are tested, but compatibility with a current installed
> LMU build has not yet been established. Generated examples are labeled in the
> UI and are never presented as a player's measured data.

## Install

Windows 11 x64 is the currently tested target. Neither build requires
administrator privileges.

1. Download the **[latest Windows installer](https://github.com/ralfboltshauser/apex-lmu/releases/latest)**.
2. Run it and open **Apex for LMU**.
3. Start LMU and enter a session. Apex waits locally for LMU's shared-memory
   interface; it does not inject anything into the game.

A portable ZIP and SHA-256 checksums
are attached to every release.

The alpha installer is unsigned, so Windows SmartScreen may show a warning.
Verify the checksum before running it. Code signing is a release-roadmap item.

### First run and troubleshooting

The first-run wizard verifies the LMU installation path and runs the bundled bridge's isolated protocol self-test before calling the integration ready. The self-test does not require LMU to be running. For live data, start LMU and enter a drivable session; Apex will wait rather than inject into or modify the game.

If connection or setup fails, open **Settings → Diagnostics**:

- Run read-only platform, storage, bridge, and protocol checks.
- Expand a failed check for a targeted fix and its complete technical details.
- View or copy the rotating local JSONL error log.
- Open the log directory or export a support bundle for a GitHub issue.

Support bundles contain Apex version/system metadata, diagnostic results, and Apex process/bridge logs. They exclude telemetry frames and setup contents, redact the user's home directory and common secret fields, and are plain JSON so they can be reviewed before sharing.

## What works today

| Area | Current behavior |
| --- | --- |
| Live session | Reads the `LMU_Data` mapping out of process; shows measured position, laps, speed, controls, fuel, hybrid state, tyres, brakes, weather and standings. |
| Overlay | Separate transparent, always-on-top, click-through Electron window with stale-data clearing when LMU disconnects. |
| Recorded telemetry | Opens LMU DuckDB files read-only and indexes metadata, tables, channels, events, laps and lap times. Converting those channels into full analysis traces is not implemented yet. |
| Analysis | Distance-aligned comparison and evidence-scored coaching engines are implemented. The polished analysis workspace currently uses visibly labeled generated fixtures. |
| Strategy | Deterministic fuel, Virtual Energy, timed-finish, tyre and pit-service models with editable assumptions, alternatives and risk ranges. Automatic calibration from a live recording is not implemented yet. |
| Setups | Imports `.svm` files only into LMU settings folders, creates durable collision backups, handles read-only files and rolls back a failed replacement. |
| Demo | Seeded multiclass telemetry makes every workflow explorable without LMU or a network connection. |

Continuous live recording, recording-to-analysis ingestion, real community
content and freeform overlay positioning are deliberately still marked
unavailable.

## Designed to be useful at 280 km/h

<table>
  <tr>
    <td width="50%">
      <img src="artifacts/final-live-demo.png" alt="Generated live telemetry workspace"><br>
      <sub><strong>Live pit wall.</strong> Traffic, resources, standings and car state in one glance. Screenshot uses the generated demo.</sub>
    </td>
    <td width="50%">
      <img src="artifacts/analyze.png" alt="Telemetry comparison and coaching workspace"><br>
      <sub><strong>Explain the lap.</strong> Generated fixture traces keep the conclusion next to the evidence and confidence that produced it.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="artifacts/strategy.png" alt="Race strategy planning workspace"><br>
      <sub><strong>Stress-test the finish.</strong> User-editable example assumptions, alternative plans and explicit failure scenarios.</sub>
    </td>
    <td width="50%">
      <img src="artifacts/onboarding.png" alt="Apex first-run onboarding"><br>
      <sub><strong>Three-step setup.</strong> The data boundary is explained before Apex touches a file.</sub>
    </td>
  </tr>
</table>

## Local by design

- no login, account or subscription;
- no analytics, telemetry upload or advertising;
- no CDN, remote font or runtime cloud dependency;
- no DLL injection or undocumented process-memory scraping;
- sandboxed renderer with a narrow preload API;
- unprivileged native bridge in a separate process;
- DuckDB recordings opened read-only;
- setup writes are user-initiated, narrow and reversible.

All preferences and databases live in Electron's per-user application-data
folder. Existing setup files are backed up before replacement.

## How LMU integration works

LMU 1.2 introduced an official shared-memory interface and distributes its
header in `Support/SharedMemoryInterface`. Apex targets the mapping named
`LMU_Data` and the SDK's named lock. It never loads code into LMU.

```text
LMU_Data mapping ──> Go bridge.exe ──NDJSON──> Electron main/preload
                                                    │
                          ┌─────────────────────────┼──────────────────────┐
                          ▼                         ▼                      ▼
                    measured UI              overlay window       local engines

LMU DuckDB recording ──read only──> schema/lap/channel inspector
User-selected .svm ──validate + backup + atomic replace──> LMU settings
```

The bridge uses explicit little-endian offsets, bounds checks, finite-number
validation, unit conversions and the SDK lock instead of copying C++ structs
into language-native layouts. It reports LMU's `gameVersion` marker and returns
to a waiting state when the producer disappears.

Every game update still requires the shipped header to be diffed and a real
practice/online-session compatibility pass. See the
**[architecture and patch-day protocol](docs/ARCHITECTURE.md)**.

## Verification

The current tree passes:

- 45 React/domain tests;
- 6 Electron service and rollback tests;
- Linux Go tests plus the complete Win32 bridge suite under Wine;
- a Windows 11 Enterprise 25H2 VM with Secure Boot and TPM 2.0;
- 19 packaged renderer/IPC/shared-memory assertions;
- disconnect cleanup for both main UI and overlay;
- 17 portable lifecycle/package assertions;
- 28 non-elevated NSIS install/launch/uninstall assertions;
- `npm audit` with zero known vulnerabilities.

The external fixture is a separately built test process named `Le Mans
Ultimate.exe`. It exercises Windows mapping and process-lifecycle behavior but
is never included in a release. Read the exact scope and remaining unknowns in
**[Windows validation](docs/WINDOWS_VALIDATION.md)** and the
**[release roadmap](docs/ROADMAP.md)**.

## Build from source

Requirements:

- Node.js 24+
- npm 11+
- Go 1.24+ to rebuild the Windows bridge
- Wine when cross-building the NSIS installer on Linux

```bash
git clone https://github.com/ralfboltshauser/apex-lmu.git
cd apex-lmu
npm ci
npm run dev
```

Run every local test:

```bash
npm run test:all
npm run build
npm run build:site
```

Build Windows artifacts:

```bash
npm run build:desktop:win       # NSIS installer
npm run build:desktop:win:zip   # portable ZIP
npm run build:desktop:win:all   # both
```

Release CI also builds the native reader and runs the Windows named-mapping
contract suite. Installer artifacts are intentionally produced by the manual
release workflow until signing is configured.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/core` | Normalized telemetry model, adapters and versioned repositories |
| `src/engine` | Fuel, VE, strategy, comparison, coaching and setup reasoning |
| `src/views` | End-to-end product workflows |
| `electron` | Sandboxed desktop shell, file services and overlay lifecycle |
| `bridge` | Windows LMU shared-memory sidecar and deterministic fixture tests |
| `apps/website` | Motion-led public website deployed by Vercel |
| `docs` | Product decisions, architecture, validation and roadmap |

## Contributing and security

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), keep
units and provenance explicit, and add deterministic fixtures for integration
changes.

Report vulnerabilities privately through GitHub's **Security → Report a
vulnerability** flow. See [SECURITY.md](SECURITY.md).

## Independence and license

Apex is an unofficial community project. It is not affiliated with or endorsed
by Studio 397, Motorsport Games, the ACO, FIA WEC or Le Mans Ultimate. Product
names and trademarks belong to their respective owners. No game binaries,
headers or commercial setup/reference data are distributed here.

GPL-3.0-or-later. See [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
