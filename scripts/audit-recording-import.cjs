const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { LmuBridgeManager } = require('../electron/lmu-bridge.cjs')
const { getDriverReview } = require('../electron/driver-review-service.cjs')
const { buildDriverReview, STATUS_CODES } = require('../electron/driver-review.cjs')
const { constants: { QUALITY_POLICY_VERSION } } = require('../electron/live-session-store.cjs')
const { RecordingImportService, PROCESSING_VERSION, RECORDING_FORMAT, MAX_RECORDING_BYTES } = require('../electron/recording-import-service.cjs')
const { TelemetryDatabase } = require('../electron/telemetry-database.cjs')
const { version: appVersion } = require('../package.json')

const root = path.join(__dirname, '..')
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000
const RECORDING_ENV = 'APEX_RECORDING_AUDIT_FILE'

const usage = `Usage:
  node scripts/audit-recording-import.cjs --recording /absolute/session.apexrec [options]
  ${RECORDING_ENV}=/absolute/session.apexrec node scripts/audit-recording-import.cjs [options]

Options:
  --expect-frames N                 Require an exact decoded telemetry-frame count
  --expect-sessions N               Require an exact durable session count
  --expect-laps N                   Require an exact durable lap count
  --expect-complete-laps N          Require an exact complete-lap count
  --expect-clean-laps N             Require an exact clean-lap count
  --expect-officially-timed-laps N  Require an exact LMU-published-time lap count
  --expect-reference-laps N         Require an exact reference-eligible lap count
  --expect-replayable-laps N        Require an exact replayable-payload/lap count
  --min-single-car-frames N         Optional minimum frames with no opponents (default: 0)
  --min-multi-car-frames N          Optional minimum frames with opponents (default: 0)
  --min-driver-review-ready N       Optional minimum sessions with a ready review (default: 0)
  --min-driver-review-hotspots N    Optional minimum recurring hotspots across reviews (default: 0)
  --timeout-ms N                    Replay-completion timeout (default: 1800000)
  --bridge /absolute/bridge         Use a compiled current bridge instead of go run
  --runner COMMAND                  Run the compiled bridge through a runner such as wine

Environment equivalents:
  APEX_RECORDING_EXPECT_FRAMES, APEX_RECORDING_EXPECT_SESSIONS,
  APEX_RECORDING_EXPECT_LAPS, APEX_RECORDING_EXPECT_COMPLETE_LAPS,
  APEX_RECORDING_EXPECT_CLEAN_LAPS, APEX_RECORDING_EXPECT_OFFICIALLY_TIMED_LAPS,
  APEX_RECORDING_EXPECT_REFERENCE_LAPS,
  APEX_RECORDING_EXPECT_REPLAYABLE_LAPS, APEX_RECORDING_MIN_SINGLE_CAR_FRAMES,
  APEX_RECORDING_MIN_MULTI_CAR_FRAMES, APEX_RECORDING_MIN_DRIVER_REVIEW_READY,
  APEX_RECORDING_MIN_DRIVER_REVIEW_HOTSPOTS, APEX_RECORDING_AUDIT_TIMEOUT_MS,
  APEX_LMU_BRIDGE_EXE, APEX_LMU_BRIDGE_RUNNER
`

class AuditError extends Error {
  constructor(code, detail = null) {
    super(code)
    this.name = 'AuditError'
    this.code = code
    this.detail = detail
  }
}

function fail(code, detail = null) { throw new AuditError(code, detail) }

function createAuditDiagnostics() {
  let detail = null
  return {
    record(level, component, event, _message, fields = {}) {
      if (level !== 'error') return
      const error = typeof fields.error === 'string' ? fields.error : ''
      if (component === 'recording-import' && event === 'staging-write-failed') {
        if (fields.kind === 'session' && error === 'Private staging rejected a session write (not-found).') detail = 'empty-session-finalization'
        else if (fields.kind === 'lap') detail = 'lap-staging-write'
        else if (fields.kind === 'session') detail = 'session-staging-write'
        else if (['flow-control', 'backpressure-limit', 'payload-limit', 'import-limit'].includes(fields.kind)) detail = fields.kind
        else detail = 'staging-write'
      } else if (component === 'recording-import' && event === 'ingest-failed') detail = 'session-accumulator'
      else if (component === 'telemetry-history' && event === 'write-failed') {
        if (error === 'lap timing provenance conflicts with eligibility or time') detail = 'lap-timing-provenance'
        else if (error === 'lap timing provenance is invalid') detail = 'lap-timing-source'
        else if (error === 'lap quality policy version is invalid') detail = 'lap-quality-policy'
        else detail = 'lap-database-write'
      } else if (component === 'telemetry-history' && event === 'session-update-failed') detail = 'session-database-write'
    },
    failureDetail() { return detail },
  }
}

function integer(value, code, { minimum = 0 } = {}) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum) fail(code)
  return parsed
}

function argumentValue(argv, index, name) {
  const argument = argv[index]
  if (argument === name) {
    if (!argv[index + 1]) fail('invalid-arguments')
    return { value: argv[index + 1], consumed: 2 }
  }
  const prefix = `${name}=`
  if (argument.startsWith(prefix) && argument.length > prefix.length) return { value: argument.slice(prefix.length), consumed: 1 }
  return null
}

function parseCli(argv, env = process.env) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  const options = {
    recording: env[RECORDING_ENV],
    expectFrames: integer(env.APEX_RECORDING_EXPECT_FRAMES, 'invalid-expected-frames'),
    expectSessions: integer(env.APEX_RECORDING_EXPECT_SESSIONS, 'invalid-expected-sessions'),
    expectLaps: integer(env.APEX_RECORDING_EXPECT_LAPS, 'invalid-expected-laps'),
    expectCompleteLaps: integer(env.APEX_RECORDING_EXPECT_COMPLETE_LAPS, 'invalid-expected-complete-laps'),
    expectCleanLaps: integer(env.APEX_RECORDING_EXPECT_CLEAN_LAPS, 'invalid-expected-clean-laps'),
    expectOfficiallyTimedLaps: integer(env.APEX_RECORDING_EXPECT_OFFICIALLY_TIMED_LAPS, 'invalid-expected-officially-timed-laps'),
    expectReferenceLaps: integer(env.APEX_RECORDING_EXPECT_REFERENCE_LAPS, 'invalid-expected-reference-laps'),
    expectReplayableLaps: integer(env.APEX_RECORDING_EXPECT_REPLAYABLE_LAPS, 'invalid-expected-replayable-laps'),
    minimumSingleCarFrames: integer(env.APEX_RECORDING_MIN_SINGLE_CAR_FRAMES, 'invalid-single-car-minimum') ?? 0,
    minimumMultiCarFrames: integer(env.APEX_RECORDING_MIN_MULTI_CAR_FRAMES, 'invalid-multi-car-minimum') ?? 0,
    minimumDriverReviewReady: integer(env.APEX_RECORDING_MIN_DRIVER_REVIEW_READY, 'invalid-driver-review-ready-minimum') ?? 0,
    minimumDriverReviewHotspots: integer(env.APEX_RECORDING_MIN_DRIVER_REVIEW_HOTSPOTS, 'invalid-driver-review-hotspot-minimum') ?? 0,
    timeoutMs: integer(env.APEX_RECORDING_AUDIT_TIMEOUT_MS, 'invalid-timeout', { minimum: 1000 }) ?? DEFAULT_TIMEOUT_MS,
    bridge: env.APEX_LMU_BRIDGE_EXE,
    runner: env.APEX_LMU_BRIDGE_RUNNER,
  }
  const flags = [
    ['--recording', 'recording', (value) => value],
    ['--expect-frames', 'expectFrames', (value) => integer(value, 'invalid-expected-frames')],
    ['--expect-sessions', 'expectSessions', (value) => integer(value, 'invalid-expected-sessions')],
    ['--expect-laps', 'expectLaps', (value) => integer(value, 'invalid-expected-laps')],
    ['--expect-complete-laps', 'expectCompleteLaps', (value) => integer(value, 'invalid-expected-complete-laps')],
    ['--expect-clean-laps', 'expectCleanLaps', (value) => integer(value, 'invalid-expected-clean-laps')],
    ['--expect-officially-timed-laps', 'expectOfficiallyTimedLaps', (value) => integer(value, 'invalid-expected-officially-timed-laps')],
    ['--expect-reference-laps', 'expectReferenceLaps', (value) => integer(value, 'invalid-expected-reference-laps')],
    ['--expect-replayable-laps', 'expectReplayableLaps', (value) => integer(value, 'invalid-expected-replayable-laps')],
    ['--min-single-car-frames', 'minimumSingleCarFrames', (value) => integer(value, 'invalid-single-car-minimum')],
    ['--min-multi-car-frames', 'minimumMultiCarFrames', (value) => integer(value, 'invalid-multi-car-minimum')],
    ['--min-driver-review-ready', 'minimumDriverReviewReady', (value) => integer(value, 'invalid-driver-review-ready-minimum')],
    ['--min-driver-review-hotspots', 'minimumDriverReviewHotspots', (value) => integer(value, 'invalid-driver-review-hotspot-minimum')],
    ['--timeout-ms', 'timeoutMs', (value) => integer(value, 'invalid-timeout', { minimum: 1000 })],
    ['--bridge', 'bridge', (value) => value],
    ['--runner', 'runner', (value) => value],
  ]
  for (let index = 0; index < argv.length;) {
    const argument = argv[index]
    let matched = false
    for (const [name, key, convert] of flags) {
      const candidate = argumentValue(argv, index, name)
      if (!candidate) continue
      options[key] = convert(candidate.value)
      index += candidate.consumed
      matched = true
      break
    }
    if (matched) continue
    if (!argument.startsWith('-') && !options.recording) {
      options.recording = argument
      index += 1
      continue
    }
    fail('invalid-arguments')
  }
  if (typeof options.recording !== 'string' || !path.isAbsolute(options.recording) || path.extname(options.recording).toLowerCase() !== '.apexrec') fail('invalid-recording')
  if (options.bridge && (!path.isAbsolute(options.bridge) || path.resolve(options.bridge) === path.resolve(options.recording))) fail('invalid-bridge')
  if (typeof options.runner === 'string' && !options.runner.trim()) fail('invalid-runner')
  options.recording = path.resolve(options.recording)
  if (options.bridge) options.bridge = path.resolve(options.bridge)
  return options
}

function initialAggregates() {
  return { frames: 0, singleCarFrames: 0, multiCarFrames: 0, invalidOpponentFrames: 0, replayCompletionFrames: null }
}

function acceptAggregate(aggregates, message) {
  if (message?.type === 'status' && message.state === 'replay-complete') {
    aggregates.replayCompletionFrames = Number.isSafeInteger(message.frames) ? message.frames : null
    return
  }
  if (message?.type !== 'telemetry') return
  aggregates.frames += 1
  if (!Array.isArray(message.opponents)) {
    aggregates.invalidOpponentFrames += 1
    return
  }
  if (message.opponents.length === 0) aggregates.singleCarFrames += 1
  else aggregates.multiCarFrames += 1
}

function assertAggregateExpectations(aggregates, options) {
  if (aggregates.invalidOpponentFrames !== 0) fail('opponent-array-missing')
  if (aggregates.replayCompletionFrames !== aggregates.frames) fail('completion-frame-mismatch')
  if (aggregates.singleCarFrames < options.minimumSingleCarFrames) fail('single-car-frames-missing')
  if (aggregates.multiCarFrames < options.minimumMultiCarFrames) fail('multi-car-frames-missing')
  if (options.expectFrames !== undefined && aggregates.frames !== options.expectFrames) fail('unexpected-frame-count')
}

function encodedNeedles(recording) {
  const values = [recording, path.dirname(recording), path.basename(recording)]
  return [...new Set(values.flatMap((value) => [value, JSON.stringify(value).slice(1, -1)]).filter(Boolean))]
}

function assertNoRecordingIdentity(value, needles) {
  const serialized = JSON.stringify(value)
  if (needles.some((needle) => serialized.includes(needle))) fail('recording-identity-persisted')
}

function durableFingerprint(sessions) {
  return JSON.stringify(sessions.map((session) => ({
    id: session.id,
    source: session.source,
    provenanceId: session.importProvenance?.id,
    laps: session.laps.map((lap) => ({ id: lap.id, payloadHash: lap.payloadHash })),
  })))
}

function validateDurableHistory(database, recording, expected = {}) {
  const needles = encodedNeedles(recording)
  const sessions = database.listSessions()
  if (!sessions.length) fail('durable-sessions-missing')
  if (expected.sessions !== undefined && sessions.length !== expected.sessions) fail('unexpected-session-count')
  const importIds = new Set()
  const recordingHashes = new Set()
  const lapIds = new Set()
  let laps = 0
  let payloads = 0
  let completeLaps = 0
  let cleanLaps = 0
  let officiallyTimedLaps = 0
  let referenceLaps = 0
  let replayableLaps = 0
  for (const session of sessions) {
    if (session.source !== 'imported-recording') fail('unexpected-session-source')
    if (session.qualityPolicyVersion !== QUALITY_POLICY_VERSION) fail('unexpected-quality-policy')
    const provenance = session.importProvenance
    if (!provenance || provenance.recordingFormat !== RECORDING_FORMAT || provenance.processingVersion !== PROCESSING_VERSION || provenance.appVersion !== appVersion
      || !Number.isSafeInteger(provenance.sessionCount) || !Number.isSafeInteger(provenance.lapCount)
      || !/^[a-f0-9]{64}$/.test(provenance.recordingSha256)
      || Object.keys(provenance).some((key) => key.toLowerCase().includes('path'))) fail('invalid-import-provenance')
    importIds.add(provenance.id)
    recordingHashes.add(provenance.recordingSha256)
    assertNoRecordingIdentity(provenance, needles)
    for (const lap of session.laps) {
      laps += 1
      if (lap.state === 'complete') completeLaps += 1
      if (lap.quality === 'clean') cleanLaps += 1
      if (lap.timingSource === 'official') officiallyTimedLaps += 1
      if (!['official', 'unavailable'].includes(lap.timingSource)
        || (lap.timingSource === 'official' && (!(typeof lap.lapTimeMs === 'number' && Number.isFinite(lap.lapTimeMs) && lap.lapTimeMs > 0)))
        || (lap.timingSource === 'unavailable' && lap.lapTimeMs !== null)
        || (lap.referenceEligible === true && lap.timingSource !== 'official')) fail('invalid-timing-provenance')
      if (lap.referenceEligible === true) referenceLaps += 1
      if (lap.replayable === true) replayableLaps += 1
      if (lapIds.has(lap.id)) fail('duplicate-durable-lap')
      lapIds.add(lap.id)
      // Durable validation checks the checksum-bearing canonical payload, not
      // the playback view that may withhold a proven LMU terminal transition.
      const payload = database.getLap(session.id, lap.id, { sanitizeForPlayback: false })
      const sampleOverflow = Array.isArray(lap.reasons) && lap.reasons.includes('sample-overflow')
      if (!payload || payload.session?.id !== session.id || payload.lap?.id !== lap.id || payload.payloadHash !== lap.payloadHash
        || !Array.isArray(payload.samples) || payload.samples.length !== lap.sampleCount
        || payload.lap.state !== lap.state || payload.lap.quality !== lap.quality
        || payload.lap.referenceEligible !== lap.referenceEligible || payload.lap.replayable !== lap.replayable
        || payload.lap.lapTimeMs !== lap.lapTimeMs || payload.lap.timingSource !== lap.timingSource
        || lap.replayable !== (payload.samples.length > 1 && !sampleOverflow)
        || (sampleOverflow && (lap.quality !== 'ineligible' || lap.referenceEligible === true || lap.trackModelEligible === true))) fail('invalid-durable-payload')
      assertNoRecordingIdentity(payload, needles)
      payloads += 1
    }
  }
  if (importIds.size !== 1 || recordingHashes.size !== 1) fail('mixed-import-provenance')
  const [recordingSha256] = recordingHashes
  const provenance = database.findRecordingImport(recordingSha256, PROCESSING_VERSION)
  if (!provenance || provenance.sessionCount !== sessions.length || provenance.lapCount !== laps
    || provenance.sessionIds.length !== sessions.length || new Set(provenance.sessionIds).size !== sessions.length) fail('incomplete-import-provenance')
  if (expected.laps !== undefined && laps !== expected.laps) fail('unexpected-lap-count')
  if (expected.completeLaps !== undefined && completeLaps !== expected.completeLaps) fail('unexpected-complete-lap-count')
  if (expected.cleanLaps !== undefined && cleanLaps !== expected.cleanLaps) fail('unexpected-clean-lap-count')
  if (expected.officiallyTimedLaps !== undefined && officiallyTimedLaps !== expected.officiallyTimedLaps) fail('unexpected-officially-timed-lap-count')
  if (expected.referenceLaps !== undefined && referenceLaps !== expected.referenceLaps) fail('unexpected-reference-lap-count')
  if (expected.replayableLaps !== undefined && replayableLaps !== expected.replayableLaps) fail('unexpected-replayable-lap-count')
  return { sessions: sessions.length, laps, completeLaps, cleanLaps, officiallyTimedLaps, referenceLaps, replayableLaps, payloads, fingerprint: durableFingerprint(sessions) }
}

function initialDriverReviewAggregate() {
  return {
    sessions: 0,
    statuses: { ready: 0, 'insufficient-evidence': 0, 'invalid-input': 0 },
    sessionsWithHotspots: 0,
    hotspots: 0,
  }
}

/**
 * Exercise the shipped review service and algorithm against reopened durable
 * payloads. Only bounded counts leave this function: lap/session identifiers,
 * fingerprints, evidence payloads, and recording identity remain private.
 */
async function auditDriverReviews(database, recording) {
  const sessions = database.listSessions()
  const needles = encodedNeedles(recording)
  const aggregate = initialDriverReviewAggregate()
  for (const session of sessions) {
    let first
    let second
    try {
      first = await getDriverReview({ telemetryDatabase: database, buildDriverReview, sessionId: session.id })
      second = await getDriverReview({ telemetryDatabase: database, buildDriverReview, sessionId: session.id })
    } catch {
      fail('driver-review-generation-failed')
    }
    if (!first || !second) fail('driver-review-unavailable')
    assertNoRecordingIdentity(first, needles)
    assertNoRecordingIdentity(second, needles)
    if (JSON.stringify(first) !== JSON.stringify(second)) fail('driver-review-nondeterministic')

    const status = first.status?.code
    if (!STATUS_CODES.includes(status) || !Object.hasOwn(aggregate.statuses, status)
      || !Array.isArray(first.hotspots) || !first.hotspots.every((hotspot) => hotspot && typeof hotspot === 'object')) {
      fail('driver-review-output-invalid')
    }
    // A durable strict cohort may legitimately be too small, but it must never
    // be structurally invalid. Reaching invalid-input here means the selector,
    // persisted canonical payload, and shipped engine disagree about their
    // shared contract, so release evidence must fail rather than count it.
    if (status === 'invalid-input') fail('driver-review-invalid-input', first.status.reasonCode)
    aggregate.sessions += 1
    aggregate.statuses[status] += 1
    aggregate.hotspots += first.hotspots.length
    if (first.hotspots.length > 0) aggregate.sessionsWithHotspots += 1
  }
  return aggregate
}

function assertDriverReviewExpectations(aggregate, options) {
  if (aggregate.statuses.ready < options.minimumDriverReviewReady) fail('driver-review-ready-minimum-missing')
  if (aggregate.hotspots < options.minimumDriverReviewHotspots) fail('driver-review-hotspot-minimum-missing')
}

async function fileContainsNeedle(filePath, needles) {
  if (!fs.existsSync(filePath)) return false
  const buffers = needles.map((needle) => Buffer.from(needle, 'utf8')).filter((needle) => needle.length)
  const overlap = Math.max(0, ...buffers.map((needle) => needle.length - 1))
  let carry = Buffer.alloc(0)
  for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 })) {
    const combined = carry.length ? Buffer.concat([carry, chunk]) : chunk
    if (buffers.some((needle) => combined.indexOf(needle) !== -1)) return true
    carry = overlap > 0 ? combined.subarray(Math.max(0, combined.length - overlap)) : Buffer.alloc(0)
  }
  return false
}

async function assertDatabaseFilesPrivate(databasePath, recording) {
  const needles = encodedNeedles(recording)
  if (process.platform !== 'win32') {
    const directoryMode = (await fsp.stat(path.dirname(databasePath))).mode & 0o777
    if (directoryMode !== 0o700) fail('database-directory-not-private')
  }
  for (const candidate of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (process.platform !== 'win32' && fs.existsSync(candidate)) {
      const mode = (await fsp.stat(candidate)).mode & 0o777
      if ((mode & 0o077) !== 0) fail('database-file-not-private')
    }
    if (await fileContainsNeedle(candidate, needles)) fail('recording-identity-persisted')
  }
}

const IMPORT_REPLAY_FAILURES = new Set(['strict-replay-failed', 'import-limit', 'ingest-failed'])
function importReplayFailureCode(pipelineError, state) {
  if (pipelineError instanceof AuditError) return pipelineError.code
  return IMPORT_REPLAY_FAILURES.has(state?.reason) ? state.reason : 'strict-replay-failed'
}

function bridgeRuntime(options) {
  let command
  let prefix = []
  let cwd = root
  if (options.bridge) {
    command = options.bridge
  } else if (process.platform === 'win32') {
    command = path.join(root, 'bridge', 'bin', 'apex-lmu-bridge.exe')
  } else {
    command = 'go'
    prefix = ['run', '.']
    cwd = path.join(root, 'bridge')
  }
  if (options.runner) {
    prefix = [command, ...prefix]
    command = options.runner
  }
  return {
    platform: 'win32',
    fileExists: () => true,
    spawn: (_ignoredBinary, args, spawnOptions) => {
      let replayArgs = [...args]
      if (options.runner && /(?:^|[/\\])wine(?:64)?(?:\.exe)?$/i.test(options.runner)) {
        const index = replayArgs.findIndex((argument) => argument.startsWith('--replay='))
        if (index >= 0) {
          const converted = spawnSync('winepath', ['-w', replayArgs[index].slice('--replay='.length)], { encoding: 'utf8' })
          if (converted.status !== 0 || !converted.stdout.trim()) fail('bridge-runner-failed')
          replayArgs[index] = `--replay=${converted.stdout.trim()}`
        }
      }
      return spawn(command, [...prefix, ...replayArgs], { ...spawnOptions, cwd })
    },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

async function waitFor(promise, timeoutMs, onTimeout) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => { timer = setTimeout(() => { onTimeout(); reject(new AuditError('replay-timeout')) }, timeoutMs) }),
    ])
  } finally { clearTimeout(timer) }
}

async function runAudit(options) {
  const stat = await fsp.stat(options.recording).catch(() => null)
  if (!stat?.isFile() || stat.size <= 0 || stat.size > MAX_RECORDING_BYTES) fail('invalid-recording')
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'apex-recording-import-audit-'))
  const databasePath = path.join(temporary, 'telemetry.sqlite3')
  const aggregates = initialAggregates()
  const completion = deferred()
  let database = null
  let service = null
  let pipelineError = null
  let replayStarts = 0
  const diagnostics = createAuditDiagnostics()
  const runtime = bridgeRuntime(options)
  const bridge = new LmuBridgeManager({
    app: { isPackaged: false },
    logger: diagnostics,
    runtime,
    broadcast: (message) => {
      if (!service?.owns(message)) return
      acceptAggregate(aggregates, message)
      if (!service.ingest(message) && !pipelineError) pipelineError = new AuditError('import-routing-failed')
    },
    onReplayFinished: async (result) => {
      try {
        const handled = await service?.handleReplayFinished(result)
        if (handled) completion.resolve(result)
      } catch { completion.reject(new AuditError('import-finalization-failed')) }
    },
  })
  const startReplay = bridge.startReplay.bind(bridge)
  bridge.startReplay = (...args) => { replayStarts += 1; return startReplay(...args) }
  try {
    database = await TelemetryDatabase.open({ userDataPath: temporary, databasePath, appVersion, logger: diagnostics })
    service = new RecordingImportService({ userDataPath: temporary, appVersion, database, bridgeManager: bridge, logger: diagnostics })
    await service.initialize()
    const started = await service.start(options.recording)
    if (!started.ok || started.duplicate || !started.runId) fail('import-start-failed')
    const replayResult = await waitFor(completion.promise, options.timeoutMs, () => bridge.stopReplay())
    const state = service.getState()
    if (!replayResult.complete || replayResult.stopped || pipelineError) fail(importReplayFailureCode(pipelineError, state), diagnostics.failureDetail())
    if (state.status !== 'complete' || state.duplicate || state.frames !== aggregates.frames) fail('import-did-not-commit')
    assertAggregateExpectations(aggregates, options)
    await service.dispose()
    await database.close({ requireDurable: true })

    database = await TelemetryDatabase.open({ userDataPath: temporary, databasePath, appVersion, logger: diagnostics })
    const expectedHistory = {
      sessions: options.expectSessions,
      laps: options.expectLaps,
      completeLaps: options.expectCompleteLaps,
      cleanLaps: options.expectCleanLaps,
      officiallyTimedLaps: options.expectOfficiallyTimedLaps,
      referenceLaps: options.expectReferenceLaps,
      replayableLaps: options.expectReplayableLaps,
    }
    const durable = validateDurableHistory(database, options.recording, expectedHistory)
    if (state.sessions !== durable.sessions || state.laps !== durable.laps || state.importedSessions !== durable.sessions || state.importedLaps !== durable.laps) fail('import-count-mismatch')
    const driverReviews = await auditDriverReviews(database, options.recording)
    if (driverReviews.sessions !== durable.sessions) fail('driver-review-session-count-mismatch')
    assertDriverReviewExpectations(driverReviews, options)

    service = new RecordingImportService({ userDataPath: temporary, appVersion, database, bridgeManager: bridge, logger: diagnostics })
    await service.initialize()
    const startsBeforeDuplicate = replayStarts
    const duplicate = await service.start(options.recording)
    if (!duplicate.ok || !duplicate.duplicate || replayStarts !== startsBeforeDuplicate) fail('deduplication-failed')
    const afterDuplicate = validateDurableHistory(database, options.recording, expectedHistory)
    if (afterDuplicate.fingerprint !== durable.fingerprint) fail('deduplication-mutated-history')
    await service.dispose()
    await database.close({ requireDurable: true })
    database = null
    await assertDatabaseFilesPrivate(databasePath, options.recording)
    return {
      frames: aggregates.frames,
      singleCarFrames: aggregates.singleCarFrames,
      multiCarFrames: aggregates.multiCarFrames,
      sessions: durable.sessions,
      laps: durable.laps,
      completeLaps: durable.completeLaps,
      cleanLaps: durable.cleanLaps,
      officiallyTimedLaps: durable.officiallyTimedLaps,
      referenceLaps: durable.referenceLaps,
      replayableLaps: durable.replayableLaps,
      payloads: durable.payloads,
      driverReviews,
      replayStarts,
      deduplicatedImports: 1,
    }
  } finally {
    bridge.stop()
    try { await service?.dispose() } catch {}
    try { await database?.close({ requireDurable: true }) } catch {}
    await fsp.rm(temporary, { recursive: true, force: true })
  }
}

function safeErrorCode(error) {
  return error instanceof AuditError && /^[a-z0-9-]+$/.test(error.code) ? error.code : 'audit-failed'
}

function safeErrorDetail(error) {
  return error instanceof AuditError && typeof error.detail === 'string' && /^[a-z0-9-]+$/.test(error.detail) ? error.detail : null
}

if (require.main === module) {
  let options
  try { options = parseCli(process.argv.slice(2)) } catch (error) {
    console.error(JSON.stringify({ ok: false, error: safeErrorCode(error) }))
    process.exitCode = 2
  }
  if (options?.help) console.log(usage)
  else if (options) runAudit(options)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(JSON.stringify({ ok: false, error: safeErrorCode(error), ...(safeErrorDetail(error) ? { detail: safeErrorDetail(error) } : {}) })); process.exitCode = 1 })
}

module.exports = {
  AuditError,
  acceptAggregate,
  assertAggregateExpectations,
  assertDriverReviewExpectations,
  auditDriverReviews,
  assertNoRecordingIdentity,
  createAuditDiagnostics,
  durableFingerprint,
  encodedNeedles,
  initialAggregates,
  importReplayFailureCode,
  parseCli,
  runAudit,
  safeErrorCode,
  safeErrorDetail,
  usage,
  validateDurableHistory,
}
