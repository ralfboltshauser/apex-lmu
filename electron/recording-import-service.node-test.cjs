const assert = require('node:assert/strict')
const test = require('node:test')
const { EventEmitter } = require('node:events')
const { PassThrough, Readable } = require('node:stream')
const { setImmediate: waitForImmediate } = require('node:timers/promises')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { RecordingImportService, PROCESSING_VERSION, RECORDING_FORMAT, STAGING_WRITE_HARD_LIMIT, MAX_IMPORT_LAPS } = require('./recording-import-service.cjs')
const { LmuBridgeManager } = require('./lmu-bridge.cjs')
const { TelemetryDatabase } = require('./telemetry-database.cjs')

class FakeBridge {
  constructor() { this.starts = []; this.stops = 0; this.acquisitions = []; this.releases = []; this.flowControls = [] }
  acquireReplayOwnership(ownerId, options) { this.acquisitions.push({ ownerId, options }); return { ok: true, ownerId } }
  releaseReplayOwnership(ownerId) { this.releases.push(ownerId); return { ok: true } }
  startReplay(filePath, options) { this.starts.push({ filePath, options }); return { ok: true, runId: options.runId } }
  setReplayOutputPaused(ownerId, runId, paused) { this.flowControls.push({ ownerId, runId, paused }); return { ok: true, paused } }
  stopReplay() { this.stops += 1; return { ok: true } }
}

class FakeChild extends EventEmitter {
  constructor() {
    super()
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.stdin = new PassThrough()
    this.killed = false
  }

  kill() { this.killed = true; return true }
}

async function temporary() { return fs.mkdtemp(path.join(os.tmpdir(), 'apex-recording-import-')) }

async function harness({ logger = null, databaseOptions = {}, serviceOptions = {} } = {}) {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  const database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0', ...databaseOptions })
  const bridge = new FakeBridge()
  const states = []
  const commits = []
  const service = new RecordingImportService({
    userDataPath: root,
    appVersion: '1.0.0',
    database,
    bridgeManager: bridge,
    logger,
    broadcast: (state) => states.push(state),
    onCommitted: (result) => commits.push(result),
    ...serviceOptions,
  })
  await service.initialize()
  return { root, databasePath, database, bridge, service, states, commits }
}

async function recording(root, name = 'private-driver-recording.apexrec', contents = 'synthetic raw fixture') {
  const directory = path.join(root, 'source-private-folder')
  await fs.mkdir(directory)
  const filePath = path.join(directory, name)
  await fs.writeFile(filePath, contents, { mode: 0o600 })
  return filePath
}

function replayFrames(runId) {
  const frames = []
  let sequence = 0
  let elapsedSeconds = 0
  const frame = (lap, distanceM, patch = {}) => {
    sequence += 1
    elapsedSeconds += 0.2
    const angle = distanceM / 1000 * Math.PI * 2
    return {
      protocolVersion: 2,
      source: 'recording-replay',
      runId,
      type: 'telemetry',
      sequence,
      capturedAt: new Date(1_700_000_000_000 + elapsedSeconds * 1000).toISOString(),
      playerTelemetryAvailable: true,
      session: { track: 'Private test circuit', layout: '', trackLengthM: 1000, elapsedSeconds },
      player: {
        id: 7, name: 'Test car', class: 'GT3', lap, lapStartSeconds: (lap - 1) * 20,
        gameElapsedSeconds: elapsedSeconds, lapDistanceM: distanceM,
        worldPositionM: { x: Math.cos(angle) * 160, y: 0, z: Math.sin(angle) * 160 },
        speedKph: 180, throttle: 0.8, brake: 0, steering: 0, controlOwner: 'local-player',
        inPits: false, pitState: 0, countLapFlag: 2, ...patch,
      },
      opponents: [],
    }
  }
  for (let distance = 0; distance < 1000; distance += 10) frames.push(frame(1, distance))
  frames.push(frame(2, 0, { lastLapSeconds: 19.876 }))
  return frames
}

function boundaryFrame(runId, sequence, track) {
  const frame = replayFrames(runId)[0]
  return {
    ...frame,
    sequence,
    capturedAt: new Date(1_700_000_000_000 + sequence * 1000).toISOString(),
    session: { ...frame.session, track, elapsedSeconds: sequence },
    player: { ...frame.player, gameElapsedSeconds: sequence, lapStartSeconds: 0, lapDistanceM: sequence * 10 },
  }
}

function controlStagingWrites(database) {
  const gates = []
  for (const method of ['enqueueFinalized', 'enqueueSessionFinalized']) {
    const original = database[method].bind(database)
    database[method] = (value) => {
      let resolve
      let reject
      const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
      const gate = {
        method, promise, settled: false,
        release: () => {
          if (gate.settled) return promise
          gate.settled = true
          Promise.resolve().then(() => original(value)).then(resolve, reject)
          return promise
        },
        reject: (error) => {
          if (gate.settled) return promise
          gate.settled = true
          reject(error)
          return promise
        },
      }
      gates.push(gate)
      return promise
    }
  }
  return {
    gates,
    async releaseAll() {
      for (const gate of gates) gate.release()
      await Promise.allSettled(gates.map((gate) => gate.promise))
      await waitForImmediate()
    },
  }
}

async function managedHarness() {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  const database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  const children = []
  const finalizations = []
  const broadcasts = []
  let service = null
  const manager = new LmuBridgeManager({
    app: { isPackaged: false },
    broadcast: (message) => {
      broadcasts.push(message)
      if (service?.owns(message)) service.ingest(message)
    },
    onReplayFinished: (result) => {
      const finalization = service.handleReplayFinished(result)
      finalizations.push(finalization)
      return finalization
    },
    runtime: {
      platform: 'win32', fileExists: () => true,
      spawn: () => { const child = new FakeChild(); children.push(child); return child },
    },
  })
  service = new RecordingImportService({ userDataPath: root, appVersion: '1.0.0', database, bridgeManager: manager })
  await service.initialize()
  return { root, databasePath, database, manager, service, children, finalizations, broadcasts }
}

async function finishSuccessfulImport(service, runId) {
  const recordingSha256 = service.active?.recordingSha256
  service.ingest({ protocolVersion: 2, source: 'recording-replay', runId, type: 'status', state: 'replay-starting' })
  for (const frame of replayFrames(runId)) assert.equal(service.ingest(frame), true)
  service.ingest({ protocolVersion: 2, source: 'recording-replay', runId, type: 'status', state: 'replay-complete' })
  await service.handleReplayFinished({ runId, complete: true, stopped: false, message: 'Replay complete', code: 0, recordingSha256 })
}

test('explicit strict import commits once, survives restart, and never persists its source path', async () => {
  const context = await harness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  assert.equal(started.ok, true)
  assert.equal(context.service.active.database.deferPerLapTrackModels, true)
  assert.equal(context.bridge.acquisitions.length, 1)
  assert.deepEqual(context.bridge.acquisitions[0].options, { privateReplay: true })
  assert.equal(context.bridge.starts.length, 1)
  assert.deepEqual(context.bridge.starts[0].options, { speed: 0, strict: true, runId: started.runId, reportRecordingState: false, ownershipId: context.bridge.acquisitions[0].ownerId })
  await finishSuccessfulImport(context.service, started.runId)
  assert.deepEqual(context.bridge.releases, [context.bridge.acquisitions[0].ownerId])

  const state = context.service.getState()
  assert.equal(state.status, 'complete')
  assert.equal(state.duplicate, false)
  assert.equal(state.frames, 101)
  assert.ok(state.importedSessions >= 1)
  assert.ok(state.importedLaps >= 1)
  const [session] = context.database.listSessions()
  assert.equal(session.source, 'imported-recording')
  assert.equal(session.state, 'finished')
  assert.ok(session.endedAt)
  assert.equal(session.importProvenance.processingVersion, PROCESSING_VERSION)
  assert.equal(session.laps[0].quality, 'clean')
  assert.ok(context.database.getLap(session.id, session.laps[0].id).samples.length >= 100)
  assert.equal(context.commits.length, 1)
  await context.database.close({ requireDurable: true })

  const databaseBytes = await fs.readFile(context.databasePath)
  assert.equal(databaseBytes.includes(Buffer.from(filePath)), false)
  assert.equal(databaseBytes.includes(Buffer.from(path.dirname(filePath))), false)
  assert.equal(databaseBytes.includes(Buffer.from(path.basename(filePath))), false)

  const reopened = await TelemetryDatabase.open({ userDataPath: context.root, databasePath: context.databasePath, appVersion: '1.0.0' })
  const persisted = reopened.listSessions()
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].laps.length, 2)
  assert.ok(reopened.getLap(persisted[0].id, persisted[0].laps[0].id).samples.length >= 100)
  await reopened.close()
})

test('slow staging writes apply bounded pipe backpressure, resume at low water, and still commit', async () => {
  const context = await managedHarness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  const child = context.children[0]
  const active = context.service.active
  const controls = controlStagingWrites(active.database)
  const emit = (message) => child.stdout.write(`${JSON.stringify(message)}\n`)

  emit({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-starting' })
  emit(boundaryFrame(started.runId, 1, 'Backpressure circuit 1'))
  emit(boundaryFrame(started.runId, 2, 'Backpressure circuit 2'))
  emit(boundaryFrame(started.runId, 3, 'Backpressure circuit 3'))
  await waitForImmediate()

  assert.equal(active.pendingWrites.size, 4)
  assert.equal(active.peakPendingWrites, 4)
  assert.equal(child.stdout.isPaused(), true)
  assert.equal(active.frames, 3)

  emit(boundaryFrame(started.runId, 4, 'Backpressure circuit 3'))
  await waitForImmediate()
  assert.equal(active.frames, 3, 'paused stdout must not feed more frames into the importer')
  assert.equal(active.pendingWrites.size, 4, 'the retained full-lap write backlog stays bounded')

  controls.gates[0].release()
  controls.gates[1].release()
  await Promise.allSettled([controls.gates[0].promise, controls.gates[1].promise])
  await waitForImmediate()
  assert.equal(active.pendingWrites.size, 2)
  assert.equal(child.stdout.isPaused(), false)
  assert.equal(active.frames, 4, 'the buffered frame drains only after low-water resume')

  await controls.releaseAll()
  emit({
    protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-complete',
    recordingSha256: active.recordingSha256,
  })
  await waitForImmediate()
  assert.equal(controls.gates.length, 6)
  child.emit('close', 0)
  await waitForImmediate()
  await controls.releaseAll()
  await context.finalizations[0]

  assert.equal(context.service.getState().status, 'complete')
  assert.equal(context.service.getState().duplicate, false)
  assert.equal(context.database.listSessions().length, 3)
  assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
  await context.database.close()
})

test('an asynchronous staging rejection stops replay and discards every staged write', async () => {
  const context = await managedHarness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  const child = context.children[0]
  const active = context.service.active
  const controls = controlStagingWrites(active.database)
  const emit = (message) => child.stdout.write(`${JSON.stringify(message)}\n`)

  emit({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-starting' })
  emit(boundaryFrame(started.runId, 1, 'Reject circuit 1'))
  emit(boundaryFrame(started.runId, 2, 'Reject circuit 2'))
  emit(boundaryFrame(started.runId, 3, 'Reject circuit 3'))
  await waitForImmediate()
  assert.equal(active.pendingWrites.size, 4)
  assert.equal(child.stdout.isPaused(), true)

  controls.gates[0].reject(new Error('synthetic slow database rejection'))
  for (const gate of controls.gates.slice(1)) gate.release()
  await Promise.allSettled(controls.gates.map((gate) => gate.promise))
  await waitForImmediate()
  assert.equal(child.killed, true)
  assert.match(active.ingestError, /synthetic slow database rejection/)
  assert.equal(active.pendingWrites.size, 0)
  assert.equal(child.stdout.isPaused(), true, 'a failed import must not resume its stopped producer')

  child.emit('close', null)
  await waitForImmediate()
  await context.finalizations[0]
  assert.equal(context.service.getState().status, 'error')
  assert.equal(context.service.getState().reason, 'ingest-failed')
  assert.deepEqual(context.database.listSessions(), [])
  assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
  await context.database.close()
})

test('a buffered producer that runs past pause cannot exceed the hard pending-write bound', async () => {
  const context = await harness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  const active = context.service.active
  const controls = controlStagingWrites(active.database)

  for (let index = 1; index <= 10; index += 1) {
    context.service.ingest(boundaryFrame(started.runId, index, `Buffered circuit ${index}`))
  }
  await waitForImmediate()

  assert.equal(active.pendingWrites.size, STAGING_WRITE_HARD_LIMIT)
  assert.equal(active.peakPendingWrites, STAGING_WRITE_HARD_LIMIT)
  assert.match(active.ingestError, /backlog exceeded its hard safety limit/)
  assert.equal(context.bridge.stops, 1)
  await controls.releaseAll()
  await context.service.handleReplayFinished({ runId: started.runId, complete: false, stopped: true, message: 'Replay stopped', code: null })
  assert.equal(context.service.getState().reason, 'import-limit')
  assert.deepEqual(context.database.listSessions(), [])
  assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
  await context.database.close()
})

test('dispose suppresses buffered private telemetry between replay kill and process close', async () => {
  const context = await managedHarness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  const child = context.children[0]
  const before = context.broadcasts.length

  await context.service.dispose()
  assert.equal(child.killed, true)
  child.stdout.write(`${JSON.stringify({
    protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'telemetry', sequence: 99,
    session: { track: 'SECRET_BUFFERED_TRACK' }, player: { driver: 'SECRET_BUFFERED_DRIVER' }, opponents: [],
  })}\n`)
  child.emit('error', new Error('SECRET_BUFFERED_PROCESS_ERROR'))
  await waitForImmediate()

  assert.equal(context.broadcasts.length, before)
  assert.equal(JSON.stringify(context.broadcasts).includes('SECRET_BUFFERED'), false)
  child.emit('close', null)
  await waitForImmediate()
  assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
  await context.database.close()
})

test('preflight hashing probes one byte past the expected identity and rejects stream growth', async () => {
  const root = await temporary()
  let streamOptions = null
  const bridge = new FakeBridge()
  const service = new RecordingImportService({
    userDataPath: root,
    appVersion: '1.0.0',
    database: { maxSessions: 40, maxBytes: 2 * 1024 * 1024 * 1024 },
    bridgeManager: bridge,
    createReadStream: (_filePath, options) => {
      streamOptions = options
      return Readable.from([Buffer.from('1234'), Buffer.from('5'), Buffer.alloc(1024 * 1024)])
    },
  })
  const active = { filePath: path.join(root, 'growing.apexrec'), fileIdentity: { size: 4 }, cancelRequested: false }
  service.active = active

  await assert.rejects(service.hashFile(active), (error) => error?.code === 'file-changed' && /grew/.test(error.message))
  assert.equal(streamOptions.end, 4, 'inclusive end probes byte offset expectedSize')
  assert.equal(streamOptions.highWaterMark, 1024 * 1024)
})

test('a new preflight failure clears every prior recording identity and result count', async () => {
  const context = await harness()
  context.service.state = {
    schemaVersion: 1, status: 'complete', fileName: 'previous-private-name.apexrec',
    bytesProcessed: 123, bytesTotal: 123, frames: 99, sessions: 4, laps: 12,
    importedSessions: 4, importedLaps: 12, duplicate: true,
    sessionIds: ['previous-private-session'], reason: 'already-imported',
  }

  const result = await context.service.start('relative-and-invalid.apexrec')

  assert.equal(result.ok, false)
  assert.deepEqual(context.service.getState(), {
    schemaVersion: 1, status: 'error', fileName: null,
    bytesProcessed: 0, bytesTotal: 0, frames: 0, sessions: 0, laps: 0,
    importedSessions: 0, importedLaps: 0, duplicate: false,
    sessionIds: [], reason: 'invalid-file',
  })
  assert.deepEqual(context.bridge.acquisitions, [])
  await context.database.close()
})

test('crafted session transitions hit an explicit import cap and fail closed', async () => {
  const context = await harness({ databaseOptions: { maxSessions: 2 } })
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)

  assert.equal(context.service.maximumImportSessions, context.database.maxSessions)
  assert.equal(context.service.maximumImportSessions, 2)

  context.service.ingest(boundaryFrame(started.runId, 1, 'Cap circuit 1'))
  context.service.ingest(boundaryFrame(started.runId, 2, 'Cap circuit 2'))
  context.service.ingest(boundaryFrame(started.runId, 3, 'Cap circuit 3'))
  context.service.ingest(boundaryFrame(started.runId, 4, 'Cap circuit 4'))
  await waitForImmediate()

  assert.equal(context.service.active.finalizedSessions, 3)
  assert.match(context.service.active.ingestError, /safety limit/)
  assert.equal(context.service.active.ingestErrorCode, 'import-limit')
  assert.equal(context.bridge.stops, 1)
  await context.service.handleReplayFinished({ runId: started.runId, complete: false, stopped: true, message: 'Replay stopped', code: null })
  assert.equal(context.service.getState().status, 'error')
  assert.equal(context.service.getState().reason, 'import-limit')
  assert.deepEqual(context.database.listSessions(), [])
  assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
  await context.database.close()
})

test('the explicit lap-count boundary accepts 2,048 finalized laps and rejects the next one', async () => {
  const context = await harness()
  const filePath = await recording(context.root)
  await context.service.start(filePath)
  const active = context.service.active

  assert.equal(MAX_IMPORT_LAPS, 2048)
  active.finalizedLaps = MAX_IMPORT_LAPS - 1
  await context.service.trackStagingWrite(active, 'lap', () => Promise.resolve({ written: false, duplicate: true }))
  assert.equal(active.finalizedLaps, MAX_IMPORT_LAPS)
  assert.equal(active.ingestError, null)

  await assert.rejects(
    context.service.trackStagingWrite(active, 'lap', () => Promise.resolve({ written: false, duplicate: true })),
    (error) => error?.code === 'import-limit',
  )
  assert.equal(active.finalizedLaps, MAX_IMPORT_LAPS + 1)
  assert.equal(active.ingestErrorCode, 'import-limit')
  assert.equal(context.bridge.stops, 1)
  await context.service.handleReplayFinished({ runId: active.runId, complete: false, stopped: true, message: 'Replay stopped', code: null })
  assert.equal(context.service.getState().reason, 'import-limit')
  assert.deepEqual(context.database.listSessions(), [])
  await context.database.close()
})

test('resolved compressed lap bytes cannot exceed the destination database payload cap', async () => {
  const context = await harness({ databaseOptions: { maxBytes: 1 } })
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  const active = context.service.active

  assert.equal(context.service.maximumStagedPayloadBytes, context.database.maxBytes)
  assert.equal(context.service.maximumStagedPayloadBytes, 1)
  context.service.ingest(boundaryFrame(started.runId, 1, 'Payload cap circuit 1'))
  context.service.ingest(boundaryFrame(started.runId, 2, 'Payload cap circuit 2'))
  context.service.ingest(boundaryFrame(started.runId, 3, 'Payload cap circuit 3'))
  await context.service.awaitStagingWrites(active)

  const stagedBytes = Number(active.database.database.prepare('SELECT COALESCE(SUM(length(compressed)),0) AS bytes FROM lap_payloads').get().bytes)
  assert.ok(active.stagedPayloadBytes > context.database.maxBytes)
  assert.equal(active.stagedPayloadBytes, stagedBytes, 'every already-queued resolved lap is included in the cumulative bound')
  assert.equal(active.ingestErrorCode, 'import-limit')
  assert.match(active.ingestError, /staged lap payloads exceed/)
  assert.equal(context.bridge.stops, 1)
  await context.service.handleReplayFinished({ runId: started.runId, complete: false, stopped: true, message: 'Replay stopped', code: null })
  assert.equal(context.service.getState().status, 'error')
  assert.equal(context.service.getState().reason, 'import-limit')
  assert.deepEqual(context.database.listSessions(), [])
  assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
  await context.database.close()
})

test('a captured source lifecycle interruption survives the isolated import transaction', async () => {
  const context = await harness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  const frames = replayFrames(started.runId)
  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-starting' })
  for (const frame of frames.slice(0, 50)) context.service.ingest(frame)
  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'waiting', message: '[private recording] decoder details withheld.' })
  for (const frame of frames.slice(50)) context.service.ingest(frame)
  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-complete' })
  await context.service.handleReplayFinished({ runId: started.runId, complete: true, stopped: false, message: 'Replay complete', code: 0, recordingSha256: context.service.active.recordingSha256 })

  const [session] = context.database.listSessions()
  assert.equal(session.interruptionCount, 1)
  assert.ok(session.laps.some((lap) => lap.reasons.includes('source-interrupted')))
  await context.database.close({ requireDurable: true })
})

test('a scoring-only transient session with no lap is ignored without weakening non-empty persistence', async () => {
  const context = await harness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  const runId = started.runId
  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId, type: 'status', state: 'replay-starting' })

  const [first] = replayFrames(runId)
  context.service.ingest({
    ...first,
    playerTelemetryAvailable: false,
    session: { ...first.session, track: 'Scoring-only transient circuit' },
  })
  for (const frame of replayFrames(runId)) context.service.ingest(frame)
  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId, type: 'status', state: 'replay-complete' })
  await context.service.handleReplayFinished({
    runId,
    complete: true,
    stopped: false,
    code: 0,
    recordingSha256: context.service.active.recordingSha256,
  })

  assert.equal(context.service.getState().status, 'complete')
  assert.equal(context.service.getState().sessions, 1)
  assert.equal(context.database.listSessions().length, 1)
  assert.equal(context.database.listSessions()[0].track.name, 'Private test circuit')
  await context.database.close({ requireDurable: true })
})

test('a non-empty session missing from staging remains a fail-closed storage error', async () => {
  const context = await harness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  const active = context.service.active
  active.database.enqueueSessionFinalized = async () => ({ written: false, reason: 'not-found' })

  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-starting' })
  for (const frame of replayFrames(started.runId)) context.service.ingest(frame)
  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-complete' })
  await context.service.awaitStagingWrites(active)

  assert.equal(active.ingestErrorCode, 'ingest-failed')
  assert.match(active.ingestError, /session write \(not-found\)/)
  await context.service.handleReplayFinished({ runId: started.runId, complete: false, stopped: true, code: null })
  assert.equal(context.service.getState().status, 'error')
  assert.equal(context.service.getState().reason, 'ingest-failed')
  assert.deepEqual(context.database.listSessions(), [])
  assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
  await context.database.close()
})

test('scoring-only session churn is bounded before skipped segments can grow memory', async () => {
  const context = await harness({ databaseOptions: { maxSessions: 2 } })
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  const active = context.service.active
  const [base] = replayFrames(started.runId)

  for (let index = 1; index <= 10; index += 1) {
    context.service.ingest({
      ...base,
      sequence: index,
      capturedAt: new Date(1_700_000_000_000 + index * 1000).toISOString(),
      playerTelemetryAvailable: false,
      session: { ...base.session, track: `Scoring-only churn ${index}`, elapsedSeconds: index },
      player: { ...base.player, gameElapsedSeconds: index },
    })
  }
  await waitForImmediate()

  assert.equal(active.finalizedSessions, 3)
  assert.equal(active.store.sessions.length, 4, 'ingestion stops immediately after the bounded over-limit segment')
  assert.equal(active.ingestErrorCode, 'import-limit')
  assert.equal(context.bridge.stops, 1)
  await context.service.handleReplayFinished({ runId: started.runId, complete: false, stopped: true, code: null })
  assert.equal(context.service.getState().reason, 'import-limit')
  assert.deepEqual(context.database.listSessions(), [])
  assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
  await context.database.close()
})

test('hash lookup makes reimport an idempotent no-op without starting the bridge', async () => {
  const context = await harness()
  const filePath = await recording(context.root)
  const first = await context.service.start(filePath)
  await finishSuccessfulImport(context.service, first.runId)
  const before = context.database.listSessions().map((session) => ({ id: session.id, laps: session.laps.map((lap) => lap.id) }))

  const second = await context.service.start(filePath)
  assert.equal(second.ok, true)
  assert.equal(second.duplicate, true)
  assert.equal(context.bridge.starts.length, 1)
  assert.equal(context.bridge.acquisitions.length, 2)
  assert.deepEqual(context.bridge.releases, context.bridge.acquisitions.map((entry) => entry.ownerId))
  assert.deepEqual(context.database.listSessions().map((session) => ({ id: session.id, laps: session.laps.map((lap) => lap.id) })), before)
  assert.equal(context.service.getState().reason, 'already-imported')
  await context.database.close()
})

test('shutdown waits for an import that has already reached its atomic commit boundary', async () => {
  const context = await harness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-starting' })
  for (const frame of replayFrames(started.runId)) context.service.ingest(frame)
  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-complete' })

  const originalImport = context.database.importStaged.bind(context.database)
  let enterCommit
  let releaseCommit
  const commitEntered = new Promise((resolve) => { enterCommit = resolve })
  const commitRelease = new Promise((resolve) => { releaseCommit = resolve })
  context.database.importStaged = async (...args) => {
    enterCommit()
    await commitRelease
    return originalImport(...args)
  }

  const finalizing = context.service.handleReplayFinished({ runId: started.runId, complete: true, stopped: false, message: 'Replay complete', code: 0, recordingSha256: context.service.active.recordingSha256 })
  await commitEntered
  let disposed = false
  const disposing = context.service.dispose().then(() => { disposed = true })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(disposed, false)
  releaseCommit()
  await Promise.all([finalizing, disposing])
  assert.equal(context.service.getState().status, 'complete')
  assert.equal(context.database.listSessions().length, 1)
  await context.database.close()
})

test('commit completion fails closed when main storage resolves without importing or finding a duplicate', async (t) => {
  for (const availability of [
    { name: 'future schema', configure: (database) => { database.futureSchema = 999; database.writable = false } },
    { name: 'unwritable database', configure: (database) => { database.writable = false } },
  ]) {
    await t.test(availability.name, async () => {
      const context = await harness()
      const filePath = await recording(context.root)
      const started = await context.service.start(filePath)
      availability.configure(context.database)

      await finishSuccessfulImport(context.service, started.runId)

      const state = context.service.getState()
      assert.equal(state.status, 'error')
      assert.equal(state.reason, 'storage-unavailable')
      assert.equal(state.duplicate, false)
      assert.equal(context.commits.length, 0)
      assert.equal(Number(context.database.database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count), 0)
      assert.equal(Number(context.database.database.prepare('SELECT COUNT(*) AS count FROM laps').get().count), 0)
      assert.equal(Number(context.database.database.prepare('SELECT COUNT(*) AS count FROM recording_imports').get().count), 0)
      assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
      await context.database.close()
    })
  }
})

test('a duplicate committed between preflight and merge is a successful no-op', async () => {
  const context = await harness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-starting' })
  for (const frame of replayFrames(started.runId)) context.service.ingest(frame)
  context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-complete' })

  const active = context.service.active
  await active.database.close({ requireDurable: true })
  const racedCommit = await context.database.importStaged(active.stagingPath, {
    id: active.importId,
    recordingSha256: active.recordingSha256,
    recordingFormat: RECORDING_FORMAT,
    processingVersion: PROCESSING_VERSION,
    importedAt: '2026-07-17T12:00:00.000Z',
    appVersion: '1.0.0',
  })
  assert.equal(racedCommit.imported, true)

  await context.service.handleReplayFinished({ runId: started.runId, complete: true, stopped: false, message: 'Replay complete', code: 0, recordingSha256: active.recordingSha256 })

  const state = context.service.getState()
  assert.equal(state.status, 'complete')
  assert.equal(state.duplicate, true)
  assert.equal(state.reason, 'already-imported')
  assert.equal(state.importedSessions, 0)
  assert.equal(state.importedLaps, 0)
  assert.equal(context.commits.length, 1)
  assert.equal(context.database.listSessions().length, 1)
  assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
  await context.database.close()
})

test('failed, cancelled, and changed-file replays expose no partial history and remove staging', async (t) => {
  await t.test('strict replay failure', async () => {
    const context = await harness()
    const filePath = await recording(context.root)
    const started = await context.service.start(filePath)
    await fs.writeFile(`${context.service.active.stagingPath}-journal`, 'private rollback journal sentinel', { mode: 0o600 })
    for (const frame of replayFrames(started.runId)) context.service.ingest(frame)
    await context.service.handleReplayFinished({ runId: started.runId, complete: false, stopped: false, message: 'checksum mismatch', code: 1 })
    assert.equal(context.service.getState().status, 'error')
    assert.deepEqual(context.database.listSessions(), [])
    assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
    await context.database.close()
  })

  await t.test('user cancellation', async () => {
    const context = await harness()
    const filePath = await recording(context.root)
    const started = await context.service.start(filePath)
    context.service.ingest(replayFrames(started.runId)[0])
    assert.deepEqual(context.service.stop(), { ok: true })
    assert.equal(context.bridge.stops, 1)
    await context.service.handleReplayFinished({ runId: started.runId, complete: false, stopped: true, message: 'Replay stopped', code: null })
    assert.equal(context.service.getState().status, 'cancelled')
    assert.deepEqual(context.database.listSessions(), [])
    assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
    await context.database.close()
  })

  for (const provenance of [
    { name: 'missing decoder hash', result: {} },
    { name: 'mismatched decoder hash', result: { recordingSha256: 'f'.repeat(64) } },
  ]) {
    await t.test(provenance.name, async () => {
      const context = await harness()
      const filePath = await recording(context.root)
      const started = await context.service.start(filePath)
      context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-starting' })
      for (const frame of replayFrames(started.runId)) context.service.ingest(frame)
      context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-complete' })

      await context.service.handleReplayFinished({
        runId: started.runId, complete: true, stopped: false, message: 'Replay complete', code: 0, ...provenance.result,
      })

      assert.equal(context.service.getState().status, 'error')
      assert.equal(context.service.getState().reason, 'file-changed')
      assert.equal(context.commits.length, 0)
      assert.deepEqual(context.database.listSessions(), [])
      assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
      await context.database.close()
    })
  }

  await t.test('source file modification', async () => {
    const context = await harness()
    const filePath = await recording(context.root)
    const started = await context.service.start(filePath)
    context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-starting' })
    for (const frame of replayFrames(started.runId)) context.service.ingest(frame)
    context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-complete' })
    await fs.appendFile(filePath, 'changed')
    await context.service.handleReplayFinished({ runId: started.runId, complete: true, stopped: false, message: 'Replay complete', code: 0, recordingSha256: context.service.active.recordingSha256 })
    assert.equal(context.service.getState().reason, 'file-changed')
    assert.deepEqual(context.database.listSessions(), [])
    assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
    await context.database.close()
  })

  await t.test('same-size replacement with restored mtime', async () => {
    const context = await harness()
    const filePath = await recording(context.root)
    const fixedTimestamp = new Date('2026-01-02T03:04:05.000Z')
    await fs.utimes(filePath, fixedTimestamp, fixedTimestamp)
    const original = await fs.readFile(filePath)
    const originalIdentity = await fs.stat(filePath)
    const started = await context.service.start(filePath)
    context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-starting' })
    for (const frame of replayFrames(started.runId)) context.service.ingest(frame)
    context.service.ingest({ protocolVersion: 2, source: 'recording-replay', runId: started.runId, type: 'status', state: 'replay-complete' })

    const replacement = Buffer.alloc(original.length, 0x78)
    assert.notDeepEqual(replacement, original)
    await fs.writeFile(filePath, replacement, { mode: 0o600 })
    await fs.utimes(filePath, fixedTimestamp, fixedTimestamp)
    const replacedIdentity = await fs.stat(filePath)
    assert.equal(replacedIdentity.size, originalIdentity.size)
    assert.equal(replacedIdentity.mtimeMs, originalIdentity.mtimeMs)

    await context.service.handleReplayFinished({ runId: started.runId, complete: true, stopped: false, message: 'Replay complete', code: 0, recordingSha256: context.service.active.recordingSha256 })
    assert.equal(context.service.getState().status, 'error')
    assert.equal(context.service.getState().reason, 'file-changed')
    assert.deepEqual(context.database.listSessions(), [])
    assert.deepEqual(await fs.readdir(context.service.stagingDirectory), [])
    await context.database.close()
  })
})

test('only the correlated import run is consumed and renderer state contains no absolute path', async () => {
  const context = await harness()
  const filePath = await recording(context.root)
  const started = await context.service.start(filePath)
  assert.equal(context.service.owns({ source: 'recording-replay', runId: started.runId }), true)
  assert.equal(context.service.owns({ source: 'recording-replay', runId: 'other-run' }), false)
  assert.equal(context.service.ingest({ source: 'recording-replay', runId: 'other-run', type: 'status' }), false)
  assert.equal(JSON.stringify(context.service.getState()).includes(path.dirname(filePath)), false)
  context.service.stop()
  await context.service.handleReplayFinished({ runId: started.runId, complete: false, stopped: true, message: 'Replay stopped', code: null })
  await context.database.close()
})

test('source filesystem errors are redacted before they enter diagnostics or renderer state', async () => {
  const entries = []
  const context = await harness({ logger: { record: (...entry) => { entries.push(entry) } } })
  const privateDirectory = path.join(context.root, 'private-driver-folder')
  const filePath = path.join(privateDirectory, 'secret-driver-session.apexrec')

  const result = await context.service.start(filePath)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'ENOENT')
  assert.equal(JSON.stringify(result.state).includes(privateDirectory), false)
  const diagnostics = JSON.stringify(entries)
  assert.equal(diagnostics.includes(filePath), false)
  assert.equal(diagnostics.includes(privateDirectory), false)
  assert.equal(diagnostics.includes(path.basename(filePath)), false)
  assert.match(diagnostics, /\[private recording\]/)
  assert.equal(context.bridge.acquisitions.length, 1)
  assert.deepEqual(context.bridge.releases, [context.bridge.acquisitions[0].ownerId])
  await context.database.close()
})

test('startup removes only stale import databases from the private staging directory', async () => {
  const context = await harness()
  const stale = path.join(context.service.stagingDirectory, 'analysis-import-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-123.sqlite3')
  const staleJournal = `${stale}-journal`
  const unrelated = path.join(context.service.stagingDirectory, 'keep-me.txt')
  await fs.writeFile(stale, 'stale')
  await fs.writeFile(staleJournal, 'private rollback journal')
  await fs.writeFile(unrelated, 'user sentinel')
  await fs.chmod(context.service.stagingDirectory, 0o755)
  await context.service.initialize()
  assert.equal((await fs.stat(context.service.stagingDirectory)).mode & 0o777, 0o700)
  assert.equal(await fs.readFile(unrelated, 'utf8'), 'user sentinel')
  await assert.rejects(fs.access(stale))
  await assert.rejects(fs.access(staleJournal))
  await context.database.close()
})
