const assert = require('node:assert/strict')
const test = require('node:test')
const { LiveSessionStore, classifyLap, compactSamples, constants } = require('./live-session-store.cjs')

function fixture(options = {}) {
  let sequence = 0
  let elapsed = 0
  let runId = options.runId || 'run-1'
  let track = options.track || 'Test Circuit'
  const source = options.source || 'lmu-shared-memory'
  const trackLengthM = options.trackLengthM || 1000
  const radius = trackLengthM / (Math.PI * 2)
  const frame = (lap, distanceM, patch = {}) => {
    sequence += 1
    elapsed += patch.deltaSeconds ?? 0.2
    const angle = distanceM / trackLengthM * Math.PI * 2
    return {
      protocolVersion: 1, source, runId, type: 'telemetry', capturedAt: new Date(1_700_000_000_000 + elapsed * 1000).toISOString(), sequence,
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
    status: (state) => ({ protocolVersion: 1, source, runId, type: 'status', state }),
    setRunId: (value) => { runId = value },
    setTrack: (value) => { track = value },
  }
}

function driveLap(store, source, lap, end = 1000) {
  for (let distanceM = 0; distanceM < end; distanceM += 10) store.ingest(source.frame(lap, distanceM))
}

function replayIdentity(runId, makeId = () => { throw new Error('replay identity must not use randomness') }) {
  const store = new LiveSessionStore({ makeId })
  const source = fixture({ source: 'recording-replay', runId })
  driveLap(store, source, 1)
  driveLap(store, source, 2)
  store.ingest(source.frame(3, 0))
  source.setTrack('Second Circuit')
  driveLap(store, source, 1)
  store.ingest(source.frame(2, 0))
  store.ingest(source.status('replay-complete'))
  return store.listSessions().reverse().map((session) => ({
    id: session.id,
    sourceRunId: session.sourceRunId,
    lapIds: session.laps.map((lap) => lap.id),
  }))
}

test('recording replay identities are deterministic across fresh stores and multiple sessions and laps', () => {
  const first = replayIdentity('correlated-import-a')
  const second = replayIdentity('correlated-import-a', () => 'different-random-seed')
  assert.deepEqual(second, first)
  assert.equal(first.length, 2)
  assert.ok(first.every((session) => session.lapIds.length >= 2))
  assert.ok(first.every((session) => session.sourceRunId === 'correlated-import-a'))
  assert.equal(new Set(first.flatMap((session) => [session.id, ...session.lapIds])).size, first.reduce((total, session) => total + session.lapIds.length + 1, 0))
})

test('recording replay identities change with the correlated run ID', () => {
  const first = replayIdentity('correlated-import-a')
  const second = replayIdentity('correlated-import-b')
  assert.notDeepEqual(second.map((session) => session.id), first.map((session) => session.id))
  assert.notDeepEqual(second.flatMap((session) => session.lapIds), first.flatMap((session) => session.lapIds))
})

test('live identities retain their random seed', () => {
  const collect = (seed) => {
    let id = 0
    const store = new LiveSessionStore({ makeId: () => `${seed}-${++id}` })
    const source = fixture()
    store.ingest(source.frame(1, 0))
    const [session] = store.listSessions()
    return { sessionId: session.id, lapId: session.currentLapId }
  }
  assert.notDeepEqual(collect('first'), collect('second'))
})

test('lightweight progress counts sessions and laps without materializing summaries', () => {
  const store = new LiveSessionStore()
  const source = fixture({ source: 'recording-replay' })
  store.ingest(source.frame(1, 0))
  assert.deepEqual(store.getProgress(), { sessions: 1, laps: 1 })

  driveLap(store, source, 1)
  store.ingest(source.frame(2, 0))
  assert.deepEqual(store.getProgress(), { sessions: 1, laps: 2 })

  source.setTrack('Second Circuit')
  store.ingest(source.frame(1, 0))
  assert.deepEqual(store.getProgress(), { sessions: 2, laps: 3 })
})

test('session finalization fires once after archive state and end time are final', () => {
  const finalized = []
  const store = new LiveSessionStore({ onSessionFinalized: (session) => finalized.push(session) })
  const source = fixture({ source: 'recording-replay', runId: 'correlated-import-a' })
  const firstFrame = source.frame(1, 0)
  store.ingest(firstFrame)
  store.ingest(source.status('replay-complete'))
  store.ingest(source.status('replay-complete'))

  assert.equal(finalized.length, 1)
  assert.equal(finalized[0].state, 'finished')
  assert.equal(finalized[0].endedAt, firstFrame.capturedAt)
  assert.equal(finalized[0].sourceRunId, 'correlated-import-a')
  assert.deepEqual(finalized[0], store.listSessions()[0])
})

test('session finalization callback failures are isolated and diagnosed', async () => {
  const entries = []
  const logger = { record: (...args) => { entries.push(args) } }
  const store = new LiveSessionStore({ logger, onSessionFinalized: () => Promise.reject(new Error('test failure')) })
  const source = fixture({ source: 'recording-replay' })
  store.ingest(source.frame(1, 0))
  assert.doesNotThrow(() => store.ingest(source.status('replay-complete')))
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(entries.some((entry) => entry.includes('session-persist-failed')))
})

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
  const lap = store.listSessions()[0].laps[0]
  assert.equal(lap.lapTimeMs, 19_876)
  assert.equal(lap.timingSource, 'official')
})

test('an early LMU lap-number change does not cut off the measured end of the lap', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  for (let distanceM = 0; distanceM < 990; distanceM += 10) {
    store.ingest(source.frame(1, distanceM, { player: { lastLapSeconds: 18, countLapFlag: 1, pathLateralM: 0, trackEdgeM: 8 } }))
  }
  store.ingest(source.frame(2, 990, { player: { lastLapSeconds: 19.876, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  assert.equal(store.listSessions()[0].laps.filter((lap) => lap.state === 'complete').length, 0)

  store.ingest(source.frame(2, 0, { player: { lastLapSeconds: 19.876, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  const lap = store.listSessions()[0].laps[0]
  assert.equal(lap.sampleCount, 100)
  assert.equal(lap.lapTimeMs, 19_876)
  assert.equal(lap.timingSource, 'official')
  assert.equal(finalized[0].samples.at(-1).distanceM, 990)
})

test('a distance wrap advances the analysis lap even when the scoring counter catches up one frame later', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  driveLap(store, source, 1)
  store.ingest(source.frame(1, 0, { player: { lastLapSeconds: 19.5 } }))
  let session = store.listSessions()[0]
  assert.equal(session.laps[0].number, 1)
  assert.equal(session.laps[0].lapTimeMs, 19_500)
  assert.equal(session.laps.at(-1).number, 2)
  assert.equal(session.currentLapId, session.laps.at(-1).id)

  store.ingest(source.frame(2, 10, { player: { lastLapSeconds: 19.5 } }))
  for (let distanceM = 20; distanceM < 1000; distanceM += 10) store.ingest(source.frame(2, distanceM, { player: { lastLapSeconds: 19.5 } }))
  store.ingest(source.frame(2, 0, { player: { lastLapSeconds: 20.25 } }))
  store.ingest(source.frame(3, 10, { player: { lastLapSeconds: 20.25 } }))

  session = store.listSessions()[0]
  assert.deepEqual(session.laps.map((lap) => lap.number), [1, 2, 3])
  assert.deepEqual(finalized.map((event) => event.lap.lapTimeMs), [19_500, 20_250])
  assert.equal(new Set(session.laps.map((lap) => lap.id)).size, 3)
})

test('a signed raw lap coordinate closes the lap while normalized distance stays unavailable', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) store.ingest(source.frame(1, distanceM))
  store.ingest(source.frame(2, -5, { player: { lapDistanceM: null, lapDistanceRawM: -5, lastLapSeconds: 19.876 } }))
  const [lap] = store.listSessions()[0].laps
  assert.equal(lap.state, 'complete')
  assert.equal(lap.lapTimeMs, 19_876)
  assert.equal(lap.timingSource, 'official')
  assert.equal(lap.sampleCount, 100)
})

test('a delayed official LMU time resolves the preceding lap without reusing the stale value', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) {
    store.ingest(source.frame(1, distanceM, { player: { lastLapSeconds: 18, countLapFlag: distanceM < 500 ? 1 : 2, pathLateralM: 0, trackEdgeM: 8 } }))
  }
  store.ingest(source.frame(2, 0, { player: { lastLapSeconds: 18, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  assert.equal(finalized.length, 0)
  assert.equal(store.listSessions()[0].laps[0].officialTimePending, true)

  store.ingest(source.frame(2, 10, { player: { lastLapSeconds: 19.876, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  const lap = store.listSessions()[0].laps[0]
  assert.equal(finalized.length, 1)
  assert.equal(lap.lapTimeMs, 19_876)
  assert.equal(lap.timingSource, 'official')
  assert.equal(lap.referenceEligible, true)
  assert.equal(lap.trackModelEligible, true)
  assert.equal(lap.officialTimePending, false)
})

test('all count-with-time flags still wait for a delayed published LMU time', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) {
    store.ingest(source.frame(1, distanceM, { player: { lastLapSeconds: 18, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  }
  store.ingest(source.frame(2, 0, { player: { lastLapSeconds: 18, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  assert.equal(store.listSessions()[0].laps[0].officialTimePending, true)

  store.ingest(source.frame(2, 10, { player: { lastLapSeconds: 19.876, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  const lap = store.listSessions()[0].laps[0]
  assert.equal(lap.lapTimeMs, 19_876)
  assert.equal(lap.timingSource, 'official')
  assert.equal(lap.referenceEligible, true)
  assert.equal(lap.trackModelEligible, true)
})

test('a publication arriving after timeout is quarantined from the active lap', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  const timed = (lastLapSeconds) => ({ player: { lastLapSeconds, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } })
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) store.ingest(source.frame(1, distanceM, timed(18)))
  store.ingest(source.frame(2, 0, timed(18)))
  for (let distanceM = 10; distanceM <= 60; distanceM += 10) store.ingest(source.frame(2, distanceM, timed(18)))
  assert.equal(finalized[0].lap.lapTimeMs, null)

  // This is lap 1's late publication. It arrives while lap 2 is active and
  // must consume lap 1's quarantine token rather than become lap 2's PB.
  store.ingest(source.frame(2, 70, timed(19.5)))
  for (let distanceM = 80; distanceM < 1000; distanceM += 10) store.ingest(source.frame(2, distanceM, timed(19.5)))
  store.ingest(source.frame(3, 0, timed(19.5)))
  for (let distanceM = 10; distanceM <= 60; distanceM += 10) store.ingest(source.frame(3, distanceM, timed(19.5)))

  assert.equal(finalized.length, 2)
  assert.deepEqual(finalized.map((event) => event.lap.lapTimeMs), [null, null])
  assert.deepEqual(finalized.map((event) => event.lap.referenceEligible), [false, false])
  assert.equal(store.listSessions()[0].laps[1].timingSource, 'unavailable')
})

test('an unused quarantine expires when scoring advances at the following boundary', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  const timed = (lastLapSeconds) => ({ player: { lastLapSeconds, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } })
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) store.ingest(source.frame(1, distanceM, timed(18)))
  store.ingest(source.frame(2, 0, timed(18)))
  for (let distanceM = 10; distanceM < 1000; distanceM += 10) store.ingest(source.frame(2, distanceM, timed(18)))
  assert.equal(finalized[0].lap.lapTimeMs, null)

  store.ingest(source.frame(3, 0, timed(20.25)))

  assert.equal(finalized.length, 2)
  assert.deepEqual(finalized.map((event) => event.lap.lapTimeMs), [null, 20_250])
  assert.equal(finalized[1].lap.referenceEligible, true)
})

test('a publication consumed by a pending lap advances the register baseline for the active lap', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  const timed = (lastLapSeconds) => ({ player: { lastLapSeconds, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } })
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) store.ingest(source.frame(1, distanceM, timed(18)))
  store.ingest(source.frame(2, 0, timed(18)))
  store.ingest(source.frame(2, 10, timed(19.125)))
  assert.equal(finalized[0].lap.lapTimeMs, 19_125)

  for (let distanceM = 20; distanceM < 1000; distanceM += 10) store.ingest(source.frame(2, distanceM, timed(19.125)))
  store.ingest(source.frame(3, 0, timed(19.125)))
  assert.equal(store.listSessions()[0].laps[1].officialTimePending, true)
  for (let distanceM = 10; distanceM <= 60; distanceM += 10) store.ingest(source.frame(3, distanceM, timed(19.125)))

  assert.equal(finalized.length, 2)
  assert.deepEqual(finalized.map((event) => event.lap.lapTimeMs), [19_125, null])
  assert.equal(finalized[1].lap.referenceEligible, false)
})

test('reset then an exactly equal value creates a new publication for the pending lap', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  const timed = (lastLapSeconds) => ({ player: { lastLapSeconds, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } })
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) store.ingest(source.frame(1, distanceM, timed(19.125)))
  store.ingest(source.frame(2, 0, timed(19.125)))
  assert.equal(store.listSessions()[0].laps[0].officialTimePending, true)

  store.ingest(source.frame(2, 10, timed(0)))
  store.ingest(source.frame(2, 20, timed(19.125)))

  assert.equal(finalized.length, 1)
  assert.equal(finalized[0].lap.lapTimeMs, 19_125)
  assert.equal(finalized[0].lap.timingSource, 'official')
  assert.equal(finalized[0].lap.referenceEligible, true)
})

test('two consecutive delayed publications are each consumed exactly once by their own lap', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  const timed = (lastLapSeconds) => ({ player: { lastLapSeconds, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } })
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) store.ingest(source.frame(1, distanceM, timed(18)))
  store.ingest(source.frame(2, 0, timed(18)))
  store.ingest(source.frame(2, 10, timed(19.125)))
  for (let distanceM = 20; distanceM < 1000; distanceM += 10) store.ingest(source.frame(2, distanceM, timed(19.125)))
  store.ingest(source.frame(3, 0, timed(19.125)))
  store.ingest(source.frame(3, 10, timed(20.25)))

  assert.equal(finalized.length, 2)
  assert.deepEqual(finalized.map((event) => event.lap.number), [1, 2])
  assert.deepEqual(finalized.map((event) => event.lap.lapTimeMs), [19_125, 20_250])
  assert.deepEqual(finalized.map((event) => event.lap.timingSource), ['official', 'official'])
  assert.equal(new Set(finalized.map((event) => event.lap.id)).size, 2)
})

test('an untimed LMU lap stays replayable but cannot become a PB or track-model source', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) store.ingest(source.frame(1, distanceM, { player: { countLapFlag: 1, pathLateralM: 0, trackEdgeM: 8 } }))
  store.ingest(source.frame(2, 0, { player: { countLapFlag: 1, pathLateralM: 0, trackEdgeM: 8 } }))
  for (let distanceM = 10; distanceM <= 60; distanceM += 10) store.ingest(source.frame(2, distanceM, { player: { countLapFlag: 1, pathLateralM: 0, trackEdgeM: 8 } }))
  const lap = store.listSessions()[0].laps[0]
  assert.equal(lap.quality, 'clean')
  assert.equal(lap.lapTimeMs, null)
  assert.equal(lap.timingSource, 'unavailable')
  assert.equal(lap.replayable, true)
  assert.equal(lap.referenceEligible, false)
  assert.equal(lap.trackModelEligible, false)
  assert.ok(lap.reasons.includes('lap-invalidated'))
  assert.equal(finalized[0].samples.length, 100)
})

test('count-with-time scoring flags never synthesize an official time from replay samples', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) {
    store.ingest(source.frame(1, distanceM, { player: { countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  }
  store.ingest(source.frame(2, 0, { player: { countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  for (let distanceM = 10; distanceM <= 60; distanceM += 10) {
    store.ingest(source.frame(2, distanceM, { player: { countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  }

  const lap = store.listSessions()[0].laps[0]
  assert.equal(lap.state, 'complete')
  assert.equal(lap.quality, 'clean')
  assert.equal(lap.lapTimeMs, null)
  assert.equal(lap.timingSource, 'unavailable')
  assert.equal(lap.replayable, true)
  assert.equal(lap.referenceEligible, false)
  assert.equal(lap.trackModelEligible, false)
  assert.equal(finalized[0].lap.lapTimeMs, null)
  assert.equal(finalized[0].lap.timingSource, 'unavailable')
  assert.equal(finalized[0].samples.length, 100)
  assert.ok(finalized[0].samples.at(-1).lapElapsedSeconds > finalized[0].samples[0].lapElapsedSeconds)
})

test('mixed scoring flags cannot leak an untimed lap into the track model', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) {
    store.ingest(source.frame(1, distanceM, { player: { countLapFlag: distanceM < 500 ? 1 : 2, pathLateralM: 0, trackEdgeM: 8 } }))
  }
  store.ingest(source.frame(2, 0, { player: { countLapFlag: 1, pathLateralM: 0, trackEdgeM: 8 } }))
  for (let distanceM = 10; distanceM <= 60; distanceM += 10) store.ingest(source.frame(2, distanceM, { player: { countLapFlag: 1, pathLateralM: 0, trackEdgeM: 8 } }))
  const lap = store.listSessions()[0].laps[0]
  assert.equal(lap.referenceEligible, false)
  assert.equal(lap.trackModelEligible, false)
  assert.ok(lap.reasons.includes('lap-invalidated'))
})

test('an official LMU lap time authorizes the PB even when scoring flags were transitional', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  for (let distanceM = 0; distanceM < 1000; distanceM += 10) store.ingest(source.frame(1, distanceM, { player: { countLapFlag: 1 } }))
  store.ingest(source.frame(2, 0, { player: { lastLapSeconds: 19.876, countLapFlag: 2 } }))
  const lap = store.listSessions()[0].laps[0]
  assert.equal(lap.referenceEligible, true)
  assert.ok(!lap.reasons.includes('lap-invalidated'))
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

test('transient invalid data preserves an active lap while stale data interrupts it', () => {
  const store = new LiveSessionStore({ makeId: () => 'stable' })
  const source = fixture()
  store.ingest(source.frame(1, 100))
  store.ingest(source.status('invalid-data'))
  assert.equal(store.listSessions()[0].state, 'active')
  assert.equal(store.listSessions()[0].interruptionCount, 0)
  store.ingest(source.status('stale-data'))
  assert.equal(store.listSessions()[0].state, 'interrupted')
  assert.equal(store.listSessions()[0].interruptionCount, 1)
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

test('quality v2 treats validated 15.5 metre scoring cadence as full route evidence', () => {
  const trackLengthM = 5161.882
  const samples = []
  for (let distanceM = 0; distanceM < trackLengthM; distanceM += 15.5) samples.push({ distanceM })
  const result = classifyLap({ state: 'complete', reasons: new Set(), samples }, trackLengthM)
  assert.equal(constants.QUALITY_POLICY_VERSION, 'lap-quality-v2')
  assert.equal(constants.COVERAGE_BIN_M, 16)
  assert.equal(constants.MAX_CLEAN_GAP_M, 32)
  assert.equal(result.quality, 'clean')
  assert.ok(result.coverage >= constants.CLEAN_COVERAGE)
  assert.ok(result.maximumGapM <= constants.MAX_CLEAN_GAP_M)
})

test('a contiguous route hole stays limited even when occupied-bin coverage exceeds 97 percent', () => {
  const trackLengthM = 5000
  const samples = []
  for (let distanceM = 0; distanceM < trackLengthM; distanceM += 10) {
    if (distanceM < 2400 || distanceM > 2450) samples.push({ distanceM })
  }
  const result = classifyLap({ state: 'complete', reasons: new Set(), samples }, trackLengthM)
  assert.ok(result.coverage >= constants.CLEAN_COVERAGE)
  assert.ok(result.maximumGapM > constants.MAX_CLEAN_GAP_M)
  assert.equal(result.quality, 'limited')
  assert.ok(result.reasons.includes('coverage-low'))
})

test('route continuity measures the true circular gap across start and finish', () => {
  const samples = []
  for (let distanceM = 20; distanceM <= 980; distanceM += 16) samples.push({ distanceM })
  const result = classifyLap({ state: 'complete', reasons: new Set(), samples }, 1000)
  assert.equal(result.maximumGapM, 40)
  assert.equal(result.quality, 'limited')
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

test('an abnormally long current lap stays bounded in O(1) space and cannot masquerade as replayable evidence', () => {
  const finalized = []
  const store = new LiveSessionStore({ makeId: () => 'stable', onLapFinalized: (event) => finalized.push(event) })
  const source = fixture()
  const limit = store.getHealth().currentLapSampleLimit

  for (let index = 0; index < limit + 2048; index += 1) {
    const distanceM = Math.min(999, index)
    store.ingest(source.frame(1, distanceM, { player: { countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  }

  const current = store.active.currentLap
  assert.equal(current.samples.length, limit)
  assert.equal(current.samples[0].distanceM, 0, 'overflow must not shift the retained array')
  assert.equal(current.samples.at(-1).distanceM, 999, 'the bounded tail slot remains current')
  assert.ok(current.reasons.has('sample-overflow'))
  assert.equal(store.getHealth().sampleOverflowLaps, 1)

  store.ingest(source.frame(2, 0, { player: { lastLapSeconds: 400, countLapFlag: 2, pathLateralM: 0, trackEdgeM: 8 } }))
  assert.equal(finalized.length, 1)
  assert.equal(finalized[0].samples.length, limit)
  assert.equal(finalized[0].lap.state, 'complete')
  assert.equal(finalized[0].lap.quality, 'ineligible')
  assert.ok(finalized[0].lap.reasons.includes('sample-overflow'))
  assert.equal(finalized[0].lap.replayable, false)
  assert.equal(finalized[0].lap.referenceEligible, false)
  assert.equal(finalized[0].lap.trackModelEligible, false)
})

test('memory pressure evicts old payloads transparently while retaining every lap summary', () => {
  const store = new LiveSessionStore({ makeId: (() => { let id = 0; return () => `id-${++id}` })(), memoryBudgetBytes: 8000 })
  const source = fixture()
  for (let lap = 1; lap <= 5; lap += 1) driveLap(store, source, lap)
  store.ingest(source.frame(6, 0))
  for (let distanceM = 10; distanceM <= 60; distanceM += 10) store.ingest(source.frame(6, distanceM))
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
  for (let distanceM = 10; distanceM <= 60; distanceM += 10) store.ingest(source.frame(2, distanceM))
  await new Promise((resolve) => setImmediate(resolve))
  const text = JSON.stringify(entries)
  assert.match(text, /analysis-lap-finalized/)
  assert.doesNotMatch(text, /worldPosition|throttle|brake|Test Car|Test Circuit/)
})
