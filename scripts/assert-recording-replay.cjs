const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const readline = require('node:readline')
const { spawn, spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const defaultManifest = path.join(root, 'data', 'recordings', 'apex-lmu-session-2026-07-12-19-23-14TESTAUFNAMERALF.expected.json')

function fail(message) { throw new Error(`real recording replay: ${message}`) }
function between(value, range, label) { if (!Number.isFinite(value) || value < range[0] || value > range[1]) fail(`${label} ${value} is outside ${range[0]}..${range[1]}`) }
function atLeast(value, minimum, label) { if (!Number.isFinite(value) || value < minimum) fail(`${label} ${value} is below ${minimum}`) }

async function sha256(file) {
  const hash = crypto.createHash('sha256')
  await new Promise((resolve, reject) => fs.createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('end', resolve).on('error', reject))
  return hash.digest('hex')
}

function emptySummary() {
  return { statuses: [], frames: 0, scoringOnly: 0, firstVehicle: null, tracks: new Set(), layouts: new Set(), cars: new Set(), classes: new Set(), opponentMaximum: 0, missingOpponentArrays: 0, air: [Infinity, -Infinity], trackTemp: [Infinity, -Infinity], rain: [Infinity, -Infinity], wetness: [Infinity, -Infinity], controlMaximums: { throttle: 0, brake: 0, absoluteSteering: 0 }, fuel: [Infinity, -Infinity], decreaseFrames: 0, maximumIncrease: 0, lastLaps: new Set(), pits: [], wheelMaximums: { pressurePsi: 0, surfaceTempC: 0, carcassTempC: 0, brakeTempC: 0, wearUsedFraction: 0, absoluteRotationRadSec: 0 }, completionFrames: null }
}

function range(summary, key, value) { if (Number.isFinite(value)) { summary[key][0] = Math.min(summary[key][0], value); summary[key][1] = Math.max(summary[key][1], value) } }

function accept(summary, message, runId) {
  if (message.source !== 'recording-replay' || message.runId !== runId) fail('uncorrelated bridge output')
  if (message.type === 'status') {
    summary.statuses.push(message.state)
    if (message.state === 'replay-complete') summary.completionFrames = message.frames
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
  range(summary, 'air', message.session?.airTempC); range(summary, 'trackTemp', message.session?.trackTempC); range(summary, 'rain', message.session?.rain); range(summary, 'wetness', message.session?.wetness)
  if (message.playerTelemetryAvailable === false) return
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
  const runId = options.runId || `real-recording-${process.pid}`
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
  const summary = emptySummary()
  let stderr = ''
  child.stderr.on('data', (chunk) => { if (stderr.length < 8192) stderr += String(chunk).slice(0, 8192 - stderr.length) })
  const timer = setTimeout(() => child.kill(), options.timeoutMs || 120000)
  try {
    for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) accept(summary, JSON.parse(line), runId)
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })) })
    if (result.code !== 0) fail(`bridge exited with ${result.code ?? result.signal}; ${stderr.trim()}`)
    assertSummary(summary, manifest.expected)
  } finally { clearTimeout(timer); if (child.exitCode === null) child.kill() }
  return { ok: true, runId, frames: summary.frames, scoringOnlyFrames: summary.scoringOnly, track: manifest.expected.track, car: manifest.expected.car, class: manifest.expected.carClass, opponents: summary.opponentMaximum, lastLapSeconds: [...summary.lastLaps], pitSequence: summary.pits }
}

if (require.main === module) run().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exit(1) })

module.exports = { accept, assertSummary, emptySummary, run }
