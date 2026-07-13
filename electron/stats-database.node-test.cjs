const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')
const { StatsDatabase, vehicleKey } = require('./stats-database.cjs')

async function directory(t) { const value = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-stats-')); t.after(() => fs.rm(value, { recursive: true, force: true })); return value }
function ids() { let value = 0; return () => `00000000-0000-4000-8000-${String(++value).padStart(12, '0')}` }
function frame(sequence, elapsedSeconds, speedKph = 100, patch = {}) {
  return { protocolVersion: 1, source: 'lmu-shared-memory', runId: 'live-run-1', type: 'telemetry', capturedAt: new Date(1_700_000_000_000 + elapsedSeconds * 1000).toISOString(), sequence, gameVersion: 130, playerTelemetryAvailable: true, session: { elapsedSeconds, track: 'Test Circuit' }, player: { controlOwner: 'local-player', speedKph, name: 'Lexus Custom Team 2025 #397', class: 'GT3' }, opponents: [], ...patch }
}

test('integrates 100 km/h for 36 game seconds to exactly 1 km across durable chunks', async (t) => {
  const service = await StatsDatabase.open({ userDataPath: await directory(t), appVersion: '0.1.14', makeId: ids() })
  for (let index = 0; index <= 1800; index += 1) service.ingest(frame(index + 1, index * 0.02))
  service.flush()
  const stats = service.getStats()
  assert.equal(stats.totalDistanceMm, 1_000_000)
  assert.equal(stats.vehicles[0].distanceMm, 1_000_000)
  assert.equal(stats.vehicles[0].sessions, 1)
  assert.match(stats.trackedSince, /^\d{4}-/)
  service.close()
})

test('excludes replay, self-test, AI, remote, unknown control, missing telemetry, pauses and implausible gaps', async (t) => {
  const service = await StatsDatabase.open({ userDataPath: await directory(t), appVersion: '0.1.14', makeId: ids() })
  const excluded = [
    frame(1, 0, 100, { source: 'recording-replay' }), frame(2, 0.02, 100, { source: 'self-test' }),
    frame(3, 0.04, 100, { player: { ...frame(0, 0).player, controlOwner: 'ai' } }), frame(4, 0.06, 100, { player: { ...frame(0, 0).player, controlOwner: 'remote' } }),
    frame(5, 0.08, 100, { player: { ...frame(0, 0).player, controlOwner: 'unknown' } }), frame(6, 0.1, 100, { playerTelemetryAvailable: false }),
  ]
  for (const value of excluded) assert.equal(service.ingest(value).accepted, false)
  service.ingest(frame(10, 1)); assert.equal(service.ingest(frame(11, 1)).accepted, false)
  service.ingest(frame(12, 2)); assert.equal(service.ingest(frame(13, 3)).accepted, false)
  assert.equal(service.getStats().totalDistanceMm, 0)
  service.close()
})

test('counts reverse driving because LMU speed is a physical magnitude', async (t) => {
  const service = await StatsDatabase.open({ userDataPath: await directory(t), appVersion: '0.1.14', makeId: ids() })
  const reversePlayer = { ...frame(0, 0).player, gear: -1 }
  service.ingest(frame(1, 0, 100, { player: reversePlayer }))
  assert.equal(service.ingest(frame(2, 0.02, 100, { player: reversePlayer })).accepted, true)
  service.flush()
  assert.equal(service.getStats().totalDistanceMm, 556)
  service.close()
})

test('car, source, track, sequence, and session-time boundaries never bridge samples', async (t) => {
  const service = await StatsDatabase.open({ userDataPath: await directory(t), appVersion: '0.1.14', makeId: ids() })
  service.ingest(frame(1, 1)); assert.equal(service.ingest(frame(2, 1.02)).accepted, true)
  assert.equal(service.ingest(frame(4, 1.04)).accepted, false)
  assert.equal(service.ingest(frame(5, 1.06, 100, { runId: 'new-run' })).accepted, false)
  assert.equal(service.ingest(frame(6, 1.08, 100, { session: { elapsedSeconds: 1.08, track: 'Other' } })).accepted, false)
  assert.equal(service.ingest(frame(7, 0.1)).accepted, false)
  service.flush()
  assert.equal(service.getStats().totalDistanceMm, 556)
  service.close()
})

test('track and control boundaries create distinct local sessions without leaking rounding carry', async (t) => {
  const service = await StatsDatabase.open({ userDataPath: await directory(t), appVersion: '0.1.14', makeId: ids() })
  service.ingest(frame(1, 0))
  service.ingest(frame(2, 0.02))
  service.ingest(frame(3, 0.04, 100, { session: { elapsedSeconds: 0.04, track: 'Other Circuit' } }))
  service.ingest(frame(4, 0.06, 100, { session: { elapsedSeconds: 0.06, track: 'Other Circuit' } }))
  service.ingest(frame(5, 0.08, 100, { session: { elapsedSeconds: 0.08, track: 'Other Circuit' }, player: { ...frame(0, 0).player, controlOwner: 'ai' } }))
  service.ingest(frame(6, 0.1, 100, { session: { elapsedSeconds: 0.1, track: 'Other Circuit' } }))
  service.ingest(frame(7, 0.12, 100, { session: { elapsedSeconds: 0.12, track: 'Other Circuit' } }))
  service.flush()
  assert.equal(service.getStats().totalDistanceMm, 1_668)
  assert.equal(service.getStats().vehicles[0].sessions, 3)
  assert.equal(service.database.prepare('SELECT COUNT(*) AS count FROM drive_runs').get().count, 3)
  service.close()
})

test('retrying already committed sequence ranges is idempotent for totals and session count', async (t) => {
  const service = await StatsDatabase.open({ userDataPath: await directory(t), appVersion: '0.1.14', makeId: ids() })
  for (let index = 0; index <= 13; index += 1) service.ingest(frame(index + 1, index * 0.02))
  service.flush()
  const before = service.getStats()
  const chunksBefore = service.database.prepare('SELECT COUNT(*) AS count FROM distance_chunks').get().count
  for (let index = 0; index <= 13; index += 1) service.ingest(frame(index + 1, index * 0.02))
  service.flush()
  assert.equal(service.getStats().totalDistanceMm, before.totalDistanceMm)
  assert.equal(service.getStats().vehicles[0].sessions, 1)
  assert.equal(service.database.prepare('SELECT COUNT(*) AS count FROM distance_chunks').get().count, chunksBefore)
  assert.equal(service.database.prepare('SELECT COUNT(*) AS count FROM drive_runs').get().count, 1)
  service.close()
})

test('committed totals survive restart and manual backup has a verifiable hash', async (t) => {
  const root = await directory(t)
  let service = await StatsDatabase.open({ userDataPath: root, appVersion: '0.1.14', makeId: ids() })
  service.ingest(frame(1, 0)); service.ingest(frame(2, 0.02)); service.close()
  service = await StatsDatabase.open({ userDataPath: root, appVersion: '0.1.14', makeId: ids() })
  assert.equal(service.getStats().totalDistanceMm, 556)
  const backup = await service.createBackup()
  const file = path.join(root, 'data', 'backups', backup.file)
  assert.equal(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'), backup.sha256)
  const second = await service.createBackup()
  assert.notEqual(second.file, backup.file)
  if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
  service.close()
})

test('clean close flushes all intervals while a forced crash loses less than the 250 ms RPO', async (t) => {
  const root = await directory(t)
  let service = await StatsDatabase.open({ userDataPath: root, appVersion: '0.1.14', makeId: ids() })
  service.ingest(frame(1, 0)); service.ingest(frame(2, 0.02)); service.close()
  service = await StatsDatabase.open({ userDataPath: root, appVersion: '0.1.14', makeId: ids() })
  assert.equal(service.getStats().totalDistanceMm, 556)
  service.close()

  const crashRoot = await directory(t)
  service = await StatsDatabase.open({ userDataPath: crashRoot, appVersion: '0.1.14', makeId: ids() })
  for (let index = 0; index <= 17; index += 1) service.ingest(frame(index + 1, index * 0.02))
  const completeDistanceMm = Math.round((100 / 3.6) * 0.34 * 1000)
  service.database.close()
  service.closed = true
  service = await StatsDatabase.open({ userDataPath: crashRoot, appVersion: '0.1.14', makeId: ids() })
  const committed = service.getStats().totalDistanceMm
  assert.equal(committed, 6_667)
  assert.equal(service.database.prepare('SELECT COUNT(*) AS count FROM distance_accumulators').get().count, 0)
  assert.equal(service.database.prepare('SELECT COUNT(*) AS count FROM distance_chunks').get().count, 1)
  assert.ok(completeDistanceMm - committed > 0)
  assert.ok(completeDistanceMm - committed < Math.ceil((100 / 3.6) * 0.25 * 1000))
  service.close()
})

test('future and corrupt databases are preserved and never replaced', async (t) => {
  const futureRoot = await directory(t)
  const futurePath = path.join(futureRoot, 'future.sqlite3')
  const raw = new DatabaseSync(futurePath); raw.exec('PRAGMA user_version=99'); raw.close()
  const futureBytes = await fs.readFile(futurePath)
  const future = await StatsDatabase.open({ userDataPath: futureRoot, databasePath: futurePath, appVersion: '0.1.14', makeId: ids() })
  assert.equal(future.getHealth().status, 'future-schema')
  assert.equal(future.ingest(frame(1, 0)).reason, 'future-schema')
  future.close()
  assert.deepEqual(await fs.readFile(futurePath), futureBytes)
  const corruptRoot = await directory(t)
  const corruptPath = path.join(corruptRoot, 'corrupt.sqlite3')
  const bytes = Buffer.from('not a sqlite database')
  await fs.writeFile(corruptPath, bytes)
  await assert.rejects(() => StatsDatabase.open({ userDataPath: corruptRoot, databasePath: corruptPath, appVersion: '0.1.14' }), /preserved/)
  assert.deepEqual(await fs.readFile(corruptPath), bytes)
})

test('existing schema-zero files receive a checksum backup before migration and ledger rows are immutable', async (t) => {
  const root = await directory(t)
  const file = path.join(root, 'data', 'apex.sqlite3')
  await fs.mkdir(path.dirname(file), { recursive: true })
  const raw = new DatabaseSync(file); raw.exec('CREATE TABLE legacy(value TEXT); INSERT INTO legacy VALUES (\'preserve\')'); raw.close()
  const service = await StatsDatabase.open({ userDataPath: root, appVersion: '0.1.14', makeId: ids(), now: () => new Date('2026-07-12T20:00:00Z') })
  assert.equal(service.getHealth().lastBackup.sourceSchema, 0)
  const manifestPath = path.join(root, 'data', 'backups', `${service.getHealth().lastBackup.file}.json`)
  assert.equal(JSON.parse(await fs.readFile(manifestPath, 'utf8')).sha256, service.getHealth().lastBackup.sha256)
  service.ingest(frame(1, 0)); service.ingest(frame(2, 0.02)); service.flush()
  assert.throws(() => service.database.exec('DELETE FROM distance_chunks'), /immutable/)
  service.close()
})

test('durable accumulator history can only grow and can only be deleted by an equal sealed chunk', async (t) => {
  const service = await StatsDatabase.open({ userDataPath: await directory(t), appVersion: '0.1.14', makeId: ids() })
  for (let index = 0; index <= 12; index += 1) service.ingest(frame(index + 1, index * 0.02))
  assert.equal(service.database.prepare('SELECT COUNT(*) AS count FROM distance_accumulators').get().count, 1)
  assert.throws(() => service.database.exec('UPDATE distance_accumulators SET distance_mm=0'), /cannot move backwards/)
  assert.throws(() => service.database.exec('DELETE FROM distance_accumulators'), /must be sealed/)
  service.close()
})

test('seals 250 ms checkpoints into one compact immutable chunk after 60 seconds', async (t) => {
  const service = await StatsDatabase.open({ userDataPath: await directory(t), appVersion: '0.1.14', makeId: ids() })
  for (let index = 0; index <= 3000; index += 1) service.ingest(frame(index + 1, index * 0.02))
  assert.equal(service.getStats().totalDistanceMm, 1_666_667)
  assert.equal(service.database.prepare('SELECT COUNT(*) AS count FROM distance_chunks').get().count, 1)
  assert.equal(service.database.prepare('SELECT COUNT(*) AS count FROM distance_accumulators').get().count, 0)
  service.close()
})

test('failed migration rolls back and leaves the original plus a verified pre-migration backup', async (t) => {
  const root = await directory(t)
  const file = path.join(root, 'data', 'apex.sqlite3')
  await fs.mkdir(path.dirname(file), { recursive: true })
  const raw = new DatabaseSync(file)
  raw.exec("CREATE TABLE vehicle_models(original_value TEXT); INSERT INTO vehicle_models VALUES ('preserve')")
  raw.close()
  await assert.rejects(() => StatsDatabase.open({ userDataPath: root, appVersion: '0.1.14', makeId: ids(), now: () => new Date('2026-07-12T20:00:00Z') }), /migration rolled back/)
  const preserved = new DatabaseSync(file)
  assert.equal(preserved.prepare('SELECT original_value FROM vehicle_models').get().original_value, 'preserve')
  assert.equal(preserved.prepare('PRAGMA user_version').get().user_version, 0)
  preserved.close()
  const names = await fs.readdir(path.join(root, 'data', 'backups'))
  const backupName = names.find((name) => name.endsWith('.sqlite3'))
  assert.ok(backupName)
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'data', 'backups', `${backupName}.json`), 'utf8'))
  assert.equal(manifest.sha256, crypto.createHash('sha256').update(await fs.readFile(path.join(root, 'data', 'backups', backupName))).digest('hex'))
})

test('a storage failure fails closed, stops repeated ingestion, and blocks updater-grade close', async (t) => {
  const service = await StatsDatabase.open({ userDataPath: await directory(t), appVersion: '0.1.14', makeId: ids() })
  service.database.exec("CREATE TRIGGER force_checkpoint_failure BEFORE INSERT ON distance_accumulators BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END")
  service.ingest(frame(1, 0))
  for (let index = 1; index < 12; index += 1) service.ingest(frame(index + 1, index * 0.02))
  assert.throws(() => service.ingest(frame(13, 0.24)), /simulated disk failure/)
  assert.equal(service.getHealth().status, 'error')
  assert.equal(service.getStats().status, 'error')
  assert.equal(service.ingest(frame(14, 0.26)).reason, 'storage-fault')
  assert.throws(() => service.close({ requireDurable: true }), /unresolved storage fault/)
  service.close()
})

test('tampered migration metadata is refused instead of silently accepted', async (t) => {
  const root = await directory(t)
  let service = await StatsDatabase.open({ userDataPath: root, appVersion: '0.1.14', makeId: ids() })
  service.close()
  const raw = new DatabaseSync(path.join(root, 'data', 'apex.sqlite3'))
  raw.prepare('UPDATE schema_migrations SET checksum=? WHERE version=1').run('tampered')
  raw.close()
  await assert.rejects(() => StatsDatabase.open({ userDataPath: root, appVersion: '0.1.14', makeId: ids() }), /checksum does not match/)
})

test('vehicle identity groups normalized class and raw LMU name rather than participant slot', () => {
  assert.equal(vehicleKey('  Lexus   RC F  ', 'GT3'), vehicleKey('Lexus RC F', 'gt3'))
  assert.notEqual(vehicleKey('Lexus RC F', 'GT3'), vehicleKey('Lexus RC F Evo', 'GT3'))
})
