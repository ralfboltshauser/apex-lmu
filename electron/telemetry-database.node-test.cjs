const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { TelemetryDatabase } = require('./telemetry-database.cjs')
const { constants: { QUALITY_POLICY_VERSION } } = require('./live-session-store.cjs')

function event({ sessionId = 'session-1', lapId = 'lap-1', lapNumber = 1, lapTimeMs = 90_000, timingSource = lapTimeMs === null ? 'unavailable' : 'official', source = 'live', lateral = 2, startedAt = '2026-07-13T10:00:00.000Z', trackKey = 'test||628', trackName = 'Test', layoutName = '', carId = 7, carName = 'Test Car', carClass = 'GT3', qualityPolicyVersion = QUALITY_POLICY_VERSION } = {}) {
  const radius = 100
  const length = 2 * Math.PI * radius
  const samples = []
  for (let distance = 0; distance < length; distance += 1) {
    const angle = distance / radius
    samples.push({ distanceM: distance, rawDistanceM: distance, distanceIndexM: distance, x: Math.cos(angle) * (radius + lateral), y: 0, z: Math.sin(angle) * (radius + lateral), brake: 0, throttle: 1, steering: 0, clutch: 0, gear: 4, rpm: 7000, pathLateralM: lateral, trackEdgeM: 8, countLapFlag: 2, speedKph: 150, elapsedSeconds: distance / 40, lapElapsedSeconds: distance / 40 })
  }
  return {
    schemaVersion: 1, qualityPolicyVersion,
    session: { id: sessionId, source, state: 'active', startedAt, updatedAt: startedAt, trackKey, track: { name: trackName, layout: layoutName, lengthM: length }, car: { id: carId, name: carName, class: carClass }, interruptionCount: 0 },
    lap: { id: lapId, number: lapNumber, state: 'complete', startedAt, endedAt: startedAt, lapTimeMs, timingSource, quality: 'clean', reasons: [], coverage: 1, maximumGapM: 1, sampleCount: samples.length, replayable: true, referenceEligible: timingSource === 'official', trackModelEligible: timingSource === 'official' },
    samples,
  }
}

async function temporary() { return fs.mkdtemp(path.join(os.tmpdir(), 'apex-telemetry-db-')) }

test('opening telemetry storage repairs private directory and database permissions', async () => {
  const root = await temporary()
  await fs.chmod(root, 0o755)
  const databasePath = path.join(root, 'telemetry.sqlite3')
  const database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  assert.equal((await fs.stat(root)).mode & 0o777, 0o700)
  assert.equal((await fs.stat(databasePath)).mode & 0o777, 0o600)
  await database.close()
})

function importMetadata(overrides = {}) {
  return {
    id: 'import-test-v1',
    recordingSha256: 'a'.repeat(64),
    recordingFormat: 'apex-lmu-raw-v1',
    processingVersion: 'apexrec-analysis-v1',
    importedAt: '2026-07-17T12:00:00.000Z',
    appVersion: '1.0.0',
    ...overrides,
  }
}

async function createStaging(root, events = [event({ source: 'recording-replay' })], { finish = true, deferPerLapTrackModels = false, now = undefined } = {}) {
  const databasePath = path.join(root, `staging-${Math.random().toString(16).slice(2)}.sqlite3`)
  const database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0', persistReplay: true, deferPerLapTrackModels, now })
  for (const finalized of events) await database.enqueueFinalized(finalized)
  if (finish && events.length) {
    const last = events.at(-1)
    await database.enqueueSessionFinalized({ id: last.session.id, source: 'recording-replay', endedAt: '2026-07-13T10:30:00.000Z', interruptionCount: 2 })
  }
  await database.close({ requireDurable: true })
  return databasePath
}

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
  const sessionResult = await database.enqueueSessionFinalized({ id: 'session-1', source: 'recording-replay', endedAt: '2026-07-13T10:30:00.000Z', interruptionCount: 0 })
  assert.equal(result.reason, 'source-not-persisted')
  assert.equal(sessionResult.reason, 'source-not-persisted')
  assert.deepEqual(database.listSessions(), [])
  await database.close()
})

test('an untimed lap remains durably replayable without pace or PB eligibility', async () => {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  const untimed = event({ lapTimeMs: null })
  let database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  await database.enqueueFinalized(untimed)
  await database.close({ requireDurable: true })

  database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  const payload = database.getLap('session-1', 'lap-1')
  assert.equal(payload.lap.lapTimeMs, null)
  assert.equal(payload.lap.timingSource, 'unavailable')
  assert.equal(payload.lap.replayable, true)
  assert.equal(payload.lap.referenceEligible, false)
  assert.equal(payload.personalBest, null)
  assert.equal(payload.samples.length, untimed.samples.length)
  assert.equal(payload.samples.at(-1).lapElapsedSeconds, untimed.samples.at(-1).lapElapsedSeconds)
  await database.close()
})

test('durable writes reject timing values that conflict with their provenance', async () => {
  const root = await temporary()
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  await assert.rejects(database.enqueueFinalized(event({ timingSource: 'unavailable' })), /timing provenance conflicts/)
  await assert.rejects(database.enqueueFinalized(event({ lapTimeMs: null, timingSource: 'official' })), /timing provenance conflicts/)
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
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0', maxSessions: 2 })
  await database.enqueueFinalized(event({ sessionId: 'older', lapId: 'older-lap', lapTimeMs: 89_000, startedAt: '2026-07-13T10:00:00.000Z' }))
  await database.enqueueFinalized(event({ sessionId: 'newer', lapId: 'newer-lap', lapTimeMs: 91_000, startedAt: '2026-07-13T11:00:00.000Z' }))

  assert.deepEqual(database.listSessions().map((session) => session.id), ['newer', 'older'])
  assert.equal(database.getLap('older', 'older-lap').trackModel.published, true)
  // The older PB wins the one-session preference. Deleting the newer source
  // must also withdraw the now-uncorroborated derived model.
  database.maxSessions = 1
  database.enforceRetention()
  assert.deepEqual(database.listSessions().map((session) => session.id), ['older'])
  assert.equal(database.getLap('older', 'older-lap').trackModel, null)
  await database.close()
})

test('schema v1 migrates additively to v4 without changing replay payloads', async () => {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  let database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  const written = await database.enqueueFinalized(event())
  await database.close({ requireDurable: true })

  const legacy = new DatabaseSync(databasePath)
  legacy.exec('DROP INDEX laps_pb; CREATE INDEX laps_pb ON laps(reference_eligible,lap_time_ms); ALTER TABLE laps DROP COLUMN timing_source; DROP TABLE recording_import_sessions; DROP TABLE recording_imports; ALTER TABLE sessions DROP COLUMN quality_policy_version; DELETE FROM schema_migrations WHERE version>=2; DELETE FROM app_metadata WHERE key=\'quality_policy_version\'; PRAGMA user_version=1;')
  legacy.prepare("UPDATE app_metadata SET value='1' WHERE key='schema_version'").run()
  legacy.close()

  database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.1.0' })
  assert.equal(database.getHealth().schemaVersion, 4)
  const migrated = database.getLap('session-1', 'lap-1')
  assert.equal(migrated.payloadHash, written.payloadHash)
  assert.equal(migrated.lap.timingSource, 'legacy-unknown')
  assert.equal(migrated.lap.lapTimeMs, null)
  assert.equal(migrated.lap.referenceEligible, false)
  assert.equal(migrated.personalBest, null)
  assert.equal(Number(database.database.prepare("SELECT lap_time_ms AS lapTimeMs FROM laps WHERE id='lap-1'").get().lapTimeMs), 90_000)
  assert.equal(database.listSessions()[0].qualityPolicyVersion, 'lap-quality-v1')
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)
  await database.close()
})

test('a tampered v1 migration is rejected before the original database is changed', async () => {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  let database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  await database.enqueueFinalized(event())
  await database.close({ requireDurable: true })
  const legacy = new DatabaseSync(databasePath)
  legacy.exec("DROP INDEX laps_pb; CREATE INDEX laps_pb ON laps(reference_eligible,lap_time_ms); ALTER TABLE laps DROP COLUMN timing_source; DROP TABLE recording_import_sessions; DROP TABLE recording_imports; ALTER TABLE sessions DROP COLUMN quality_policy_version; DELETE FROM schema_migrations WHERE version>=2; DELETE FROM app_metadata WHERE key='quality_policy_version'; UPDATE schema_migrations SET checksum='tampered' WHERE version=1; PRAGMA user_version=1;")
  legacy.close()

  await assert.rejects(TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.1.0' }), /migration checksum/)
  const preserved = new DatabaseSync(databasePath)
  assert.equal(Number(preserved.prepare('PRAGMA user_version').get().user_version), 1)
  assert.equal(Number(preserved.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name='recording_imports'").get().count), 0)
  assert.equal(preserved.prepare('PRAGMA table_info(sessions)').all().some((column) => column.name === 'quality_policy_version'), false)
  assert.equal(preserved.prepare('PRAGMA table_info(laps)').all().some((column) => column.name === 'timing_source'), false)
  assert.equal(Number(preserved.prepare('SELECT COUNT(*) AS count FROM laps').get().count), 1)
  preserved.close()
})

test('schema v2 migration labels old sessions v1 and new sessions with the current quality policy', async () => {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  let database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  await database.enqueueFinalized(event({ sessionId: 'legacy-session', lapId: 'legacy-lap', qualityPolicyVersion: 'lap-quality-v1' }))
  await database.close({ requireDurable: true })

  const legacy = new DatabaseSync(databasePath)
  legacy.exec("DROP INDEX laps_pb; CREATE INDEX laps_pb ON laps(reference_eligible,lap_time_ms); ALTER TABLE laps DROP COLUMN timing_source; ALTER TABLE sessions DROP COLUMN quality_policy_version; DELETE FROM schema_migrations WHERE version>=3; DELETE FROM app_metadata WHERE key='quality_policy_version'; PRAGMA user_version=2;")
  legacy.prepare("UPDATE app_metadata SET value='2' WHERE key='schema_version'").run()
  legacy.close()

  database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.1.0' })
  assert.equal(database.listSessions().find((session) => session.id === 'legacy-session').qualityPolicyVersion, 'lap-quality-v1')
  await database.enqueueFinalized(event({ sessionId: 'current-session', lapId: 'current-lap', startedAt: '2026-07-13T11:00:00.000Z' }))
  assert.equal(database.listSessions().find((session) => session.id === 'current-session').qualityPolicyVersion, QUALITY_POLICY_VERSION)
  await database.close({ requireDurable: true })
})

test('schema v3 migration preserves ambiguous durations only as legacy replay evidence', async () => {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  let database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  const written = await database.enqueueFinalized(event())
  await database.close({ requireDurable: true })

  const legacy = new DatabaseSync(databasePath)
  legacy.exec("DROP INDEX laps_pb; CREATE INDEX laps_pb ON laps(reference_eligible,lap_time_ms); ALTER TABLE laps DROP COLUMN timing_source; DELETE FROM schema_migrations WHERE version=4; PRAGMA user_version=3;")
  legacy.prepare("UPDATE app_metadata SET value='3' WHERE key='schema_version'").run()
  legacy.close()

  database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.1.0' })
  const migrated = database.getLap('session-1', 'lap-1')
  assert.equal(database.getHealth().schemaVersion, 4)
  assert.equal(migrated.payloadHash, written.payloadHash)
  assert.equal(migrated.samples.length, event().samples.length)
  assert.equal(migrated.lap.timingSource, 'legacy-unknown')
  assert.equal(migrated.lap.lapTimeMs, null)
  assert.equal(migrated.personalBest, null)
  assert.equal(migrated.trackModel, null)
  await database.close({ requireDurable: true })
})

test('a closed replay staging database imports atomically with durable provenance, payloads, PB, and restart', async () => {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  const stagingPath = await createStaging(root, [
    event({ source: 'recording-replay', lapId: 'lap-1', lapTimeMs: 91_000 }),
    event({ source: 'recording-replay', lapId: 'lap-2', lapTimeMs: 89_000 }),
  ])
  let database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  const imported = await database.importStaged(stagingPath, importMetadata())
  assert.deepEqual({ imported: imported.imported, duplicate: imported.duplicate, sessions: imported.sessions, laps: imported.laps, importedSessions: imported.importedSessions, importedLaps: imported.importedLaps }, { imported: true, duplicate: false, sessions: 1, laps: 2, importedSessions: 1, importedLaps: 2 })
  assert.deepEqual(imported.sessionIds, ['session-1'])
  assert.equal(Object.hasOwn(imported, 'path'), false)

  const [session] = database.listSessions()
  assert.equal(session.source, 'imported-recording')
  assert.equal(session.qualityPolicyVersion, QUALITY_POLICY_VERSION)
  assert.equal(session.endedAt, '2026-07-13T10:30:00.000Z')
  assert.equal(session.interruptionCount, 2)
  assert.deepEqual(session.importProvenance, {
    id: 'import-test-v1', recordingSha256: 'a'.repeat(64), recordingFormat: 'apex-lmu-raw-v1', processingVersion: 'apexrec-analysis-v1', importedAt: '2026-07-17T12:00:00.000Z', appVersion: '1.0.0', sessionCount: 1, lapCount: 2,
  })
  assert.equal(JSON.stringify(session).includes(stagingPath), false)
  assert.equal(database.getLap('session-1', 'lap-1').personalBest.lap.id, 'lap-2')
  await database.close({ requireDurable: true })

  database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  assert.equal(database.getLap('session-1', 'lap-1').samples.length, event().samples.length)
  assert.equal(database.listSessions()[0].qualityPolicyVersion, QUALITY_POLICY_VERSION)
  assert.deepEqual(database.findRecordingImport('A'.repeat(64), 'apexrec-analysis-v1'), {
    id: 'import-test-v1', recordingSha256: 'a'.repeat(64), recordingFormat: 'apex-lmu-raw-v1', processingVersion: 'apexrec-analysis-v1', importedAt: '2026-07-17T12:00:00.000Z', appVersion: '1.0.0', sessionCount: 1, lapCount: 2, sessionIds: ['session-1'],
  })
  await database.close()
})

test('import staging can defer per-lap track models while the atomic merge builds the durable model once', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root, [
    event({ source: 'recording-replay', lapId: 'lap-1', lapTimeMs: 91_000 }),
    event({ source: 'recording-replay', lapId: 'lap-2', lapTimeMs: 89_000 }),
  ], { deferPerLapTrackModels: true })
  const staging = new DatabaseSync(stagingPath)
  assert.equal(staging.prepare('SELECT COUNT(*) AS count FROM track_models').get().count, 0)
  assert.equal(staging.prepare('SELECT COUNT(*) AS count FROM track_model_sources').get().count, 0)
  staging.close()

  const database = await TelemetryDatabase.open({ userDataPath: root, databasePath: path.join(root, 'telemetry.sqlite3'), appVersion: '1.0.0' })
  await database.importStaged(stagingPath, importMetadata())
  const imported = database.getLap('session-1', 'lap-1')
  assert.equal(imported.personalBest.lap.id, 'lap-2')
  assert.equal(imported.trackModel.published, true)
  await database.close({ requireDurable: true })
})

test('an import normalizes processing time and chooses the same 12 equal-time track sources by lap ID', async () => {
  const root = await temporary()
  const recordedAt = '2026-07-13T10:00:00.000Z'
  const lapIds = Array.from({ length: 13 }, (_, index) => `equal-lap-${String(index).padStart(2, '0')}`)
  let processingTick = 0
  const stagingPath = await createStaging(root, [...lapIds].reverse().map((lapId, index) => event({
    source: 'recording-replay',
    lapId,
    lapNumber: index + 1,
    lapTimeMs: 90_000 + index,
    startedAt: recordedAt,
  })), {
    deferPerLapTrackModels: true,
    now: () => new Date(Date.UTC(2040, 0, 1, 0, 0, processingTick++)),
  })
  const staged = new DatabaseSync(stagingPath)
  assert.ok(new Set(staged.prepare('SELECT created_at AS createdAt FROM laps').all().map((row) => row.createdAt)).size > 1)
  staged.close()

  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  await database.importStaged(stagingPath, importMetadata())
  const importedCreatedAt = new Set(database.database.prepare('SELECT created_at AS createdAt FROM laps').all().map((row) => row.createdAt))
  const sourceIds = database.database.prepare('SELECT lap_id AS lapId FROM track_model_sources ORDER BY lap_id').all().map((row) => row.lapId)

  assert.deepEqual([...importedCreatedAt], [recordedAt])
  assert.deepEqual(sourceIds, [...lapIds].sort().slice(0, 12))
  assert.equal(database.getLap('session-1', lapIds[0]).trackModel.published, true)
  await database.close({ requireDurable: true })
})

test('import provenance orders preferred sessions newest-first with a deterministic ID tiebreak', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root, [
    event({ source: 'recording-replay', sessionId: 'aaa-older', lapId: 'older-lap', startedAt: '2026-07-13T10:00:00.000Z' }),
    event({ source: 'recording-replay', sessionId: 'zzz-newer', lapId: 'newer-z-lap', startedAt: '2026-07-13T11:00:00.000Z' }),
    event({ source: 'recording-replay', sessionId: 'bbb-newer', lapId: 'newer-b-lap', startedAt: '2026-07-13T11:00:00.000Z' }),
  ])
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  const imported = await database.importStaged(stagingPath, importMetadata())
  assert.deepEqual(imported.sessionIds, ['bbb-newer', 'zzz-newer', 'aaa-older'])
  assert.deepEqual(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1').sessionIds, imported.sessionIds)
  await database.close()
})

test('the same recording hash and processing version is an idempotent no-op', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root)
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  const first = await database.importStaged(stagingPath, importMetadata())
  const second = await database.importStaged('/not/a/real/staging-file.sqlite3', importMetadata({ id: 'different-id' }))
  assert.equal(first.imported, true)
  assert.deepEqual({ imported: second.imported, duplicate: second.duplicate, importedSessions: second.importedSessions, importedLaps: second.importedLaps }, { imported: false, duplicate: true, importedSessions: 0, importedLaps: 0 })
  assert.equal(database.listSessions().length, 1)
  await database.close()
})

test('a missing imported payload invalidates provenance and the same import repairs it', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root)
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  await database.importStaged(stagingPath, importMetadata())
  database.database.prepare("DELETE FROM lap_payloads WHERE lap_id='lap-1'").run()

  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)
  assert.equal(Object.hasOwn(database.listSessions()[0], 'importProvenance'), false)
  assert.equal(database.listSessions()[0].laps[0].samplesAvailable, false)
  const repaired = await database.importStaged(stagingPath, importMetadata())

  assert.equal(repaired.imported, true)
  assert.equal(repaired.duplicate, false)
  assert.equal(database.getLap('session-1', 'lap-1').samples.length, event().samples.length)
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1').lapCount, 1)
  await database.close({ requireDurable: true })
})

test('a corrupt imported payload is not a duplicate and the same import repairs its hash evidence', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root)
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  await database.importStaged(stagingPath, importMetadata())
  database.database.prepare("UPDATE lap_payloads SET compressed=x'00010203' WHERE lap_id='lap-1'").run()

  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)
  const repaired = await database.importStaged(stagingPath, importMetadata())

  assert.equal(repaired.imported, true)
  assert.equal(repaired.duplicate, false)
  assert.equal(database.getLap('session-1', 'lap-1').payloadHash, database.listSessions()[0].laps[0].payloadHash)
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1').lapCount, 1)
  await database.close({ requireDurable: true })
})

test('duplicate lookup rejects main metadata that no longer matches its canonical payload', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root)
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  await database.importStaged(stagingPath, importMetadata())

  database.database.prepare("UPDATE sessions SET source='live' WHERE id='session-1'").run()
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)
  database.database.prepare("UPDATE sessions SET source='imported-recording' WHERE id='session-1'").run()
  database.database.prepare("UPDATE laps SET coverage=0.5 WHERE id='lap-1'").run()
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)
  await assert.rejects(database.importStaged(stagingPath, importMetadata()), /lap ID already exists with different content/)

  assert.equal(database.listSessions()[0].laps[0].coverage, 0.5)
  await database.close({ requireDurable: true })
})

test('an older import reserves its whole batch while the hard count cap keeps one preferred PB', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root, [
    event({ source: 'recording-replay', sessionId: 'import-older', lapId: 'import-older-lap', lapTimeMs: 101_000, startedAt: '2026-07-13T08:00:00.000Z' }),
    event({ source: 'recording-replay', sessionId: 'import-newer', lapId: 'import-newer-lap', lapTimeMs: 100_000, startedAt: '2026-07-13T09:00:00.000Z' }),
  ])
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0', maxSessions: 3 })
  await database.enqueueFinalized(event({ sessionId: 'legacy-pb', lapId: 'legacy-pb-lap', lapTimeMs: 80_000, startedAt: '2026-07-13T12:00:00.000Z' }))
  await database.enqueueFinalized(event({ sessionId: 'recent-a', lapId: 'recent-a-lap', lapTimeMs: 95_000, startedAt: '2026-07-13T13:00:00.000Z' }))
  await database.enqueueFinalized(event({ sessionId: 'recent-b', lapId: 'recent-b-lap', lapTimeMs: 94_000, startedAt: '2026-07-13T14:00:00.000Z' }))
  assert.deepEqual(database.listSessions().map((session) => session.id), ['recent-b', 'recent-a', 'legacy-pb'])

  const imported = await database.importStaged(stagingPath, importMetadata())
  assert.deepEqual({ sessions: imported.sessions, laps: imported.laps, sessionIds: imported.sessionIds }, {
    sessions: 2, laps: 2, sessionIds: ['import-newer', 'import-older'],
  })
  // The protected import consumes two slots and the established PB receives
  // the final preferred slot. Both newer ordinary sessions are expendable;
  // the incoming older batch remains indivisible and the cap remains absolute.
  assert.deepEqual(database.listSessions().map((session) => session.id), ['legacy-pb', 'import-newer', 'import-older'])
  assert.equal(database.listSessions().length, 3)
  assert.equal(database.getLap('recent-a', 'recent-a-lap'), null)
  assert.equal(database.getLap('recent-b', 'recent-b-lap'), null)
  assert.deepEqual(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1').sessionIds, ['import-newer', 'import-older'])
  assert.equal(Number(database.database.prepare(`SELECT COUNT(*) AS count FROM sessions s
    LEFT JOIN recording_import_sessions ris ON ris.session_id=s.id
    WHERE s.source='imported-recording' AND ris.import_id IS NULL`).get().count), 0)

  const duplicate = await database.importStaged('/not/a/real/staging-file.sqlite3', importMetadata())
  assert.deepEqual({ imported: duplicate.imported, duplicate: duplicate.duplicate, sessions: duplicate.sessions, laps: duplicate.laps }, { imported: false, duplicate: true, sessions: 2, laps: 2 })
  await database.close()
})

test('the hard session cap applies across arbitrarily many PB identities', async () => {
  const root = await temporary()
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0', maxSessions: 3 })
  for (let index = 0; index < 7; index += 1) {
    await database.enqueueFinalized(event({
      sessionId: `identity-${index}`,
      lapId: `identity-${index}-lap`,
      carId: index + 1,
      carName: `Distinct Car ${index}`,
      startedAt: `2026-07-13T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
    }))
  }

  assert.deepEqual(database.listSessions().map((session) => session.id), ['identity-6', 'identity-5', 'identity-4'])
  assert.equal(Number(database.database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count), 3)
  await database.close()
})

test('equal-time PB and session ties have stable ID ordering and only one preferred PB session', async () => {
  const root = await temporary()
  const fixedNow = () => new Date('2026-07-18T12:00:00.000Z')
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0', maxSessions: 2, now: fixedNow })
  const tiedStart = '2026-07-13T10:00:00.000Z'
  await database.enqueueFinalized(event({ sessionId: 'zzz-pb-session', lapId: 'aaa-tied-lap', lapTimeMs: 90_000, startedAt: tiedStart }))
  await database.enqueueFinalized(event({ sessionId: 'mmm-ordinary-session', lapId: 'mmm-tied-lap', lapTimeMs: 90_000, startedAt: tiedStart }))
  await database.enqueueFinalized(event({ sessionId: 'aaa-ordinary-session', lapId: 'zzz-tied-lap', lapTimeMs: 90_000, startedAt: tiedStart }))

  assert.deepEqual(database.listSessions().map((session) => session.id), ['aaa-ordinary-session', 'zzz-pb-session'])
  assert.equal(database.getLap('zzz-pb-session', 'aaa-tied-lap').personalBest.lap.id, 'aaa-tied-lap')
  assert.equal(database.getLap('mmm-ordinary-session', 'mmm-tied-lap'), null)
  await database.close()
})

test('the hard byte cap evicts PB sessions when preferred history cannot fit', async () => {
  const root = await temporary()
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0', maxSessions: 10 })
  await database.enqueueFinalized(event({ sessionId: 'older-pb', lapId: 'older-pb-lap', carId: 1, carName: 'Older PB Car', startedAt: '2026-07-13T10:00:00.000Z' }))
  await database.enqueueFinalized(event({ sessionId: 'newer-pb', lapId: 'newer-pb-lap', carId: 2, carName: 'Newer PB Car', startedAt: '2026-07-13T11:00:00.000Z' }))
  const newerBytes = Number(database.database.prepare(`SELECT SUM(length(p.compressed)) AS bytes FROM lap_payloads p
    JOIN laps l ON l.id=p.lap_id WHERE l.session_id='newer-pb'`).get().bytes)

  database.maxBytes = newerBytes
  database.enforceRetention()

  assert.deepEqual(database.listSessions().map((session) => session.id), ['newer-pb'])
  assert.equal(database.getLap('older-pb', 'older-pb-lap'), null)
  assert.equal(Number(database.database.prepare('SELECT SUM(length(compressed)) AS bytes FROM lap_payloads').get().bytes), newerBytes)
  await database.close()
})

test('byte retention evicts eligible newer history instead of a protected older import', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root, [
    event({ source: 'recording-replay', sessionId: 'import-older', lapId: 'import-older-lap', lapTimeMs: 81_000, startedAt: '2026-07-13T08:00:00.000Z' }),
    event({ source: 'recording-replay', sessionId: 'import-newer', lapId: 'import-newer-lap', lapTimeMs: 80_000, startedAt: '2026-07-13T09:00:00.000Z' }),
  ])
  const staged = new DatabaseSync(stagingPath)
  const stagedBytes = Number(staged.prepare('SELECT SUM(length(compressed)) AS bytes FROM lap_payloads').get().bytes)
  staged.close()

  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0', maxSessions: 10 })
  await database.enqueueFinalized(event({ sessionId: 'live-a', lapId: 'live-a-lap', lapTimeMs: 95_000, startedAt: '2026-07-13T12:00:00.000Z' }))
  await database.enqueueFinalized(event({ sessionId: 'live-b', lapId: 'live-b-lap', lapTimeMs: 94_000, startedAt: '2026-07-13T13:00:00.000Z' }))
  database.maxBytes = stagedBytes

  const imported = await database.importStaged(stagingPath, importMetadata())
  assert.deepEqual({ sessions: imported.sessions, laps: imported.laps, sessionIds: imported.sessionIds }, {
    sessions: 2, laps: 2, sessionIds: ['import-newer', 'import-older'],
  })
  assert.deepEqual(database.listSessions().map((session) => session.id), ['import-newer', 'import-older'])
  assert.equal(Number(database.database.prepare('SELECT SUM(length(compressed)) AS bytes FROM lap_payloads').get().bytes), stagedBytes)
  assert.deepEqual(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1').sessionIds, ['import-newer', 'import-older'])
  await database.close()
})

test('an import larger than the session limit rejects atomically without orphan history or provenance', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root, [
    event({ source: 'recording-replay', sessionId: 'import-older', lapId: 'import-older-lap', startedAt: '2026-07-13T08:00:00.000Z' }),
    event({ source: 'recording-replay', sessionId: 'import-newer', lapId: 'import-newer-lap', startedAt: '2026-07-13T09:00:00.000Z' }),
  ])
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0', maxSessions: 1 })
  await database.enqueueFinalized(event({ sessionId: 'existing', lapId: 'existing-lap', startedAt: '2026-07-13T12:00:00.000Z' }))
  const before = database.listSessions()

  await assert.rejects(database.importStaged(stagingPath, importMetadata()), /2 sessions.*exceeds the local history limit of 1/)
  assert.deepEqual(database.listSessions(), before)
  assert.equal(Number(database.database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE source='imported-recording'").get().count), 0)
  assert.equal(Number(database.database.prepare('SELECT COUNT(*) AS count FROM recording_imports').get().count), 0)
  assert.equal(Number(database.database.prepare('SELECT COUNT(*) AS count FROM recording_import_sessions').get().count), 0)
  await database.close()
})

test('an import larger than the byte limit rejects atomically without orphan history or provenance', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root)
  const staged = new DatabaseSync(stagingPath)
  const stagedBytes = Number(staged.prepare('SELECT SUM(length(compressed)) AS bytes FROM lap_payloads').get().bytes)
  staged.close()
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0', maxBytes: stagedBytes - 1 })

  await assert.rejects(database.importStaged(stagingPath, importMetadata()), new RegExp(`${stagedBytes} payload bytes.*limit of ${stagedBytes - 1}`))
  assert.deepEqual(database.listSessions(), [])
  assert.equal(Number(database.database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE source='imported-recording'").get().count), 0)
  assert.equal(Number(database.database.prepare('SELECT COUNT(*) AS count FROM recording_imports').get().count), 0)
  assert.equal(Number(database.database.prepare('SELECT COUNT(*) AS count FROM recording_import_sessions').get().count), 0)
  await database.close()
})

test('later retention invalidates incomplete provenance and a too-large reimport rolls back', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root, [
    event({ source: 'recording-replay', sessionId: 'older', lapId: 'older-lap', lapTimeMs: 91_000, startedAt: '2026-07-13T10:00:00.000Z' }),
    event({ source: 'recording-replay', sessionId: 'newer', lapId: 'newer-lap', lapTimeMs: 89_000, startedAt: '2026-07-13T11:00:00.000Z' }),
  ])
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0', maxSessions: 10 })
  const first = await database.importStaged(stagingPath, importMetadata())
  assert.deepEqual({ sessions: first.sessions, laps: first.laps, sessionIds: first.sessionIds }, { sessions: 2, laps: 2, sessionIds: ['newer', 'older'] })
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1').sessionCount, 2)

  database.maxSessions = 1
  database.enforceRetention()
  assert.deepEqual(database.listSessions().map((session) => session.id), ['newer'])
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)
  assert.equal(Number(database.database.prepare('SELECT COUNT(*) AS count FROM recording_imports').get().count), 0)
  assert.equal(Object.hasOwn(database.listSessions()[0], 'importProvenance'), false)

  await assert.rejects(database.importStaged(stagingPath, importMetadata()), /2 sessions.*exceeds the local history limit of 1/)
  assert.deepEqual(database.listSessions().map((session) => session.id), ['newer'])
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)

  database.maxSessions = 2
  const restored = await database.importStaged(stagingPath, importMetadata())
  assert.deepEqual({ imported: restored.imported, duplicate: restored.duplicate, sessions: restored.sessions, laps: restored.laps, sessionIds: restored.sessionIds }, {
    imported: true, duplicate: false, sessions: 2, laps: 2, sessionIds: ['newer', 'older'],
  })
  const complete = database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1')
  assert.deepEqual({ sessionCount: complete.sessionCount, lapCount: complete.lapCount, sessionIds: complete.sessionIds }, { sessionCount: 2, lapCount: 2, sessionIds: ['newer', 'older'] })
  const duplicate = await database.importStaged('/not/a/real/staging-file.sqlite3', importMetadata())
  assert.deepEqual({ imported: duplicate.imported, duplicate: duplicate.duplicate, sessions: duplicate.sessions, laps: duplicate.laps }, { imported: false, duplicate: true, sessions: 2, laps: 2 })
  await database.close()
})

test('a durable session rejects laps produced by a different quality policy version', async () => {
  const root = await temporary()
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  await database.enqueueFinalized(event({ qualityPolicyVersion: 'lap-quality-v1' }))
  await assert.rejects(database.enqueueFinalized(event({ lapId: 'lap-2', qualityPolicyVersion: 'lap-quality-v2' })), /cannot mix lap quality policy versions/)
  assert.equal(database.listSessions()[0].laps.length, 1)
  assert.equal(database.listSessions()[0].qualityPolicyVersion, 'lap-quality-v1')
  await database.close()
})

test('a conflicting session ID rolls back the entire staged import', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root, [event({ source: 'recording-replay', sessionId: 'collision', lapId: 'imported-lap' })])
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  await database.enqueueFinalized(event({ source: 'live', sessionId: 'collision', lapId: 'live-lap' }))
  const before = database.listSessions()
  await assert.rejects(database.importStaged(stagingPath, importMetadata()), /session ID already exists with different content/)
  assert.deepEqual(database.listSessions(), before)
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)
  assert.equal(database.getLap('collision', 'imported-lap'), null)
  await database.close()
})

test('a conflicting lap ID rolls back the entire staged import', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root, [event({ source: 'recording-replay', sessionId: 'import-session', lapId: 'shared-lap' })])
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  await database.enqueueFinalized(event({ source: 'live', sessionId: 'live-session', lapId: 'shared-lap' }))
  const before = database.listSessions()
  await assert.rejects(database.importStaged(stagingPath, importMetadata()), /lap ID already exists with different content/)
  assert.deepEqual(database.listSessions(), before)
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)
  assert.equal(database.getLap('import-session', 'shared-lap'), null)
  await database.close()
})

test('a corrupt staged payload rolls back without touching the main database', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root)
  const staging = new DatabaseSync(stagingPath)
  staging.prepare("UPDATE lap_payloads SET compressed=x'00010203' WHERE lap_id='lap-1'").run()
  staging.close()
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  await database.enqueueFinalized(event({ sessionId: 'existing-session', lapId: 'existing-lap' }))
  const before = database.listSessions()
  await assert.rejects(database.importStaged(stagingPath, importMetadata()), /payload|inflate|invalid distance/i)
  assert.deepEqual(database.listSessions(), before)
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)
  await database.close()
})

test('a modified staged schema rolls back without touching the main database', async () => {
  const root = await temporary()
  const stagingPath = await createStaging(root)
  const staging = new DatabaseSync(stagingPath)
  staging.exec('ALTER TABLE sessions ADD COLUMN unexpected TEXT;')
  staging.close()
  const database = await TelemetryDatabase.open({ userDataPath: root, appVersion: '1.0.0' })
  await database.enqueueFinalized(event({ sessionId: 'existing-session', lapId: 'existing-lap' }))
  const before = database.listSessions()
  await assert.rejects(database.importStaged(stagingPath, importMetadata()), /schema differs/)
  assert.deepEqual(database.listSessions(), before)
  assert.equal(database.findRecordingImport('a'.repeat(64), 'apexrec-analysis-v1'), null)
  await database.close()
})

test('session finalization is ordered after lap writes and updates durable end state', async () => {
  const root = await temporary()
  const databasePath = path.join(root, 'telemetry.sqlite3')
  let database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  const lapWrite = database.enqueueFinalized(event())
  const sessionWrite = database.enqueueSessionFinalized({ id: 'session-1', source: 'live', endedAt: '2026-07-13T10:45:00.000Z', interruptionCount: 3 })
  assert.equal((await lapWrite).written, true)
  assert.equal((await sessionWrite).written, true)
  await database.close({ requireDurable: true })

  database = await TelemetryDatabase.open({ userDataPath: root, databasePath, appVersion: '1.0.0' })
  const [session] = database.listSessions()
  assert.equal(session.endedAt, '2026-07-13T10:45:00.000Z')
  assert.equal(session.interruptionCount, 3)
  await database.close()
})
