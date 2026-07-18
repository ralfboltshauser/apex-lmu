const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const readline = require('node:readline')
const { spawn, spawnSync } = require('node:child_process')
const { LiveSessionStore, constants: { COVERAGE_BIN_M } } = require('../electron/live-session-store.cjs')
const { TelemetryDatabase } = require('../electron/telemetry-database.cjs')
const { RecordingImportService, PROCESSING_VERSION } = require('../electron/recording-import-service.cjs')
const { buildTrackModel } = require('../electron/track-model.cjs')
const { version: appVersion } = require('../package.json')

const root = path.join(__dirname, '..')
const defaultManifest = path.join(root, 'data', 'recordings', 'apex-lmu-session-2026-07-12-19-23-14TESTAUFNAMERALF.expected.json')

function fail(message) { throw new Error(`real recording replay: ${message}`) }
function between(value, range, label) { if (!Number.isFinite(value) || value < range[0] || value > range[1]) fail(`${label} ${value} is outside ${range[0]}..${range[1]}`) }
function atLeast(value, minimum, label) { if (!Number.isFinite(value) || value < minimum) fail(`${label} ${value} is below ${minimum}`) }

function brakeZoneCount(samples) {
  let zones = 0
  let active = null
  let belowSince = null
  const finish = () => {
    if (!active?.length) return
    const braking = active.filter((sample) => sample.brake >= 0.05)
    const duration = active.at(-1).elapsedSeconds - active[0].elapsedSeconds
    if (duration >= 0.12 && braking.length >= 3) zones += 1
    active = null; belowSince = null
  }
  for (const sample of samples) {
    if (!active) { if (sample.brake >= 0.12) active = [sample]; continue }
    active.push(sample)
    if (sample.brake >= 0.05) { belowSince = null; continue }
    belowSince ??= sample.elapsedSeconds
    if (sample.elapsedSeconds - belowSince > 0.16) finish()
  }
  finish()
  return zones
}

async function sha256(file) {
  const hash = crypto.createHash('sha256')
  await new Promise((resolve, reject) => fs.createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('end', resolve).on('error', reject))
  return hash.digest('hex')
}

function emptySummary() {
  return { statuses: [], frames: 0, scoringOnly: 0, firstVehicle: null, tracks: new Set(), layouts: new Set(), cars: new Set(), classes: new Set(), controlOwners: new Set(), controlOwnerFrames: {}, controlOwnerTransitions: [], previousControlOwner: null, opponentMaximum: 0, missingOpponentArrays: 0, air: [Infinity, -Infinity], trackTemp: [Infinity, -Infinity], rain: [Infinity, -Infinity], wetness: [Infinity, -Infinity], controlMaximums: { throttle: 0, brake: 0, absoluteSteering: 0 }, fuel: [Infinity, -Infinity], decreaseFrames: 0, maximumIncrease: 0, lastLaps: new Set(), pits: [], wheelMaximums: { pressurePsi: 0, surfaceTempC: 0, carcassTempC: 0, brakeTempC: 0, wearUsedFraction: 0, absoluteRotationRadSec: 0 }, worldPositionFrames: 0, worldX: [Infinity, -Infinity], worldZ: [Infinity, -Infinity], motionRatios: [], previousMotion: null, completionFrames: null, recordingSha256: null }
}

function range(summary, key, value) { if (Number.isFinite(value)) { summary[key][0] = Math.min(summary[key][0], value); summary[key][1] = Math.max(summary[key][1], value) } }

function accept(summary, message, runId) {
  if (message.source !== 'recording-replay' || message.runId !== runId) fail('uncorrelated bridge output')
  if (message.type === 'status') {
    summary.statuses.push(message.state)
    if (message.state === 'replay-complete') {
      summary.completionFrames = message.frames
      summary.recordingSha256 = message.recordingSha256
    }
    return
  }
  if (message.type !== 'telemetry') return
  summary.frames += 1
  if (!Array.isArray(message.opponents)) summary.missingOpponentArrays += 1
  summary.opponentMaximum = Math.max(summary.opponentMaximum, Array.isArray(message.opponents) ? message.opponents.length : 0)
  if (message.playerTelemetryAvailable === false) summary.scoringOnly += 1
  else if (summary.firstVehicle === null) summary.firstVehicle = summary.frames
  summary.tracks.add(message.session?.track ?? '')
  summary.layouts.add(message.session?.layout ?? '')
  summary.cars.add(message.player?.name ?? '')
  summary.classes.add(message.player?.class ?? '')
  const controlOwner = message.player?.controlOwner ?? 'unknown'
  summary.controlOwners.add(controlOwner)
  summary.controlOwnerFrames[controlOwner] = (summary.controlOwnerFrames[controlOwner] || 0) + 1
  if (summary.previousControlOwner !== controlOwner) {
    summary.controlOwnerTransitions.push({ sequence: message.sequence, owner: controlOwner, playerTelemetryAvailable: message.playerTelemetryAvailable })
    summary.previousControlOwner = controlOwner
  }
  range(summary, 'air', message.session?.airTempC); range(summary, 'trackTemp', message.session?.trackTempC); range(summary, 'rain', message.session?.rain); range(summary, 'wetness', message.session?.wetness)
  if (message.playerTelemetryAvailable === false) return
  const position = message.player?.worldPositionM
  const elapsed = message.player?.gameElapsedSeconds
  if (position && [position.x, position.y, position.z, elapsed].every(Number.isFinite)) {
    summary.worldPositionFrames += 1
    range(summary, 'worldX', position.x); range(summary, 'worldZ', position.z)
    const previous = summary.previousMotion
    if (previous && elapsed > previous.elapsed && elapsed - previous.elapsed < 1) {
      const movement = Math.hypot(position.x - previous.position.x, position.y - previous.position.y, position.z - previous.position.z)
      const expectedMovement = ((message.player.speedKph + previous.speedKph) / 2 / 3.6) * (elapsed - previous.elapsed)
      if (expectedMovement > 0.01) summary.motionRatios.push(movement / expectedMovement)
    }
    summary.previousMotion = { position, elapsed, speedKph: message.player.speedKph }
  }
  summary.controlMaximums.throttle = Math.max(summary.controlMaximums.throttle, Math.abs(message.player?.throttle ?? 0))
  summary.controlMaximums.brake = Math.max(summary.controlMaximums.brake, Math.abs(message.player?.brake ?? 0))
  summary.controlMaximums.absoluteSteering = Math.max(summary.controlMaximums.absoluteSteering, Math.abs(message.player?.steering ?? 0))
  const fuel = message.player?.fuelL
  if (Number.isFinite(fuel)) {
    if (Number.isFinite(summary.previousFuel)) {
      const change = fuel - summary.previousFuel
      if (change < -0.001) summary.decreaseFrames += 1
      if (change > summary.maximumIncrease) summary.maximumIncrease = change
    }
    summary.previousFuel = fuel
    range(summary, 'fuel', fuel)
  }
  if (message.player?.lastLapSeconds > 0) summary.lastLaps.add(message.player.lastLapSeconds)
  const pit = message.player?.inPits ? 'pit' : 'driving'
  if (summary.pits.at(-1) !== pit) summary.pits.push(pit)
  for (const wheel of message.player?.wheels ?? []) {
    summary.wheelMaximums.pressurePsi = Math.max(summary.wheelMaximums.pressurePsi, wheel.pressurePsi ?? 0)
    summary.wheelMaximums.surfaceTempC = Math.max(summary.wheelMaximums.surfaceTempC, ...(wheel.surfaceTempC ?? [0]))
    summary.wheelMaximums.carcassTempC = Math.max(summary.wheelMaximums.carcassTempC, wheel.carcassTempC ?? 0)
    summary.wheelMaximums.brakeTempC = Math.max(summary.wheelMaximums.brakeTempC, wheel.brakeTempC ?? 0)
    summary.wheelMaximums.wearUsedFraction = Math.max(summary.wheelMaximums.wearUsedFraction, 1 - (wheel.wearRemaining ?? 1))
    summary.wheelMaximums.absoluteRotationRadSec = Math.max(summary.wheelMaximums.absoluteRotationRadSec, Math.abs(wheel.rotationRadSec ?? 0))
  }
}

function assertSummary(summary, expected) {
  const exact = (actual, wanted, label) => { if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`${label} mismatch: ${JSON.stringify(actual)} vs ${JSON.stringify(wanted)}`) }
  exact(summary.statuses, expected.statusSequence, 'status sequence')
  exact(summary.frames, expected.telemetryFrames, 'telemetry frame count')
  exact(summary.completionFrames, expected.telemetryFrames, 'completion frame count')
  exact(summary.missingOpponentArrays, 0, 'missing opponent arrays')
  exact(summary.scoringOnly, expected.scoringOnlyFrames, 'scoring-only frame count')
  exact(summary.firstVehicle, expected.firstVehicleTelemetryFrame, 'first vehicle frame')
  exact([...summary.tracks], [expected.track], 'track')
  exact([...summary.layouts], [expected.layout], 'layout')
  exact([...summary.cars], [expected.car], 'car')
  exact([...summary.classes], [expected.carClass], 'car class')
  exact([...summary.controlOwners], expected.controlOwners, 'control owners')
  exact(summary.controlOwnerFrames, expected.controlOwnerFrames, 'control owner frame counts')
  exact(summary.controlOwnerTransitions, expected.controlOwnerTransitions, 'control owner transitions')
  exact(summary.opponentMaximum, expected.opponents, 'opponent count')
  between(summary.air[0], expected.weather.airTempC, 'minimum air temperature'); between(summary.air[1], expected.weather.airTempC, 'maximum air temperature')
  between(summary.trackTemp[0], expected.weather.trackTempC, 'minimum track temperature'); between(summary.trackTemp[1], expected.weather.trackTempC, 'maximum track temperature')
  exact(summary.rain, expected.weather.rain, 'rain range'); exact(summary.wetness, expected.weather.wetness, 'wetness range')
  for (const [key, value] of Object.entries(expected.minimumControlMaximums)) atLeast(summary.controlMaximums[key], value, key)
  for (const lap of summary.lastLaps) between(lap, expected.lastLapSeconds, 'last lap')
  atLeast(summary.lastLaps.size, expected.minimumDistinctLastLaps, 'distinct last laps')
  exact(summary.pits, expected.pitSequence, 'pit sequence')
  between(summary.fuel[0], expected.fuelLiters, 'minimum fuel'); between(summary.fuel[1], expected.fuelLiters, 'maximum fuel')
  atLeast(summary.decreaseFrames, expected.minimumFuelDecreaseFrames, 'fuel decrease frames')
  atLeast(summary.maximumIncrease, expected.minimumRefuelIncreaseLiters, 'refuel increase')
  for (const [key, value] of Object.entries(expected.minimumWheelMaximums)) atLeast(summary.wheelMaximums[key], value, key)
  exact(summary.worldPositionFrames, expected.worldPosition.frames, 'world-position frame count')
  between(summary.worldX[0], expected.worldPosition.xM, 'minimum world X'); between(summary.worldX[1], expected.worldPosition.xM, 'maximum world X')
  between(summary.worldZ[0], expected.worldPosition.zM, 'minimum world Z'); between(summary.worldZ[1], expected.worldPosition.zM, 'maximum world Z')
  const ratios = [...summary.motionRatios].sort((left, right) => left - right)
  const percentile = (value) => ratios[Math.floor((ratios.length - 1) * value)]
  atLeast(ratios.length, expected.worldPosition.minimumMotionComparisons, 'world-motion comparisons')
  between(percentile(0.05), expected.worldPosition.motionRatio, 'world-motion ratio p05')
  between(percentile(0.5), expected.worldPosition.motionRatio, 'world-motion ratio median')
  between(percentile(0.95), expected.worldPosition.motionRatio, 'world-motion ratio p95')
}

async function run(options = {}) {
  const manifestPath = options.manifestPath || defaultManifest
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'))
  if (manifest.schemaVersion !== 1) fail('unsupported manifest schema')
  const recording = path.join(path.dirname(manifestPath), manifest.recording.file)
  const stat = await fsp.stat(recording)
  if (stat.size !== manifest.recording.bytes) fail(`fixture size ${stat.size} does not match ${manifest.recording.bytes}`)
  const hash = await sha256(recording)
  if (hash !== manifest.recording.sha256) fail(`fixture SHA-256 ${hash} does not match manifest`)
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'apex-recording-analysis-'))
  const databasePath = path.join(temporary, 'telemetry.sqlite3')
  let database = await TelemetryDatabase.open({ userDataPath: temporary, databasePath, appVersion })
  let replayChild = null
  const fakeBridge = {
    starts: [],
    ownerId: null,
    acquireReplayOwnership: (ownerId) => { if (fakeBridge.ownerId) return { ok: false, reason: 'busy' }; fakeBridge.ownerId = ownerId; return { ok: true, ownerId } },
    releaseReplayOwnership: (ownerId) => { if (fakeBridge.ownerId !== ownerId) return { ok: false, reason: 'ownership-mismatch' }; fakeBridge.ownerId = null; return { ok: true } },
    startReplay: (filePath, replayOptions) => { fakeBridge.starts.push({ filePath, replayOptions }); return { ok: true, runId: replayOptions.runId } },
    setReplayOutputPaused: (ownerId, runId, paused) => {
      const replay = fakeBridge.starts.at(-1)?.replayOptions
      if (fakeBridge.ownerId !== ownerId) return { ok: false, reason: 'ownership-mismatch' }
      if (replay?.runId !== runId) return { ok: false, reason: 'run-mismatch' }
      if (!replayChild?.stdout) return { ok: false, reason: 'flow-control-unavailable' }
      replayChild.stdout[paused ? 'pause' : 'resume']()
      return { ok: true, paused }
    },
    stopReplay: () => ({ ok: true }),
  }
  let importService = new RecordingImportService({ userDataPath: temporary, appVersion, database, bridgeManager: fakeBridge })
  await importService.initialize()
  const importStarted = await importService.start(recording)
  if (!importStarted.ok || !importStarted.runId) fail(`explicit analysis import could not stage: ${importStarted.reason || 'unknown'}`)
  const runId = importStarted.runId
  let command; let args; let cwd
  const explicitBridge = options.bridge || process.env.APEX_LMU_BRIDGE_EXE
  if (explicitBridge) { command = path.resolve(explicitBridge); args = []; cwd = root }
  else if (process.platform === 'win32') { command = path.join(root, 'bridge', 'bin', 'apex-lmu-bridge.exe'); args = []; cwd = root }
  else { command = 'go'; args = ['run', '.']; cwd = path.join(root, 'bridge') }
  const runner = options.runner || process.env.APEX_LMU_BRIDGE_RUNNER
  let replayPath = recording
  if (runner && /(?:^|[/\\])wine(?:64)?$/.test(runner)) {
    const converted = spawnSync('winepath', ['-w', recording], { encoding: 'utf8' })
    if (converted.status !== 0 || !converted.stdout.trim()) fail('winepath could not translate the fixture path')
    replayPath = converted.stdout.trim()
  }
  args.push(`--replay=${replayPath}`, '--replay-speed=0', '--replay-strict', `--run-id=${runId}`)
  if (runner) { args = [command, ...args]; command = runner }
  const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  replayChild = child
  const summary = emptySummary()
  const finalizedEvents = []
  const analysis = new LiveSessionStore({
    onLapFinalized: (event) => { finalizedEvents.push(event) },
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { if (stderr.length < 8192) stderr += String(chunk).slice(0, 8192 - stderr.length) })
  const timer = setTimeout(() => child.kill(), options.timeoutMs || 120000)
  try {
    for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) { const message = JSON.parse(line); accept(summary, message, runId); analysis.ingest(message); if (!importService.ingest(message)) fail('explicit import rejected its correlated replay frame') }
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })) })
    if (result.code !== 0) fail(`bridge exited with ${result.code ?? result.signal}; ${stderr.trim()}`)
    if (summary.recordingSha256 !== hash) fail(`decoder stream SHA-256 ${summary.recordingSha256 || 'missing'} does not match selected recording`)
    await importService.handleReplayFinished({ runId, complete: summary.statuses.includes('replay-starting') && summary.statuses.includes('replay-complete'), stopped: false, message: 'Replay complete', code: result.code, recordingSha256: summary.recordingSha256 })
    const importState = importService.getState()
    if (importState.status !== 'complete' || importState.duplicate) fail(`explicit import did not commit: ${JSON.stringify(importState)}`)
    await database.close({ requireDurable: true })
    database = await TelemetryDatabase.open({ userDataPath: temporary, databasePath, appVersion })
    importService = new RecordingImportService({ userDataPath: temporary, appVersion, database, bridgeManager: fakeBridge })
    await importService.initialize()
    assertSummary(summary, manifest.expected)
    const sessions = analysis.listSessions()
    exactAnalysis(sessions.length, 1, 'analysis session count')
    const cleanLaps = sessions[0].laps.filter((lap) => lap.state === 'complete' && lap.quality === 'clean' && lap.samplesAvailable)
    if (cleanLaps.length < manifest.expected.measuredRoute.minimumCleanLaps) fail(`clean analysis laps ${cleanLaps.length} is below ${manifest.expected.measuredRoute.minimumCleanLaps}: ${JSON.stringify(sessions[0].laps)}`)
    atLeast(cleanLaps.at(-1).coverage * 100, manifest.expected.measuredRoute.minimumCleanLapCoveragePercent, 'clean analysis lap coverage')
    const cleanPayloads = cleanLaps.map((lap) => analysis.getLap(sessions[0].id, lap.id)).filter((payload) => payload?.samples?.length)
    if (cleanPayloads.length !== cleanLaps.length) fail('one or more clean analysis lap payloads are unavailable')
    const transientBinM = manifest.expected.measuredRoute.transientBinM
    if (!Number.isFinite(transientBinM) || transientBinM <= 0) fail('transient renderer bin width is invalid')
    const transientTotalBins = Math.ceil(sessions[0].track.lengthM / transientBinM)
    const transientRouteBins = new Set(cleanPayloads.slice(-3).flatMap((payload) => payload.samples.map((sample) => Math.max(0, Math.min(transientTotalBins - 1, Math.floor(sample.distanceM / transientBinM))))))
    atLeast(transientRouteBins.size / transientTotalBins * 100, manifest.expected.measuredRoute.minimumCoveragePercent, 'transient analysis route coverage')
    const totalBins = Math.ceil(sessions[0].track.lengthM / COVERAGE_BIN_M)
    const routeBins = new Set(cleanPayloads.flatMap((payload) => payload.samples.map((sample) => Math.max(0, Math.min(totalBins - 1, Math.floor(sample.distanceM / COVERAGE_BIN_M))))))
    atLeast(routeBins.size / totalBins * 100, manifest.expected.measuredRoute.minimumCoveragePercent, 'aggregated analysis route coverage')
    exactAnalysis(brakeZoneCount(cleanPayloads.at(-1).samples), manifest.expected.measuredRoute.brakeZones, 'compacted analysis brake zones')
    const durableSessions = database.listSessions()
    exactAnalysis(durableSessions.length, 1, 'durable analysis session count')
    exactAnalysis(durableSessions[0].source, 'imported-recording', 'durable analysis source')
    if (!durableSessions[0].endedAt || durableSessions[0].importProvenance?.processingVersion !== PROCESSING_VERSION) fail('durable import provenance or finalized session end is missing')
    const eligibleLaps = durableSessions[0].laps.filter((lap) => lap.state === 'complete' && lap.quality === 'clean' && lap.trackModelEligible)
    if (eligibleLaps.length < manifest.expected.measuredRoute.minimumCleanLaps) fail(`durable track-model laps ${eligibleLaps.length} is below ${manifest.expected.measuredRoute.minimumCleanLaps}: ${JSON.stringify(durableSessions[0].laps)}`)
    const durablePayload = database.getLap(durableSessions[0].id, eligibleLaps.at(-1).id)
    if (!durablePayload?.trackModel?.published) {
      const candidate = buildTrackModel({
        trackKey: 'fixture-track',
        trackLengthM: durableSessions[0].track.lengthM,
        laps: finalizedEvents.filter((event) => event.lap.trackModelEligible).map((event) => ({ ...event, payloadHash: event.lap.id })),
      })
      const sources = finalizedEvents.filter((event) => event.lap.trackModelEligible).map((event) => ({
        lap: event.lap.number,
        samples: event.samples.length,
        lateral: event.samples.filter((sample) => Number.isFinite(sample.pathLateralM)).length,
        timed: event.samples.filter((sample) => sample.countLapFlag === 2).length,
        usable: event.samples.filter((sample) => Number.isFinite(sample.pathLateralM) && sample.countLapFlag === 2).length,
        withinEdge: event.samples.filter((sample) => Number.isFinite(sample.pathLateralM) && (!Number.isFinite(sample.trackEdgeM) || Math.abs(sample.trackEdgeM) <= 0.1 || Math.abs(sample.pathLateralM) <= Math.abs(sample.trackEdgeM) + 0.75)).length,
        distanceRange: event.samples.reduce((range, sample) => Number.isFinite(sample.distanceIndexM) ? [Math.min(range[0], sample.distanceIndexM), Math.max(range[1], sample.distanceIndexM)] : range, [Infinity, -Infinity]),
        distanceBins: new Set(event.samples.map((sample) => Math.floor(sample.distanceIndexM / 2))).size,
        edgeRange: event.samples.reduce((range, sample) => Number.isFinite(sample.trackEdgeM) ? [Math.min(range[0], sample.trackEdgeM), Math.max(range[1], sample.trackEdgeM)] : range, [Infinity, -Infinity]),
        negativeEdge: event.samples.filter((sample) => Number.isFinite(sample.trackEdgeM) && sample.trackEdgeM < -0.75).length,
      }))
      fail(`durable track model was not published from the real recording: ${JSON.stringify(candidate && { trackLengthM: durableSessions[0].track.lengthM, coverage: candidate.coverage, seamGapM: candidate.seamGapM, maximumJumpM: candidate.maximumJumpM, published: candidate.published, eligibleLaps: eligibleLaps.length, sources })}`)
    }
    atLeast(durablePayload.trackModel.coverage * 100, manifest.expected.measuredRoute.minimumCoveragePercent, 'durable track-model coverage')
    const beforeDuplicate = durableSessions.map((session) => ({ id: session.id, laps: session.laps.map((lap) => lap.id) }))
    const duplicate = await importService.start(recording)
    if (!duplicate.ok || !duplicate.duplicate || fakeBridge.starts.length !== 1) fail('same recording was not rejected as an idempotent pre-replay duplicate')
    exactAnalysis(JSON.stringify(database.listSessions().map((session) => ({ id: session.id, laps: session.laps.map((lap) => lap.id) }))), JSON.stringify(beforeDuplicate), 'idempotent durable history')
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null) child.kill()
    await importService?.dispose()
    await database?.close({ requireDurable: true })
    await fsp.rm(temporary, { recursive: true, force: true })
  }
  return { ok: true, runId, frames: summary.frames, scoringOnlyFrames: summary.scoringOnly, track: manifest.expected.track, car: manifest.expected.car, class: manifest.expected.carClass, opponents: summary.opponentMaximum, lastLapSeconds: [...summary.lastLaps], pitSequence: summary.pits }
}

function exactAnalysis(actual, expected, label) { if (actual !== expected) fail(`${label} mismatch: ${actual} vs ${expected}`) }

function cliOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--manifest' && argv[index + 1]) options.manifestPath = path.resolve(argv[++index])
    else if (argument.startsWith('--manifest=')) options.manifestPath = path.resolve(argument.slice('--manifest='.length))
    else if (argument === '--timeout-ms' && argv[index + 1]) options.timeoutMs = Number(argv[++index])
    else if (argument.startsWith('--timeout-ms=')) options.timeoutMs = Number(argument.slice('--timeout-ms='.length))
    else fail(`unknown argument ${argument}`)
  }
  return options
}

if (require.main === module) run(cliOptions(process.argv.slice(2))).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exit(1) })

module.exports = { accept, assertSummary, emptySummary, run, cliOptions }
