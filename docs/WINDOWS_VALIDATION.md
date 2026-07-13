# Windows validation

This document records what was verified for the `v0.1.0` public alpha and,
equally importantly, what was not.

## Environment

- Microsoft Windows 11 Enterprise Evaluation 25H2
- build 26200, 64-bit client
- QEMU/KVM with UEFI Secure Boot and software TPM 2.0
- application launched from an interactive, non-elevated user token
- no Le Mans Ultimate installation or game process

The test-only producer is a separate executable deliberately named `Le Mans
Ultimate.exe` so the production bridge's exact process-name and lifecycle gate
is exercised. It creates the `LMU_Data` mapping, SDK event and named lock and
publishes deterministic packed scoring and telemetry. The producer is built
only from `bridge/cmd/lmu-fixture` and is excluded from release artifacts.

## Results

| Gate | Result |
| --- | --- |
| React/domain suite | 45 passed |
| Electron service/rollback suite | 6 passed |
| Go bridge suite on Linux | passed |
| Complete Windows Go test binary under Wine | passed |
| Packaged renderer, preload, IPC, DuckDB, setup and external mapping | 19/19 passed |
| Producer exit and stale UI/overlay cleanup | passed |
| Portable lifecycle and package integrity | 17/17 passed |
| NSIS per-user install, launch and uninstall | 28/28 passed |
| npm audit | zero known vulnerabilities |

The Windows mapping test decoded the expected fixture version, track, player,
multiclass opponent, 271.4 km/h speed, approximately 24 psi raw wheel pressure
and 165 kPa normalized UI value. It then observed `disconnected` and `waiting`
states after the independent producer exited.

Security checks established:

- `asInvoker` manifest and no requested UI access;
- non-elevated browser, utility, renderer and GPU-process tokens;
- no remote TCP connections from the application process tree;
- visible, topmost, layered and click-through overlay extended styles;
- Secure Boot enabled and TPM 2.0 present/ready;
- no Linux DuckDB native binding in the Windows package;
- x64 bridge and DuckDB PE binaries;
- full GPL license and third-party notices in both packages.

The security evidence was collected in two sessions. WinRM session 0 can query
privileged Secure Boot and TPM state but cannot enumerate the logged-in
desktop. A limited interactive task can inspect the overlay window but cannot
query privileged TPM CIM state. Assertions were therefore combined only across
their explicit session boundary.

## Release artifacts

The final hashes are published in the release's `SHA256SUMS.txt`. The VM deploy
helper downloads an artifact, verifies its expected SHA-256, validates required
native/legal files, stages it, keeps the prior application for rollback and
only then starts the new build.

## What this does not prove

The fixture verifies Windows kernel-object mechanics and Apex's chosen packed
contract. It does not prove that a current LMU build has the same:

- structure offsets, field meanings or update timing;
- lifecycle behavior during garage, replay, pit stop, driver swap or finish;
- behavior under Easy Anti-Cheat or online play;
- fullscreen, GPU, DPI, ultrawide or multi-monitor behavior;
- CPU, memory and frame-loss bounds over a multi-hour race.

Before any LMU version is declared compatible, contributors must diff the
header shipped in `Support/SharedMemoryInterface`, capture licensed fixtures,
run offline practice, run an EAC-protected online session without privilege,
and complete the soak and strategy-audit gates in [ROADMAP.md](ROADMAP.md).

## Automated real-recording boundary

The reusable Windows replay job complements rather than replaces the separate
named-mapping fixture above. It verifies a checked real `LMU_Data` recording
from raw reader through the current decoder, correlated NDJSON, Electron
orchestration, preload/IPC, desktop adapter, main UI, and transparent overlay
without LMU, administrator rights, an injected DLL, or a cloud service. The
source test uses strict accelerated replay, stage deadlines, isolated user
data, safe aggregate assertions, and deterministic teardown. The manual
installer lane repeats it against `release/win-unpacked/Apex for LMU.exe` after
building the NSIS and portable artifacts.

The overlay portion checks display enumeration and selection, exact display
bounds, non-focusable/topmost state, live opacity and supported-widget updates,
measured replay content, unavailable-to-waiting cleanup, deterministic close,
and a single remaining main window. It also creates a separate topmost Win32
window, explicitly raises that window above Apex with `SetWindowPos`, and checks
the native HWND order after Apex's non-activating z-order guard restores the HUD
above it. The main renderer must also reconstruct the measured driven route from
official world coordinates, reach the allowlisted coverage, expose the
allowlisted braking-zone count, and open the matching distance-aligned Analysis
view.

This proves that the recorded session's known facts survive the current Apex
pipeline and that another composed topmost window cannot permanently cover the
HUD. It still does not prove current live LMU offsets, anti-cheat behavior,
physical multi-monitor behavior, true exclusive-fullscreen composition, a
long-race soak, or any car/session absent from that recording. Those remain
independent gates.

## Lifetime-statistics runtime gate

The Windows CI lane also executes the durable-distance acceptance smoke inside
Electron's bundled Node runtime. It creates the SQLite ledger in isolated user
data, integrates 100 km/h for 36 game seconds, closes durably, reopens, verifies
exactly 1,000,000 mm, and validates a SHA-256 backup. This specifically detects
an Electron upgrade or Windows build that lacks a working `node:sqlite` runtime.

It does not replace seeded installer upgrade, forced-process, real LMU, or
main-plus-overlay soak evidence. Those remain release gates for issue #6.
