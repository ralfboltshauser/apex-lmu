const assert = require('node:assert/strict')
const test = require('node:test')
const { LiveSessionStore, compactSamples, constants } = require('./live-session-store.cjs')

function fixture(options = {}) {
  let sequence = 0
  let elapsed = 0
  let runId = options.runId || 'run-1'
  let track = options.track || 'Test Circuit'
  const trackLengthM = options.trackLengthM || 1000
  const radius = trackLengthM / (Math.PI * 2)
  const frame = (lap, distanceM, patch = {}) => {
    sequence += 1
    elapsed += patch.deltaSeconds ?? 0.2
    const angle = distanceM / trackLengthM * Math.PI * 2
    return {
      protocolVersion: 1, source: 'lmu-shared-memory', runId, type: 'telemetry', capturedAt: new Date(1_700_000_000_000 + elapsed * 1000).toISOString(), sequence,
      playerTelemetryAvailable: patch.playerTelemetryAvailable ?? true,
      session: { track, layout: '', elapsedSeconds: elapsed, trackLengthM, phase: 5, inRealtime: true },
      player: {
        id: 7, name: 'Test Car', class: 'GT3', lap, lapStartSeconds: (lap - 1) * 20, gameElapsedSeconds: elapsed,
        lapDistanceM: distanceM, worldPositionM: { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius },
        speedKph: 180, throttle: 0.8, brake: distanceM >= 300 && distanceM <= 380 ? 0.7 : 0, steering: 0,
        controlOwner: 'local-player', inPits: false, pitState: 0,
        ...patch.player,
      },
      opponents: [],
    }
  }
  return {
    frame,
    status: (state) => ({ protocolVersion: 1, source: 'lmu-shared-memory', runId, type: 'status', state }),
    setRunId: (value) => { runId = value },
    setTrack: (value) => { track = value },
  }
}

function driveLap(store, source, lap, end = 1000) {
  for (let distanceM = 0; distanceM < end; distanceM += 10) store.ingest(source.frame(lap, distanceM))
}

test('completed laps remain selectable when the driver stops a quarter into the next lap', () => {
  const store = new LiveSessionStore({ makeId: (() => { let id = 0; return () => `id-${++id}` })() })
  const source = fixture()
  driveLap(store, source, 1)
  driveLap(store, source, 2)
  driveLap(store, source, 3)
  driveLap(store, source, 4, 250)

  const [session] = store.listSessions()
  assert.equal(session.laps.length, 4)
  assert.deepEqual(session.laps.slice(0, 3).map((lap) => lap.state), ['complete', 'complete', 'complete'])
  assert.deepEqual(session.laps.slice(0, 3).map((lap) => lap.quality), ['clean', 'clean', 'clean'])
  assert.equal(session.laps[3].state, 'current')
  assert.equal(session.currentLapId, session.laps[3].id)
})

test('a completed lap uses the official LMU lap time when the boundary publishes it', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  driveLap(store, source, 1)
  store.ingest(source.frame(2, 0, { player: { lastLapSeconds: 19.876 } }))
  assert.equal(store.listSessions()[0].laps[0].lapTimeMs, 19_876)
})

test('waiting and disconnect statuses preserve the logical session and completed laps', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  driveLap(store, source, 1)
  store.ingest(source.frame(2, 0))
  const before = store.listSessions()[0]
  store.ingest(source.status('waiting-for-vehicle'))
  assert.equal(store.listSessions()[0].state, 'interrupted')
  store.ingest(source.status('disconnected'))
  store.ingest(source.frame(2, 10))
  const after = store.listSessions()[0]
  assert.equal(after.id, before.id)
  assert.equal(after.state, 'active')
  assert.equal(after.laps[0].state, 'complete')
})

test('a bridge run change becomes a source segment without erasing a compatible LMU session', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  driveLap(store, source, 1)
  source.setRunId('run-2')
  store.ingest(source.frame(2, 0))
  const [session] = store.listSessions()
  assert.equal(store.listSessions().length, 1)
  assert.equal(session.sourceSegmentCount, 2)
  assert.equal(session.laps[0].state, 'complete')
})

test('a genuine track boundary archives rather than clears the previous session', () => {
  const store = new LiveSessionStore({ makeId: (() => { let id = 0; return () => `id-${++id}` })() })
  const source = fixture()
  driveLap(store, source, 1)
  store.ingest(source.frame(2, 0))
  source.setTrack('Second Circuit')
  store.ingest(source.frame(1, 0))
  const sessions = store.listSessions()
  assert.equal(sessions.length, 2)
  assert.equal(sessions[0].track.name, 'Second Circuit')
  assert.equal(sessions[1].track.name, 'Test Circuit')
  assert.equal(sessions[1].state, 'finished')
  assert.equal(sessions[1].laps[0].state, 'complete')
})

test('a car change archives the old laps instead of mixing incompatible traces', () => {
  const store = new LiveSessionStore({ makeId: (() => { let id = 0; return () => `id-${++id}` })() })
  const source = fixture()
  driveLap(store, source, 1)
  store.ingest(source.frame(2, 0))
  store.ingest(source.frame(2, 10, { player: { name: 'Different Car' } }))
  const sessions = store.listSessions()
  assert.equal(sessions.length, 2)
  assert.equal(sessions[0].car.name, 'Different Car')
  assert.equal(sessions[1].car.name, 'Test Car')
  assert.equal(sessions[1].laps[0].state, 'complete')
})

test('repeated LMU game-time snapshots are deduplicated without invalidating the lap', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) {
    store.ingest(source.frame(1, distanceM))
    store.ingest(source.frame(1, distanceM, { deltaSeconds: 0 }))
  }
  store.ingest(source.frame(2, 0))
  const lap = store.listSessions()[0].laps[0]
  assert.equal(lap.quality, 'clean')
  assert.equal(lap.sampleCount, 100)
})

test('isolated missing samples are explained without poisoning an otherwise complete lap', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) {
    const patch = distanceM === 500 ? { player: { worldPositionM: undefined } } : {}
    store.ingest(source.frame(1, distanceM, patch))
  }
  store.ingest(source.frame(2, 0))
  const lap = store.listSessions()[0].laps[0]
  assert.equal(lap.state, 'complete')
  assert.equal(lap.quality, 'clean')
  assert.ok(lap.reasons.includes('missing-sample'))
})

test('pit and confirmed AI intervals retain the lap but exclude it as a clean reference', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) {
    const player = distanceM === 400 || distanceM === 410 ? { controlOwner: 'ai' } : distanceM === 700 || distanceM === 710 ? { inPits: true, pitState: 3 } : {}
    store.ingest(source.frame(1, distanceM, { player }))
  }
  store.ingest(source.frame(2, 0))
  const lap = store.listSessions()[0].laps[0]
  assert.equal(lap.state, 'complete')
  assert.equal(lap.quality, 'ineligible')
  assert.ok(lap.reasons.includes('ai-control'))
  assert.ok(lap.reasons.includes('pit'))
})

test('compaction is bounded and preserves pedal threshold transitions', () => {
  const samples = Array.from({ length: 10_000 }, (_, index) => ({ distanceM: index, x: index, z: 0, speedKph: 100 + Math.sin(index / 50), brake: index >= 4321 && index < 4500 ? 0.8 : 0, throttle: index >= 5000 ? 1 : 0, steering: 0, elapsedSeconds: index / 50, lapElapsedSeconds: index / 50 }))
  const compacted = compactSamples(samples)
  assert.ok(compacted.length <= constants.MAX_FINAL_SAMPLES)
  assert.equal(compacted[0].distanceM, 0)
  assert.equal(compacted.at(-1).distanceM, 9999)
  assert.ok(compacted.some((sample) => sample.distanceM === 4321 && sample.brake === 0.8))
  assert.ok(compacted.some((sample) => sample.distanceM === 5000 && sample.throttle === 1))
})

test('memory pressure evicts old payloads transparently while retaining every lap summary', () => {
  const store = new LiveSessionStore({ makeId: (() => { let id = 0; return () => `id-${++id}` })(), memoryBudgetBytes: 8000 })
  const source = fixture()
  for (let lap = 1; lap <= 5; lap += 1) driveLap(store, source, lap)
  store.ingest(source.frame(6, 0))
  const session = store.listSessions()[0]
  assert.equal(session.laps.filter((lap) => lap.state === 'complete').length, 5)
  assert.ok(session.laps.filter((lap) => lap.state === 'complete' && !lap.samplesAvailable).length >= 4)
  assert.equal(session.laps[4].samplesAvailable, true)
  assert.ok(store.getHealth().evictedLapPayloads >= 4)
})

test('diagnostic events contain quality aggregates but no raw positions or controls', async () => {
  const entries = []
  const store = new LiveSessionStore({ makeId: () => 'stable', logger: { record: async (...args) => { entries.push(args) } } })
  const source = fixture()
  driveLap(store, source, 1)
  store.ingest(source.frame(2, 0))
  await new Promise((resolve) => setImmediate(resolve))
  const text = JSON.stringify(entries)
  assert.match(text, /analysis-lap-finalized/)
  assert.doesNotMatch(text, /worldPosition|throttle|brake|Test Car|Test Circuit/)
})
