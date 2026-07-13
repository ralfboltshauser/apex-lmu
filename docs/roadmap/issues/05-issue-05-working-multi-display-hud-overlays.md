---
title: "Working multi-display HUD overlays"
issue: 5
issue_url: "https://github.com/ralfboltshauser/apex-lmu/issues/5"
issue_state: "open"
implementation_status: "shipped in v0.1.14; hosted native source acceptance passed; packaged/hardware acceptance pending"
plan_order: 5
phase: 1
workstream: "desktop-overlay-runtime"
complexity: "XL"
complexity_score: 5
effort_engineer_days: "10-15"
remaining_effort_engineer_days: "2-5 validation, gap triage, and closure"
risk: "high"
confidence: "medium"
depends_on: []
implemented_by: "PR #12 / commit 9660be5 / v0.1.14"
merge_after: []
soft_dependencies: [4]
parallel_with: [13, 6, 8]
source_updated_at: "2026-07-12T12:31:57Z"
source_commit: "9660be5"
hardening_branch: "codex/complete-open-issues"
last_verified: "2026-07-13"
---

# Issue #5 — working multi-display HUD overlays

## Closure progress — 2026-07-13

The v0.1.14 implementation was reproduced in source Electron: the real display
appeared through preload, `openOverlay()` waited for renderer readiness, a
second transparent window became visible/topmost/non-focusable on the selected
bounds, its waiting state rendered, and close left exactly one main window.

Additional closure hardening on `codex/complete-open-issues`:

- close now waits for the actual `closed` event and returns `closed`, rather
  than returning a stale `ready` state while teardown was still asynchronous;
- display fallback fingerprints now include normalized label and full topology,
  avoiding wrong selection when multiple monitors share resolution/scale;
- widget IPC rejects duplicate IDs, extra fields and invalid normalized bounds;
- Settings shows live connected-display and overlay-window health while
  explaining that no capture permission exists or is required;
- Overlay Studio exposes resolution, scale, rotation and primary state and has
  a renderer contract test for supported/unsupported controls;
- renderer-crash, close/reopen, identical-monitor fallback and strict-config
  negative tests were added;
- the native Windows real-recording E2E now opens the production overlay,
  checks selected display bounds, non-focusable/topmost visibility, live
  opacity/widget updates, measured replay content, waiting cleanup,
  deterministic close and one surviving main window;
- the manual Windows artifact lane repeats that E2E against
  `release/win-unpacked/Apex for LMU.exe`, not only source Electron.

The first hosted Windows replay run then exposed a real constructor-only edge
case: Electron clamped the initial non-resizable `1024×768` overlay to the
taskbar work area (`1024×720`). The manager now reapplies the selected
display's exact full DIP bounds after `BrowserWindow` creation and a unit
regression preserves that contract. The native E2E intentionally remains
strict so the corrective run must prove the real Windows result.

Local evidence is green for 9 OverlayManager tests, 5 focused renderer/model
tests, the source-Electron lifecycle smoke, i18n and typecheck. Hosted Windows
Actions run `29215503714` now proves exact full-display bounds, topmost and
non-focusable state, live configuration/content, cleanup and deterministic
close in source Electron. The complete NSIS + portable build contains the same
manager, renderer, preload and bridge and passes generated SHA-256 verification;
its runtime lane and the physical multi-monitor/borderless matrix remain open.
CI topology is not presented as physical multi-display proof.

> Implementation update (2026-07-12): PR #12 landed this feature on `main` in
> commit `9660be5` and shipped as `v0.1.14`, while GitHub issue #5 remains open.
> Treat the implementation design below as the review baseline. The remaining
> roadmap work is to run its focused and packaged-Windows acceptance matrix,
> record any gaps as follow-up issues, and close #5 only when those checks match
> the issue's acceptance criteria. The “current truth” section records the
> pre-implementation state at `3eb622b`, not the state of `main` today.

## Outcome

The packaged Windows app enumerates the user's real displays, opens a
non-activating click-through HUD on the selected display, persists one validated
layout contract, and reports its actual lifecycle and limitations. Supported
widget choices in the editor match the live overlay. Missing telemetry is shown
as unavailable, not zero. Settings explains that no screen-capture permission
is needed and gives actionable borderless/fullscreen guidance.

## What the screenshot proves

The reported screenshot exactly matches `OverlaysView.tsx`: “Display targeting
unavailable”, “Grid unavailable”, and “Snap unavailable” are rendered as
hard-disabled buttons. This is not evidence of a Windows permission denial.

The code confirms the missing feature:

- `electron/main.cjs:createOverlayWindow` creates a fixed `1280×720` window with
  no `x`, `y`, selected display, or Electron `screen` usage.
- `electron/preload.cjs` and `src/vite-env.d.ts` expose only `openOverlay()`;
  there is no display/config/state API.
- Reopening the overlay calls `show()` and `focus()`, even though a race HUD
  should not steal focus.
- `skipTaskbar` is `false`, focusability is default, and there is no explicit
  close/toggle lifecycle.
- `apex:open-overlay` returns `{ok: true}` immediately. A later load or renderer
  failure cannot reach the caller as a failed open.
- The main process has no overlay-specific `did-fail-load` or
  `render-process-gone` state.
- Closing the main window while the click-through overlay remains can leave an
  effectively invisible application running.

The layout editor and live runtime are also disconnected:

- `OverlaysView.tsx` saves `{enabled, selected, opacity}` under the raw
  `apex:overlay-layout` localStorage key.
- `overlay-main.tsx` never reads it and always renders relative, delta, inputs,
  and fuel.
- The editor enables radar by default, while the current bridge has no truthful
  relative two-dimensional coordinates for a radar.
- `AppSettings.overlays.widgets` already defines a richer versioned layout in
  `src/core/repositories.ts`, but neither the editor nor overlay runtime uses it.
- Session-only scoring can arrive before vehicle telemetry. The overlay frame
  ignores that distinction, so fuel and controls can display zero as if
  measured.

`docs/WINDOWS_VALIDATION.md` proves that the previous packaged window had
topmost, layered, and click-through styles. The same document explicitly says
fullscreen, GPU, DPI, ultrawide, and multi-monitor behavior was not tested.
Those remain real validation unknowns.

## Permission and fullscreen truth

Electron's `screen` module enumerates displays in the main process and reports
coordinates in device-independent pixels. Enumerating or placing a window does
not require screen-capture permission. Apex does not capture the desktop, so a
Settings permission switch would be fictitious.

A separate transparent desktop window cannot be promised above a true
exclusive-fullscreen swap chain. Borderless/windowed composition is the
supportable target without injection, hooks, elevation, or anti-cheat
workarounds—all of which are outside Apex's product boundary. Exclusive
fullscreen should be tested and its result documented, not “fixed” by crossing
that boundary.

Settings should distinguish:

- display enumeration available/unavailable;
- selected display found/fallback applied;
- transparent topmost window ready/failed;
- local config writable/unwritable;
- bridge waiting/session-only/vehicle telemetry;
- borderless supported versus exclusive-fullscreen unverified/unsupported.

## Canonical contracts

### Display descriptor

Expose only renderer-safe fields through preload:

```ts
interface ApexDisplay {
  id: string
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  rotation: 0 | 90 | 180 | 270
  primary: boolean
}
```

Electron display IDs may change with hardware/topology. Persist the ID plus a
safe fallback fingerprint; validate it against the current set every time.

### Overlay configuration

Use one versioned configuration owned by the main process or #6's durable
store. It should include selected-display identity, enabled supported widgets,
opacity, per-widget normalized bounds, click-through state, and schema version.
Do not keep an unrelated localStorage preview beside `AppSettings.overlays`.

Each widget needs an explicit capability and data-source contract:

| Widget | Current data status | First release decision |
| --- | --- | --- |
| Relative | Scoring positions and gaps available before vehicle telemetry | Support, with session-only state |
| Fuel amount | Player vehicle telemetry | Support only when available |
| Delta | Player vehicle/scoring value needs real-game validation | Support with capability guard |
| Inputs/speed/gear | Player vehicle telemetry | Support only when available |
| Tyres | Existing wheel telemetry | Add only with measured unavailable states and tests |
| Radar | No validated relative spatial coordinate | Mark unavailable; #4 can unblock later |
| Blue flag | Current yellow-state field is insufficient | Mark unavailable |

## Implementation plan

### 1. Reproduce and record the real failure matrix

- Capture Windows version, GPU, LMU display mode, monitor topology, scaling,
  where the game runs, whether an Apex window appears in Alt-Tab, and local
  diagnostics.
- Test the existing build in windowed, borderless, and exclusive fullscreen.
- Record facts separately; do not collapse every failure into “permission”.

### 2. Extract a testable `OverlayManager`

Create `electron/overlay-manager.cjs` and inject `screen`, `BrowserWindow`,
filesystem/config store, diagnostics, and timers. It owns:

- display enumeration and topology events;
- selected-display resolution and fallback;
- window creation, bounds, show/close, and readiness;
- canonical configuration persistence;
- lifecycle/error state broadcasting;
- shutdown behavior.

Keep `electron/main.cjs` as orchestration rather than growing more global window
state.

### 3. Add narrow validated IPC

Expose methods such as:

- `getDisplays()`;
- `getOverlayState()`;
- `getOverlayConfig()` / `setOverlayConfig(patch)`;
- `openOverlay()` / `closeOverlay()`;
- `onDisplaysChanged()`, `onOverlayState()`, and `onOverlayConfig()`.

Validate IDs, normalized bounds, opacity, widget IDs, and version in the main
process. The renderer cannot set arbitrary BrowserWindow options or paths.

### 4. Open safely on the chosen display

- Use the selected display's full `bounds`, including negative origins; work
  areas exclude taskbars and are not a full-screen HUD canvas.
- Create with `show: false`, `focusable: false`, `resizable: false`,
  `movable: false`, `fullscreenable: false`, and `skipTaskbar: true`.
- Preserve sandboxing, isolation, disabled Node integration, transparency,
  frameless/no-shadow rendering, always-on-top, and click-through behavior.
- Wait for successful load and a renderer-ready handshake, then use
  `showInactive()` so LMU keeps focus.
- Return success only after readiness; surface load/process failures and timeouts
  through diagnostics and the caller.

### 5. Survive display changes

- Subscribe to `display-added`, `display-removed`, and
  `display-metrics-changed`.
- Reapply exact bounds on resolution, scale, or rotation changes.
- If the chosen display disappears, immediately move to primary, persist the
  fallback, and tell the user which target was lost.
- Never restore a window off-screen based on stale coordinates.

### 6. Connect editor and runtime

- Replace the raw preview key with the canonical config.
- Make enabled supported widgets and opacity update the live window.
- Either implement drag/resize with normalized coordinates and keyboard
  alternatives or continue to label positioning/grid/snap unavailable. Do not
  make read-only X/Y/W/H fields look editable.
- Render the same layout model in preview and runtime, but use conspicuously
  generated fixture values only in preview mode.
- Remove or disable unsupported radar/flag controls until their data contracts
  exist.

### 7. Normalize overlay telemetry truth

- Share a typed overlay view-model builder instead of maintaining unchecked raw
  assumptions in `overlay-main.tsx`.
- Carry source and `playerTelemetryAvailable` through the view model.
- Permit scoring-derived relative content in session-only mode; render fuel,
  controls, wheels, and vehicle metrics as unavailable.
- Exclude self-test; visibly label replay if the product deliberately supports
  it; clear stale values on every non-connected state.
- Do not show a fuel-to-finish claim until the real fuel tracker provides it.

### 8. Add readiness, controls, and lifecycle

- Add display selection, open/test, close, current state, and fullscreen
  guidance to Overlay Studio and Settings.
- Explain that no extra Windows display permission is required.
- Add close/toggle controls and make open idempotent.
- Close the overlay with application shutdown and define main-window-close
  behavior explicitly; do not leave only an unfocusable transparent window.
- Deny unexpected future Chromium web-permission requests by default.

### 9. Validate performance and real Windows behavior

- Measure overlay CPU/GPU/memory and frame handling during the required soak.
- Confirm opening/closing does not start competing bridge processes or leak IPC
  listeners.
- Complete the physical Windows matrix below before changing the compatibility
  claim.

## Acceptance criteria

- Every connected display appears with label, resolution, scale, rotation, and
  primary indication.
- Selecting a secondary monitor opens the HUD at that display's exact bounds,
  including negative coordinate topologies.
- The choice survives restart and safely falls back after hot-unplug.
- Opening never steals LMU focus, creates a taskbar/Alt-Tab entry, or consumes
  mouse input in click-through mode.
- Open/close/reopen is deterministic and cannot leave an invisible orphan
  process.
- Supported editor choices and opacity match the live overlay immediately and
  after restart.
- Unsupported widgets are labeled unavailable rather than rendered from demo
  values.
- Session-only frames never show invented zero vehicle telemetry; disconnect
  clears stale values.
- Load failure, renderer crash, missing display, and config failure produce
  non-success state plus actionable diagnostics.
- Settings truthfully says that display enumeration needs no capture permission.
- Borderless/windowed LMU works non-elevated and without injected code.
- Exclusive-fullscreen behavior is recorded and documented honestly.

## Test and validation matrix

### Automated main-process tests

- One/many displays; negative origin; portrait; virtual/invalid IDs; primary
  change; hot-add/remove; bounds/rotation/100–200% scale change.
- Idempotent open; ready timeout; load failure; renderer crash; close; main app
  shutdown; exact secure BrowserWindow options.
- Valid/invalid config migrations and failed persistence.

### Renderer tests

- Loading/no-display/one/many display states; keyboard/screen-reader selection;
  open/close/error/fallback; layout live update and reload.
- Malformed config; unsupported widgets; session-only/live/replay/disconnect;
  EN/DE and reduced motion.

### Physical packaged Windows acceptance

- Windows 10 and 11; single 1080p; 1440p/4K mixed DPI; portrait; ultrawide;
  displays left/right/above primary; hot-plug; resolution/DPI/rotation changes.
- LMU on primary and secondary monitors in windowed, borderless, and exclusive
  fullscreen; Alt-Tab; minimize/restore; focus changes.
- Nvidia, AMD, and Intel where available; HDR on/off; non-elevated user; an
  EAC-protected online session.
- Overlay opened before LMU, in garage/session-only, while driving, during
  replay, after disconnect, and on shutdown.

## Risks and controls

| Risk | Control |
| --- | --- |
| Exclusive fullscreen hides desktop overlays | Support borderless/windowed, test and document exclusive behavior; no injection |
| Display IDs/topology change | Validate on every launch/event and use primary fallback |
| Mixed-DPI coordinate mistakes | Keep Electron DIP bounds end-to-end and test negative origins/scale changes |
| Editor implies unsupported live widgets | Capability-gate each widget and share one view model |
| Click-through window becomes impossible to close | Main-app close/toggle plus lifecycle state and shutdown cleanup |
| Visual tests pass while real game fails | Physical Windows matrix is a release gate |

## Definition of done

The issue closes only after the original machine class and the packaged matrix
prove display selection, non-focus behavior, live config, session-only truth,
disconnect cleanup, and borderless LMU visibility. A style assertion or Linux
unit test alone is insufficient.

## Primary references

- [Electron `screen` API](https://www.electronjs.org/docs/latest/api/screen/)
- [Electron `Display` structure](https://www.electronjs.org/docs/latest/api/structures/display/)
- [Electron `BrowserWindow` API](https://www.electronjs.org/docs/latest/api/browser-window)
- [Microsoft window/display-mode guidance](https://learn.microsoft.com/en-us/gaming/gdk/docs/gdk-dev/pc-dev/overviews/window-display-modes-and-tcui)
- Repository sources: `electron/main.cjs`, `electron/preload.cjs`,
  `src/views/OverlaysView.tsx`, `src/overlay-main.tsx`,
  `src/core/repositories.ts`, and `docs/WINDOWS_VALIDATION.md`
