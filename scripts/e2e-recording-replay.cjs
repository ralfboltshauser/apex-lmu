const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { _electron: electron } = require('playwright-core')

const root = path.join(__dirname, '..')
const manifestPath = path.join(root, 'data', 'recordings', 'apex-lmu-session-2026-07-12-19-23-14TESTAUFNAMERALF.expected.json')
const manifest = require(manifestPath)
const fixturePath = path.join(path.dirname(manifestPath), manifest.recording.file)
const execFileAsync = promisify(execFile)

function fail(message) { throw new Error(`Windows desktop replay E2E: ${message}`) }
function exact(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`) }
function between(value, range, label) { if (!Number.isFinite(value) || value < range[0] || value > range[1]) fail(`${label} ${value} outside ${range.join('..')}`) }
function atLeast(value, minimum, label) { if (!Number.isFinite(value) || value < minimum) fail(`${label} ${value} below ${minimum}`) }

async function fixtureHash() { return crypto.createHash('sha256').update(await fs.readFile(fixturePath)).digest('hex') }

async function assertWindowAbove(aboveHandle, belowHandle, raiseFirst = false) {
  if (!/^\d+$/.test(aboveHandle) || !/^\d+$/.test(belowHandle)) fail('invalid native window handle')
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ApexWindowOrder {
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint command);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
}
'@
$above = [IntPtr]::new([Int64]::Parse("${aboveHandle}"))
$below = [IntPtr]::new([Int64]::Parse("${belowHandle}"))
if (${raiseFirst ? '$true' : '$false'}) {
  if (-not [ApexWindowOrder]::SetWindowPos($above, [IntPtr]::Zero, 0, 0, 0, 0, 0x0013)) { exit 2 }
}
$cursor = [ApexWindowOrder]::GetTopWindow([IntPtr]::Zero)
$aboveRank = -1
$belowRank = -1
$rank = 0
while ($cursor -ne [IntPtr]::Zero -and $rank -lt 10000) {
  if ($cursor -eq $above) { $aboveRank = $rank }
  if ($cursor -eq $below) { $belowRank = $rank }
  $cursor = [ApexWindowOrder]::GetWindow($cursor, 2)
  $rank += 1
}
if ($aboveRank -lt 0 -or $belowRank -lt 0) { exit 3 }
if ($aboveRank -ge $belowRank) { exit 4 }
Write-Output "$aboveRank,$belowRank"
`
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10000 })
  } catch (error) {
    fail(`native z-order assertion failed (${aboveHandle} above ${belowHandle}): ${error.stderr || error.message}`)
  }
}

async function main() {
  if (process.platform !== 'win32') fail('this source-desktop test must run on Windows')
  const stat = await fs.stat(fixturePath)
  exact(stat.size, manifest.recording.bytes, 'fixture bytes')
  exact(await fixtureHash(), manifest.recording.sha256, 'fixture SHA-256')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-replay-e2e-'))
  const runId = `desktop-${process.pid}-${Date.now()}`
  const errors = []
  let application
  try {
    const packagedExecutable = process.env.APEX_E2E_EXECUTABLE ? path.resolve(root, process.env.APEX_E2E_EXECUTABLE) : null
    if (packagedExecutable) await fs.access(packagedExecutable)
    application = await electron.launch({
      ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
      args: packagedExecutable ? [] : ['.'], cwd: root, timeout: 30000,
      env: { ...process.env, APEX_E2E: '1', APEX_E2E_REPLAY: fixturePath, APEX_E2E_USER_DATA: temporary, APEX_E2E_RUN_ID: runId, APEX_E2E_REPLAY_SPEED: '0' },
    })
    application.on('console', (message) => { if (message.type() === 'error') errors.push(`main-console: ${message.text()}`) })
    const page = await application.firstWindow({ timeout: 30000 })
    page.on('pageerror', (error) => errors.push(`renderer: ${error.message}`))
    await page.evaluate(async () => {
      localStorage.setItem('apex:onboarded', 'true')
      localStorage.setItem('apex:language', 'en')
      const state = await window.apexDesktop.getWhatsNewState()
      await window.apexDesktop.acknowledgeWhatsNew(state.currentVersion)
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const lifetimeBefore = await page.evaluate(() => window.apexDesktop.getLifetimeStats())
    exact(lifetimeBefore.totalDistanceMm, 0, 'lifetime distance before replay')
    await page.locator('button.nav-item').filter({ hasText: 'Live session' }).click()
    await page.evaluate((expectedRunId) => {
      const summary = { runId: expectedRunId, statuses: [], frames: 0, scoringOnly: 0, firstVehicle: null, tracks: [], layouts: [], cars: [], classes: [], controlOwners: [], controlOwnerFrames: {}, controlOwnerTransitions: [], previousControlOwner: null, opponents: 0, missingOpponentArrays: 0, air: [Infinity, -Infinity], trackTemp: [Infinity, -Infinity], rain: [Infinity, -Infinity], wetness: [Infinity, -Infinity], throttle: 0, brake: 0, steering: 0, fuel: [Infinity, -Infinity], previousFuel: null, decreaseFrames: 0, maximumIncrease: 0, lastLaps: [], pits: [], wheelMaximums: { pressurePsi: 0, surfaceTempC: 0, carcassTempC: 0, brakeTempC: 0, wearUsedFraction: 0, absoluteRotationRadSec: 0 }, completionFrames: null, recordingStatus: 'idle' }
      const add = (key, value) => { if (!summary[key].includes(value)) summary[key].push(value) }
      const range = (key, value) => { if (Number.isFinite(value)) { summary[key][0] = Math.min(summary[key][0], value); summary[key][1] = Math.max(summary[key][1], value) } }
      window.apexDesktop.onRecordingState((state) => { summary.recordingStatus = state.status })
      window.apexDesktop.onTelemetryMessage((message) => {
        if (!message || message.runId !== expectedRunId || message.source !== 'recording-replay') return
        if (message.type === 'status') { summary.statuses.push(message.state); if (message.state === 'replay-complete') summary.completionFrames = message.frames; return }
        if (message.type !== 'telemetry') return
        summary.frames += 1
        if (!Array.isArray(message.opponents)) summary.missingOpponentArrays += 1
        summary.opponents = Math.max(summary.opponents, Array.isArray(message.opponents) ? message.opponents.length : 0)
        if (message.playerTelemetryAvailable === false) summary.scoringOnly += 1
        else if (summary.firstVehicle === null) summary.firstVehicle = summary.frames
        add('tracks', message.session?.track ?? ''); add('layouts', message.session?.layout ?? ''); add('cars', message.player?.name ?? ''); add('classes', message.player?.class ?? '')
        const controlOwner = message.player?.controlOwner ?? 'unknown'; add('controlOwners', controlOwner); summary.controlOwnerFrames[controlOwner] = (summary.controlOwnerFrames[controlOwner] || 0) + 1
        if (summary.previousControlOwner !== controlOwner) { summary.controlOwnerTransitions.push({ sequence: message.sequence, owner: controlOwner, playerTelemetryAvailable: message.playerTelemetryAvailable }); summary.previousControlOwner = controlOwner }
        range('air', message.session?.airTempC); range('trackTemp', message.session?.trackTempC); range('rain', message.session?.rain); range('wetness', message.session?.wetness)
        if (message.playerTelemetryAvailable === false) return
        summary.throttle = Math.max(summary.throttle, Math.abs(message.player?.throttle ?? 0)); summary.brake = Math.max(summary.brake, Math.abs(message.player?.brake ?? 0)); summary.steering = Math.max(summary.steering, Math.abs(message.player?.steering ?? 0))
        const fuel = message.player?.fuelL
        if (Number.isFinite(fuel)) { if (Number.isFinite(summary.previousFuel)) { const change = fuel - summary.previousFuel; if (change < -0.001) summary.decreaseFrames += 1; summary.maximumIncrease = Math.max(summary.maximumIncrease, change) } summary.previousFuel = fuel; range('fuel', fuel) }
        if (message.player?.lastLapSeconds > 0 && !summary.lastLaps.includes(message.player.lastLapSeconds)) summary.lastLaps.push(message.player.lastLapSeconds)
        const pit = message.player?.inPits ? 'pit' : 'driving'; if (summary.pits.at(-1) !== pit) summary.pits.push(pit)
        for (const wheel of message.player?.wheels ?? []) { summary.wheelMaximums.pressurePsi = Math.max(summary.wheelMaximums.pressurePsi, wheel.pressurePsi ?? 0); summary.wheelMaximums.surfaceTempC = Math.max(summary.wheelMaximums.surfaceTempC, ...(wheel.surfaceTempC ?? [0])); summary.wheelMaximums.carcassTempC = Math.max(summary.wheelMaximums.carcassTempC, wheel.carcassTempC ?? 0); summary.wheelMaximums.brakeTempC = Math.max(summary.wheelMaximums.brakeTempC, wheel.brakeTempC ?? 0); summary.wheelMaximums.wearUsedFraction = Math.max(summary.wheelMaximums.wearUsedFraction, 1 - (wheel.wearRemaining ?? 1)); summary.wheelMaximums.absoluteRotationRadSec = Math.max(summary.wheelMaximums.absoluteRotationRadSec, Math.abs(wheel.rotationRadSec ?? 0)) }
      })
      window.__apexReplaySummary = summary
    }, runId)
    const displays = await page.evaluate(() => window.apexDesktop.getDisplays())
    atLeast(displays.length, 1, 'connected displays')
    const selectedDisplay = displays[0]
    await page.evaluate(async (displayId) => {
      const config = await window.apexDesktop.getOverlayConfig()
      await window.apexDesktop.setOverlayConfig({ displayId, opacity: 0.61, widgets: config.widgets.map((widget) => ({ ...widget, enabled: widget.id !== 'delta' })) })
    }, selectedDisplay.id)
    const overlayOpen = await page.evaluate(() => window.apexDesktop.openOverlay())
    if (!overlayOpen.ok || overlayOpen.state.status !== 'ready') fail(`overlay did not open: ${JSON.stringify(overlayOpen)}`)
    const overlayPage = application.windows().find((window) => window.url().includes('overlay=1'))
    if (!overlayPage) fail('overlay BrowserWindow was not observable')
    overlayPage.on('pageerror', (error) => errors.push(`overlay-renderer: ${error.message}`))
    const overlayRuntime = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((window) => !window.isFocusable()).map((window) => ({ bounds: window.getBounds(), visible: window.isVisible(), alwaysOnTop: window.isAlwaysOnTop() })))
    exact(overlayRuntime.length, 1, 'overlay window count')
    exact(overlayRuntime[0].bounds, selectedDisplay.bounds, 'overlay display bounds')
    exact(overlayRuntime[0].visible, true, 'overlay visibility')
    exact(overlayRuntime[0].alwaysOnTop, true, 'overlay always-on-top state')
    const zOrderFixture = await application.evaluate(async ({ BrowserWindow }, bounds) => {
      const overlay = BrowserWindow.getAllWindows().find((window) => !window.isFocusable())
      if (!overlay) throw new Error('overlay window missing')
      const competitor = new BrowserWindow({ ...bounds, show: false, frame: false, alwaysOnTop: true, backgroundColor: '#102030' })
      await competitor.loadURL('data:text/html,<body style="margin:0;background:%23102030"></body>')
      competitor.setAlwaysOnTop(true, 'screen-saver')
      competitor.show()
      competitor.moveTop()
      const nativeHandle = (window) => {
        const handle = window.getNativeWindowHandle()
        return handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE())
      }
      return { competitorId: competitor.id, competitorHandle: nativeHandle(competitor), overlayHandle: nativeHandle(overlay) }
    }, selectedDisplay.bounds)
    // Reproduce the reported failure by placing another topmost HWND above the
    // already-topmost overlay, then prove the Windows guard restores Apex's
    // relative z-order without focusing it.
    await assertWindowAbove(zOrderFixture.competitorHandle, zOrderFixture.overlayHandle, true)
    await new Promise((resolve) => setTimeout(resolve, 750))
    await assertWindowAbove(zOrderFixture.overlayHandle, zOrderFixture.competitorHandle)
    await application.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), zOrderFixture.competitorId)
    const started = await page.evaluate(() => window.apexDesktop.startReplayForTest())
    if (!started.ok || started.runId !== runId) fail(`replay did not start: ${JSON.stringify(started)}`)
    const trackVisible = page.getByText(manifest.expected.track, { exact: true }).first().waitFor({ state: 'visible', timeout: 90000 })
    const carVisible = page.getByText(manifest.expected.car, { exact: true }).first().waitFor({ state: 'visible', timeout: 90000 })
    const overlayReplayVisible = overlayPage.getByText('REPLAY', { exact: true }).waitFor({ state: 'visible', timeout: 90000 })
    const overlayMeasuredFuel = overlayPage.waitForFunction(() => document.querySelector('.race-overlay__fuel strong')?.textContent?.includes('L'), null, { timeout: 90000 })
    const overlayLiveState = Promise.all([overlayReplayVisible, overlayMeasuredFuel]).then(async () => ({
      opacity: await overlayPage.locator('.race-overlay').evaluate((element) => getComputedStyle(element).opacity),
      deltaWidgets: await overlayPage.locator('.overlay-slot--delta').count(),
      fuelWidgets: await overlayPage.locator('.overlay-slot--fuel').count(),
    }))
    const measuredRouteVisible = page.getByText('Locally reconstructed driven line', { exact: true }).waitFor({ state: 'visible', timeout: 90000 })
    const measuredRouteComplete = page.waitForFunction(({ brakeZones, coverage }) => {
      const badge = document.querySelector('.live-measured-map-card .badge')?.textContent ?? ''
      const percent = Number.parseInt(badge.match(/(\d+)%/)?.[1] ?? '', 10)
      return document.querySelectorAll('.measured-brake-zones li').length === brakeZones
        && badge.includes('Measured route')
        && Number.isFinite(percent)
        && percent >= coverage
    }, { brakeZones: manifest.expected.measuredRoute.brakeZones, coverage: manifest.expected.measuredRoute.minimumCoveragePercent }, { timeout: 90000 })
    const measuredLiveState = Promise.all([measuredRouteVisible, measuredRouteComplete]).then(async () => ({
      brakeZones: await page.locator('.measured-brake-zones li').count(),
      badge: await page.locator('.live-measured-map-card .badge').textContent(),
    }))
    await page.waitForFunction(() => ['complete', 'error'].includes(window.__apexReplaySummary.recordingStatus), null, { timeout: 120000 })
    const [, , liveOverlay, measuredLive] = await Promise.all([trackVisible, carVisible, overlayLiveState, measuredLiveState])
    exact(liveOverlay.opacity, '0.61', 'live overlay opacity')
    exact(liveOverlay.deltaWidgets, 0, 'disabled overlay widget count')
    exact(liveOverlay.fuelWidgets, 1, 'enabled overlay widget count')
    exact(measuredLive.brakeZones, manifest.expected.measuredRoute.brakeZones, 'measured live brake zones')
    if (!measuredLive.badge.includes('Measured route') || !measuredLive.badge.includes(`${manifest.expected.measuredRoute.minimumCoveragePercent}%`)) fail(`measured route badge: ${measuredLive.badge}`)
    const summary = await page.evaluate(() => window.__apexReplaySummary)
    if (summary.recordingStatus !== 'complete') fail(`recording state ended as ${summary.recordingStatus}`)
    exact(summary.statuses, manifest.expected.statusSequence, 'status sequence'); exact(summary.frames, manifest.expected.telemetryFrames, 'frames'); exact(summary.completionFrames, manifest.expected.telemetryFrames, 'completion frames'); exact(summary.scoringOnly, manifest.expected.scoringOnlyFrames, 'scoring-only frames'); exact(summary.firstVehicle, manifest.expected.firstVehicleTelemetryFrame, 'first vehicle frame')
    exact(summary.tracks, [manifest.expected.track], 'track'); exact(summary.layouts, [manifest.expected.layout], 'layout'); exact(summary.cars, [manifest.expected.car], 'car'); exact(summary.classes, [manifest.expected.carClass], 'class'); exact(summary.controlOwners, manifest.expected.controlOwners, 'control owners'); exact(summary.controlOwnerFrames, manifest.expected.controlOwnerFrames, 'control owner frame counts'); exact(summary.controlOwnerTransitions, manifest.expected.controlOwnerTransitions, 'control owner transitions'); exact(summary.opponents, 0, 'opponents'); exact(summary.missingOpponentArrays, 0, 'opponent arrays')
    between(summary.air[0], manifest.expected.weather.airTempC, 'air min'); between(summary.air[1], manifest.expected.weather.airTempC, 'air max'); between(summary.trackTemp[0], manifest.expected.weather.trackTempC, 'track min'); between(summary.trackTemp[1], manifest.expected.weather.trackTempC, 'track max'); exact(summary.rain, [0, 0], 'rain'); exact(summary.wetness, [0, 0], 'wetness')
    atLeast(summary.throttle, manifest.expected.minimumControlMaximums.throttle, 'throttle'); atLeast(summary.brake, manifest.expected.minimumControlMaximums.brake, 'brake'); atLeast(summary.steering, manifest.expected.minimumControlMaximums.absoluteSteering, 'steering'); for (const lap of summary.lastLaps) between(lap, manifest.expected.lastLapSeconds, 'last lap'); atLeast(summary.lastLaps.length, manifest.expected.minimumDistinctLastLaps, 'last laps'); exact(summary.pits, manifest.expected.pitSequence, 'pit sequence'); between(summary.fuel[0], manifest.expected.fuelLiters, 'fuel min'); between(summary.fuel[1], manifest.expected.fuelLiters, 'fuel max'); atLeast(summary.decreaseFrames, manifest.expected.minimumFuelDecreaseFrames, 'fuel decreases'); atLeast(summary.maximumIncrease, manifest.expected.minimumRefuelIncreaseLiters, 'refuel')
    for (const [key, value] of Object.entries(manifest.expected.minimumWheelMaximums)) atLeast(summary.wheelMaximums[key], value, key)
    const lifetimeAfter = await page.evaluate(() => window.apexDesktop.getLifetimeStats())
    exact(lifetimeAfter.totalDistanceMm, 0, 'lifetime distance after replay')
    await page.locator('button.nav-item').filter({ hasText: 'Analyze' }).click()
    await page.getByText('Measured braking by lap distance', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    exact(await page.locator('.measured-zone-list li').count(), manifest.expected.measuredRoute.brakeZones, 'measured analysis brake zones')
    await overlayPage.locator('.overlay-waiting').waitFor({ state: 'visible', timeout: 10000 })
    const overlayClosed = await page.evaluate(() => window.apexDesktop.closeOverlay())
    exact(overlayClosed.state.status, 'closed', 'overlay close state')
    exact(application.windows().length, 1, 'remaining window count')
    await page.locator('button.nav-item').filter({ hasText: 'Settings' }).click()
    await page.getByText('Settings', { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 })
    if (errors.length) fail(errors.join('; '))
    console.log(JSON.stringify({ ok: true, mode: packagedExecutable ? 'packaged' : 'source', runId, frames: summary.frames, scoringOnlyFrames: summary.scoringOnly, pitSequence: summary.pits, ui: ['track', 'car', 'measured-route', 'measured-braking-analysis', 'overlay-window', 'overlay-replay', 'settings-responsive'] }))
  } finally {
    await application?.close().catch(() => {})
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error.message); process.exit(1) })
