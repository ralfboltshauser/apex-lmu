const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { TelemetryDatabase } = require('./telemetry-database.cjs')

function event({ sessionId = 'session-1', lapId = 'lap-1', lapTimeMs = 90_000, source = 'live', lateral = 2, startedAt = '2026-07-13T10:00:00.000Z' } = {}) {
  const radius = 100
  const length = 2 * Math.PI * radius
  const samples = []
  for (let distance = 0; distance < length; distance += 1) {
    const angle = distance / radius
    samples.push({ distanceM: distance, rawDistanceM: distance, distanceIndexM: distance, x: Math.cos(angle) * (radius + lateral), y: 0, z: Math.sin(angle) * (radius + lateral), brake: 0, throttle: 1, steering: 0, clutch: 0, gear: 4, rpm: 7000, pathLateralM: lateral, trackEdgeM: 8, countLapFlag: 2, speedKph: 150, elapsedSeconds: distance / 40, lapElapsedSeconds: distance / 40 })
  }
  return {
    schemaVersion: 1, qualityPolicyVersion: 'lap-quality-v1',
    session: { id: sessionId, source, state: 'active', startedAt, updatedAt: startedAt, trackKey: 'test||628', track: { name: 'Test', layout: '', lengthM: length }, car: { id: 7, name: 'Test Car', class: 'GT3' }, interruptionCount: 0 },
    lap: { id: lapId, number: 1, state: 'complete', startedAt, endedAt: startedAt, lapTimeMs, quality: 'clean', reasons: [], coverage: 1, maximumGapM: 1, sampleCount: samples.length, replayable: true, referenceEligible: true, trackModelEligible: true },
    samples,
  }
}

async function temporary() { return fs.mkdtemp(path.join(os.tmpdir(), 'apex-telemetry-db-')) }

test('full-resolution laps survive restart with deterministic hashes, track model, and PB', async () => {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  let database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  const first = await database.enqueueFinalized(event({ lapId: 'lap-1', lapTimeMs: 91_000 }))
  const second = await database.enqueueFinalized(event({ lapId: 'lap-2', lapTimeMs: 89_000 }))
  assert.equal(first.written, true); assert.equal(second.written, true)
  assert.equal(database.listSessions()[0].laps.length, 2)
  await database.close({ requireDurable: true })

  database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  const payload = database.getLap('session-1', 'lap-1')
  assert.equal(payload.samples.length, event().samples.length)
  assert.equal(payload.payloadHash, first.payloadHash)
  assert.equal(payload.personalBest.lap.id, 'lap-2')
  assert.equal(payload.trackModel.published, true)
  await database.close()
})

test('ordinary raw-recording replay never enters durable lap history', async () => {
  const root = await temporary()
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  const result = await database.enqueueFinalized(event({ source: 'recording-replay' }))
  assert.equal(result.reason, 'source-not-persisted')
  assert.deepEqual(database.listSessions(), [])
  await database.close()
})

test('payload corruption is detected before samples reach the renderer', async () => {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  let database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  await database.enqueueFinalized(event())
  await database.close()
  const raw = new DatabaseSync(databasePath)
  raw.prepare("UPDATE lap_payloads SET compressed=x'00010203' WHERE lap_id='lap-1'").run()
  raw.close()
  database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  assert.throws(() => database.getLap('session-1', 'lap-1'))
  await database.close()
})

test('retention rebuilds derived models after deleting source laps', async () => {
  const root = await temporary()
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0', maxSessions: 1 })
  await database.enqueueFinalized(event({ sessionId: 'older', lapId: 'older-lap', lapTimeMs: 89_000, startedAt: '2026-07-13T10:00:00.000Z' }))
  await database.enqueueFinalized(event({ sessionId: 'newer', lapId: 'newer-lap', lapTimeMs: 91_000, startedAt: '2026-07-13T11:00:00.000Z' }))

  const sessions = database.listSessions()
  assert.deepEqual(sessions.map((session) => session.id), ['newer', 'older'])
  // The older session is the PB and is retained; force byte retention to remove
  // the non-PB source and ensure its geometry is no longer advertised.
  database.maxBytes = 1
  database.enforceRetention()
  assert.deepEqual(database.listSessions().map((session) => session.id), ['older'])
  assert.equal(database.getLap('older', 'older-lap').trackModel, null)
  await database.close()
})
