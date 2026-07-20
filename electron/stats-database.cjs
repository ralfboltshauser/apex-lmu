const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { DatabaseSync, backup } = require('node:sqlite')
const { catalogVersion, resolveVehicleModel } = require('./vehicle-catalog.cjs')

const schemaVersion = 1
const algorithmVersion = 'distance-trapezoid-game-time-v1'
const sealAcceptedIntervals = 3000
const migration1 = `
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, app_version TEXT NOT NULL, applied_at TEXT NOT NULL);
CREATE TABLE app_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE vehicle_models(id TEXT PRIMARY KEY, source_key TEXT NOT NULL UNIQUE, raw_name TEXT NOT NULL, raw_class TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
CREATE TABLE drive_runs(id TEXT PRIMARY KEY, source_run_id TEXT NOT NULL, session_key TEXT NOT NULL, game_version INTEGER NOT NULL, track TEXT NOT NULL, vehicle_id TEXT NOT NULL REFERENCES vehicle_models(id), started_at TEXT NOT NULL, ended_at TEXT, accepted_intervals INTEGER NOT NULL DEFAULT 0, rejected_intervals INTEGER NOT NULL DEFAULT 0, last_sequence INTEGER NOT NULL DEFAULT 0, rounding_carry_mm REAL NOT NULL DEFAULT 0, UNIQUE(source_run_id, session_key, vehicle_id));
CREATE TABLE distance_accumulators(drive_run_id TEXT PRIMARY KEY REFERENCES drive_runs(id), vehicle_id TEXT NOT NULL REFERENCES vehicle_models(id), source_run_id TEXT NOT NULL, sequence_start INTEGER NOT NULL, sequence_end INTEGER NOT NULL CHECK(sequence_end > sequence_start), distance_mm INTEGER NOT NULL CHECK(distance_mm >= 0), accepted_intervals INTEGER NOT NULL CHECK(accepted_intervals > 0), rejected_intervals INTEGER NOT NULL CHECK(rejected_intervals >= 0), algorithm_version TEXT NOT NULL, checkpointed_at TEXT NOT NULL);
CREATE TABLE distance_chunks(id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicle_models(id), drive_run_id TEXT NOT NULL REFERENCES drive_runs(id), source_run_id TEXT NOT NULL, sequence_start INTEGER NOT NULL, sequence_end INTEGER NOT NULL CHECK(sequence_end > sequence_start), distance_mm INTEGER NOT NULL CHECK(distance_mm >= 0), accepted_intervals INTEGER NOT NULL CHECK(accepted_intervals > 0), rejected_intervals INTEGER NOT NULL CHECK(rejected_intervals >= 0), algorithm_version TEXT NOT NULL, committed_at TEXT NOT NULL, UNIQUE(source_run_id, sequence_start, sequence_end));
CREATE TABLE distance_corrections(id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicle_models(id), distance_mm INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE vehicle_aliases(source_vehicle_id TEXT NOT NULL REFERENCES vehicle_models(id), target_vehicle_id TEXT NOT NULL REFERENCES vehicle_models(id), reason TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(source_vehicle_id, target_vehicle_id));
CREATE TRIGGER distance_accumulators_monotonic BEFORE UPDATE ON distance_accumulators WHEN NEW.drive_run_id<>OLD.drive_run_id OR NEW.vehicle_id<>OLD.vehicle_id OR NEW.source_run_id<>OLD.source_run_id OR NEW.sequence_start<>OLD.sequence_start OR NEW.sequence_end<OLD.sequence_end OR NEW.distance_mm<OLD.distance_mm OR NEW.accepted_intervals<OLD.accepted_intervals OR NEW.rejected_intervals<OLD.rejected_intervals OR NEW.algorithm_version<>OLD.algorithm_version BEGIN SELECT RAISE(ABORT, 'distance accumulator history cannot move backwards'); END;
CREATE TRIGGER distance_accumulators_sealed_delete BEFORE DELETE ON distance_accumulators WHEN NOT EXISTS (SELECT 1 FROM distance_chunks c WHERE c.drive_run_id=OLD.drive_run_id AND c.sequence_start=OLD.sequence_start AND c.sequence_end=OLD.sequence_end AND c.distance_mm=OLD.distance_mm AND c.accepted_intervals=OLD.accepted_intervals AND c.rejected_intervals=OLD.rejected_intervals AND c.algorithm_version=OLD.algorithm_version) BEGIN SELECT RAISE(ABORT, 'distance accumulator must be sealed before deletion'); END;
CREATE TRIGGER distance_chunks_no_update BEFORE UPDATE ON distance_chunks BEGIN SELECT RAISE(ABORT, 'distance chunks are immutable'); END;
CREATE TRIGGER distance_chunks_no_delete BEFORE DELETE ON distance_chunks BEGIN SELECT RAISE(ABORT, 'distance chunks are immutable'); END;
CREATE TRIGGER distance_corrections_no_update BEFORE UPDATE ON distance_corrections BEGIN SELECT RAISE(ABORT, 'distance corrections are immutable'); END;
CREATE TRIGGER distance_corrections_no_delete BEFORE DELETE ON distance_corrections BEGIN SELECT RAISE(ABORT, 'distance corrections are immutable'); END;
CREATE INDEX distance_chunks_vehicle ON distance_chunks(vehicle_id);
CREATE INDEX drive_runs_vehicle ON drive_runs(vehicle_id);
`

function strictVersion(value) { return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) }
function nowIso(now) { return now().toISOString() }
function normalize(value) { return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ') }
function vehicleKey(name, vehicleClass) { return `identity-v1|${normalize(vehicleClass)}|${normalize(name)}` }
function stableId(prefix, value) { return `${prefix}-${crypto.createHash('sha256').update(value).digest('hex').slice(0, 24)}` }
function finite(value) { return typeof value === 'number' && Number.isFinite(value) }
function migrationChecksum() { return crypto.createHash('sha256').update(migration1).digest('hex') }
async function privateMode(target) { try { await fs.chmod(target, 0o600) } catch (error) { if (process.platform !== 'win32') throw error } }

class StatsDatabase {
  static async open({ userDataPath, appVersion, logger = null, now = () => new Date(), makeId = crypto.randomUUID, databasePath = null }) {
    if (!path.isAbsolute(userDataPath) || !strictVersion(appVersion)) throw new Error('Stats database requires an absolute user-data path and strict app version')
    const filePath = databasePath || path.join(userDataPath, 'data', 'apex.sqlite3')
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    const existed = fsSync.existsSync(filePath)
    let database
    try { database = new DatabaseSync(filePath) } catch (error) { throw new Error(`Open lifetime database without replacing it: ${error.message}`) }
    const service = new StatsDatabase({ database, filePath, userDataPath, appVersion, logger, now, makeId })
    try { await service.initialize(existed); if (!service.futureSchema) await privateMode(filePath) } catch (error) { try { database.close() } catch {}; throw new Error(`Lifetime database unavailable; original file was preserved: ${error.message}`) }
    return service
  }

  constructor({ database, filePath, userDataPath, appVersion, logger, now, makeId }) {
    this.database = database; this.filePath = filePath; this.userDataPath = userDataPath; this.appVersion = appVersion; this.logger = logger; this.now = now; this.makeId = makeId
    this.writable = false; this.closed = false; this.previous = null; this.chunk = null; this.currentRun = null; this.rejectedSinceChunk = 0; this.roundingCarryMm = 0; this.lastBackup = null; this.fault = null
  }

  async initialize(existed) {
    this.database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
    if (existed) {
      const integrity = this.database.prepare('PRAGMA integrity_check').all()
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('Lifetime database integrity check failed; original file was preserved')
    }
    const current = Number(this.database.prepare('PRAGMA user_version').get().user_version)
    if (current > schemaVersion) { this.writable = false; this.futureSchema = current; return }
    this.database.exec('PRAGMA synchronous=FULL;')
    if (current < schemaVersion) {
      if (existed) await this.createMigrationBackup(current, schemaVersion)
      const checksum = migrationChecksum()
      this.database.exec('BEGIN IMMEDIATE')
      try {
        if (current === 0) this.database.exec(migration1)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(1, 'initial-lifetime-ledger', checksum, this.appVersion, nowIso(this.now))
        this.database.exec(`PRAGMA user_version=${schemaVersion}`)
        this.database.exec('COMMIT')
      } catch (error) { try { this.database.exec('ROLLBACK') } catch {}; throw new Error(`Lifetime database migration rolled back: ${error.message}`) }
    }
    this.ensureMetadata()
    const migration = this.database.prepare('SELECT checksum FROM schema_migrations WHERE version=?').get(schemaVersion)
    if (!migration || migration.checksum !== migrationChecksum()) throw new Error('Lifetime database migration checksum does not match this build')
    const check = this.database.prepare('PRAGMA quick_check').get().quick_check
    if (check !== 'ok') throw new Error('Lifetime database post-migration check failed; original and backup were preserved')
    this.database.exec('PRAGMA journal_mode=WAL;')
    this.sealRecoveredAccumulators()
    this.writable = true
  }

  ensureMetadata() {
    const insert = this.database.prepare('INSERT OR IGNORE INTO app_metadata(key,value) VALUES(?,?)')
    insert.run('installation_uuid', this.makeId()); insert.run('tracked_since', nowIso(this.now)); insert.run('algorithm_version', algorithmVersion); insert.run('schema_version', String(schemaVersion))
  }

  async createMigrationBackup(fromVersion, toVersion) {
    const directory = path.join(path.dirname(this.filePath), 'backups')
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    const stamp = nowIso(this.now).replace(/[:.]/g, '-')
    const suffix = stableId('backup', `${stamp}|${this.makeId()}`).slice(-8)
    const destination = path.join(directory, `apex-schema-${fromVersion}-to-${toVersion}-${stamp}-${suffix}.sqlite3`)
    await backup(this.database, destination)
    await privateMode(destination)
    const hash = crypto.createHash('sha256').update(await fs.readFile(destination)).digest('hex')
    const manifest = { schemaVersion: 1, sourceSchema: fromVersion, targetSchema: toVersion, appVersion: this.appVersion, createdAt: nowIso(this.now), file: path.basename(destination), bytes: (await fs.stat(destination)).size, sha256: hash }
    await fs.writeFile(`${destination}.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    this.lastBackup = manifest
  }

  ingest(message) {
    if (!this.writable || this.closed) return { accepted: false, reason: this.futureSchema ? 'future-schema' : this.fault ? 'storage-fault' : 'unavailable' }
    if (!message || message.type !== 'telemetry' || message.source !== 'lmu-shared-memory' || message.playerTelemetryAvailable === false || message.player?.controlOwner !== 'local-player') return this.boundary('ineligible-source-or-control', null, true)
    const sample = { runId: message.runId, sequence: message.sequence, elapsed: message.session?.elapsedSeconds, speed: message.player?.speedKph, track: message.session?.track, gameVersion: message.gameVersion ?? 0, carName: message.player?.name, carClass: message.player?.class, capturedAt: message.capturedAt }
    if (typeof sample.runId !== 'string' || !sample.runId || !Number.isSafeInteger(sample.sequence) || !finite(sample.elapsed) || !finite(sample.speed) || sample.speed < 0 || sample.speed > 600 || !sample.track || !sample.carName || !sample.carClass) return this.boundary('invalid-sample', null, true)
    sample.vehicleKey = vehicleKey(sample.carName, sample.carClass)
    if (!this.previous) { this.previous = sample; return { accepted: false, reason: 'baseline' } }
    const previous = this.previous
    this.previous = sample
    if (sample.runId !== previous.runId || sample.vehicleKey !== previous.vehicleKey || sample.track !== previous.track) return this.boundary('identity-boundary', sample, true)
    if (sample.sequence !== previous.sequence + 1) return this.boundary('sequence-boundary', sample)
    const delta = sample.elapsed - previous.elapsed
    if (!finite(delta) || delta <= 0) { this.rejectedSinceChunk += 1; return this.boundary('session-time-reset', sample, true) }
    if (delta > 0.25) { this.rejectedSinceChunk += 1; return { accepted: false, reason: 'time-gap' } }
    const distanceM = ((previous.speed + sample.speed) / 2 / 3.6) * delta
    if (!finite(distanceM) || distanceM < 0 || distanceM > 50) { this.rejectedSinceChunk += 1; return { accepted: false, reason: 'implausible-distance' } }
    this.ensureRun(sample, previous)
    if (!this.chunk) this.chunk = { sequenceStart: previous.sequence, sequenceEnd: sample.sequence, distanceM: 0, accepted: 0, elapsed: 0 }
    this.chunk.sequenceEnd = sample.sequence; this.chunk.distanceM += distanceM; this.chunk.accepted += 1; this.chunk.elapsed += delta
    if (this.chunk.elapsed >= 0.25 || this.chunk.accepted >= 12) this.checkpoint()
    return { accepted: true, distanceM }
  }

  boundary(reason, next = null, endRun = false) {
    this.flush()
    this.previous = next
    if (endRun) {
      this.currentRun = null
      this.rejectedSinceChunk = 0
      this.roundingCarryMm = 0
    }
    return { accepted: false, reason }
  }

  ensureRun(sample, previous) {
    const sessionKey = `${sample.track}|sequence-${previous.sequence}`
    if (this.currentRun && this.currentRun.sourceRunId === sample.runId && this.currentRun.vehicleKey === sample.vehicleKey && this.currentRun.track === sample.track) return
    this.flush()
    const timestamp = sample.capturedAt || nowIso(this.now)
    const vehicleId = stableId('vehicle', sample.vehicleKey)
    this.database.prepare('INSERT INTO vehicle_models(id,source_key,raw_name,raw_class,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET raw_name=excluded.raw_name,raw_class=excluded.raw_class,last_seen_at=excluded.last_seen_at').run(vehicleId, sample.vehicleKey, sample.carName, sample.carClass, timestamp, timestamp)
    const runId = stableId('run', `${sample.runId}|${sessionKey}|${vehicleId}`)
    this.database.prepare('INSERT OR IGNORE INTO drive_runs(id,source_run_id,session_key,game_version,track,vehicle_id,started_at) VALUES(?,?,?,?,?,?,?)').run(runId, sample.runId, sessionKey, sample.gameVersion, sample.track, vehicleId, timestamp)
    const persisted = this.database.prepare('SELECT id, track, last_sequence AS lastSequence, rounding_carry_mm AS roundingCarryMm FROM drive_runs WHERE source_run_id=? AND session_key=? AND vehicle_id=?').get(sample.runId, sessionKey, vehicleId)
    if (!persisted || persisted.track !== sample.track) throw new Error('Lifetime drive-run identity conflict')
    this.roundingCarryMm = Number(persisted.roundingCarryMm) || 0
    this.currentRun = { id: persisted.id, sourceRunId: sample.runId, vehicleId, vehicleKey: sample.vehicleKey, track: sample.track, sessionKey, lastSequence: Number(persisted.lastSequence) || 0 }
  }

  checkpoint() {
    if (!this.chunk || !this.currentRun || !this.writable || this.closed) return { ok: true, written: false }
    const chunk = this.chunk; this.chunk = null
    if (chunk.sequenceEnd <= this.currentRun.lastSequence) { this.rejectedSinceChunk = 0; return { ok: true, written: false, duplicate: true } }
    if (this.currentRun.lastSequence > 0 && chunk.sequenceStart < this.currentRun.lastSequence) {
      const error = new Error('Lifetime sequence range overlaps a committed checkpoint')
      this.chunk = chunk; this.fault = error.message; this.writable = false; throw error
    }
    const exactDistanceMm = chunk.distanceM * 1000 + this.roundingCarryMm
    const distanceMm = Math.max(0, Math.round(exactDistanceMm))
    const nextRoundingCarryMm = exactDistanceMm - distanceMm
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const timestamp = nowIso(this.now)
      this.database.prepare(`INSERT INTO distance_accumulators(drive_run_id,vehicle_id,source_run_id,sequence_start,sequence_end,distance_mm,accepted_intervals,rejected_intervals,algorithm_version,checkpointed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(drive_run_id) DO UPDATE SET sequence_end=excluded.sequence_end,distance_mm=distance_accumulators.distance_mm+excluded.distance_mm,accepted_intervals=distance_accumulators.accepted_intervals+excluded.accepted_intervals,rejected_intervals=distance_accumulators.rejected_intervals+excluded.rejected_intervals,checkpointed_at=excluded.checkpointed_at`).run(this.currentRun.id, this.currentRun.vehicleId, this.currentRun.sourceRunId, chunk.sequenceStart, chunk.sequenceEnd, distanceMm, chunk.accepted, this.rejectedSinceChunk, algorithmVersion, timestamp)
      this.roundingCarryMm = nextRoundingCarryMm
      this.currentRun.lastSequence = chunk.sequenceEnd
      this.database.prepare('UPDATE drive_runs SET accepted_intervals=accepted_intervals+?, rejected_intervals=rejected_intervals+?, last_sequence=?, rounding_carry_mm=?, ended_at=? WHERE id=?').run(chunk.accepted, this.rejectedSinceChunk, chunk.sequenceEnd, this.roundingCarryMm, timestamp, this.currentRun.id)
      this.database.prepare('UPDATE vehicle_models SET last_seen_at=? WHERE id=?').run(timestamp, this.currentRun.vehicleId)
      const accumulator = this.database.prepare('SELECT accepted_intervals AS accepted FROM distance_accumulators WHERE drive_run_id=?').get(this.currentRun.id)
      const sealed = accumulator.accepted >= sealAcceptedIntervals ? this.sealAccumulatorInTransaction(timestamp) : false
      this.database.exec('COMMIT'); this.rejectedSinceChunk = 0
      return { ok: true, written: true, sealed, distanceMm }
    } catch (error) {
      try { this.database.exec('ROLLBACK') } catch {}
      this.chunk = chunk
      this.fault = error instanceof Error ? error.message : String(error)
      this.writable = false
      throw error
    }
  }

  sealAccumulatorInTransaction(timestamp = nowIso(this.now)) {
    const pending = this.database.prepare('SELECT * FROM distance_accumulators WHERE drive_run_id=?').get(this.currentRun.id)
    if (!pending) return false
    this.sealAccumulatorRow(pending, timestamp)
    return true
  }

  sealAccumulatorRow(pending, timestamp) {
    const id = stableId('chunk', `${pending.source_run_id}|${pending.sequence_start}|${pending.sequence_end}`)
    this.database.prepare('INSERT INTO distance_chunks(id,vehicle_id,drive_run_id,source_run_id,sequence_start,sequence_end,distance_mm,accepted_intervals,rejected_intervals,algorithm_version,committed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, pending.vehicle_id, pending.drive_run_id, pending.source_run_id, pending.sequence_start, pending.sequence_end, pending.distance_mm, pending.accepted_intervals, pending.rejected_intervals, pending.algorithm_version, timestamp)
    this.database.prepare('DELETE FROM distance_accumulators WHERE drive_run_id=?').run(pending.drive_run_id)
  }

  sealRecoveredAccumulators() {
    const pending = this.database.prepare('SELECT * FROM distance_accumulators ORDER BY drive_run_id').all()
    if (pending.length === 0) return
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const timestamp = nowIso(this.now)
      for (const row of pending) this.sealAccumulatorRow(row, timestamp)
      this.database.exec('COMMIT')
    } catch (error) {
      try { this.database.exec('ROLLBACK') } catch {}
      throw new Error(`Lifetime crash-recovery sealing rolled back: ${error.message}`)
    }
  }

  flush() {
    const checkpoint = this.checkpoint()
    if (!this.currentRun || !this.writable || this.closed) return checkpoint
    this.database.exec('BEGIN IMMEDIATE')
    try {
      if (this.rejectedSinceChunk > 0) {
        this.database.prepare('UPDATE drive_runs SET rejected_intervals=rejected_intervals+? WHERE id=?').run(this.rejectedSinceChunk, this.currentRun.id)
        this.database.prepare('UPDATE distance_accumulators SET rejected_intervals=rejected_intervals+? WHERE drive_run_id=?').run(this.rejectedSinceChunk, this.currentRun.id)
        this.rejectedSinceChunk = 0
      }
      const sealed = this.sealAccumulatorInTransaction()
      this.database.exec('COMMIT')
      return { ok: true, written: checkpoint.written || sealed, sealed }
    } catch (error) {
      try { this.database.exec('ROLLBACK') } catch {}
      this.fault = error instanceof Error ? error.message : String(error)
      this.writable = false
      throw error
    }
  }

  getStats() {
    if (this.closed) return { status: 'closed', totalDistanceMm: 0, trackedSince: null, vehicles: [] }
    if (this.futureSchema) return { status: 'future-schema', schemaVersion: this.futureSchema, totalDistanceMm: 0, trackedSince: null, vehicles: [] }
    const trackedSince = this.database.prepare("SELECT value FROM app_metadata WHERE key='tracked_since'").get()?.value ?? null
    const rows = this.database.prepare(`SELECT v.id, v.raw_name AS name, v.raw_class AS className,
      COALESCE((SELECT SUM(distance_mm) FROM distance_chunks c WHERE c.vehicle_id=v.id),0)+
      COALESCE((SELECT SUM(distance_mm) FROM distance_accumulators a WHERE a.vehicle_id=v.id),0)+
      COALESCE((SELECT SUM(distance_mm) FROM distance_corrections d WHERE d.vehicle_id=v.id),0) AS distanceMm,
      COALESCE((SELECT COUNT(*) FROM drive_runs r WHERE r.vehicle_id=v.id AND r.accepted_intervals>0),0) AS sessions,
      v.first_seen_at AS firstSeenAt, v.last_seen_at AS lastSeenAt FROM vehicle_models v ORDER BY distanceMm DESC, name`).all()
    const vehicles = rows.map((row) => ({ id: row.id, name: row.name, className: row.className, distanceMm: Number(row.distanceMm), sessions: Number(row.sessions), firstSeenAt: row.firstSeenAt, lastSeenAt: row.lastSeenAt }))
    return { status: this.fault ? 'error' : 'ready', message: this.fault || undefined, schemaVersion, algorithmVersion, trackedSince, totalDistanceMm: vehicles.reduce((sum, row) => sum + row.distanceMm, 0), vehicles }
  }

  getGarageStats() {
    const empty = { schemaVersion, catalogVersion, trackedSince: null, totalDistanceMm: 0, totalDrives: 0, omittedModels: 0, models: [] }
    if (this.closed) return { ...empty, status: 'closed' }
    if (this.futureSchema) return { ...empty, status: 'future-schema', schemaVersion: this.futureSchema }
    const trackedSince = this.database.prepare("SELECT value FROM app_metadata WHERE key='tracked_since'").get()?.value ?? null
    const vehicles = this.database.prepare(`SELECT v.id, v.raw_name AS rawName, v.raw_class AS rawClass,
      COALESCE((SELECT SUM(distance_mm) FROM distance_chunks c WHERE c.vehicle_id=v.id),0)+
      COALESCE((SELECT SUM(distance_mm) FROM distance_accumulators a WHERE a.vehicle_id=v.id),0) AS measuredDistanceMm,
      COALESCE((SELECT SUM(distance_mm) FROM distance_corrections d WHERE d.vehicle_id=v.id),0) AS correctionDistanceMm,
      COALESCE((SELECT COUNT(*) FROM drive_runs r WHERE r.vehicle_id=v.id AND r.accepted_intervals>0),0) AS drives,
      v.first_seen_at AS firstDrivenAt, v.last_seen_at AS lastDrivenAt FROM vehicle_models v`).all()
    const tracks = this.database.prepare(`SELECT r.vehicle_id AS vehicleId, r.track,
      COALESCE(SUM((SELECT COALESCE(SUM(distance_mm),0) FROM distance_chunks c WHERE c.drive_run_id=r.id)+
        (SELECT COALESCE(SUM(distance_mm),0) FROM distance_accumulators a WHERE a.drive_run_id=r.id)),0) AS distanceMm,
      COUNT(*) AS drives, MIN(r.started_at) AS firstDrivenAt, MAX(COALESCE(r.ended_at,r.started_at)) AS lastDrivenAt
      FROM drive_runs r WHERE r.accepted_intervals>0 GROUP BY r.vehicle_id,r.track`).all()
    const tracksByVehicle = new Map()
    for (const row of tracks) {
      const values = tracksByVehicle.get(row.vehicleId) ?? []
      values.push({ name: String(row.track).slice(0, 160), distanceMm: Number(row.distanceMm), drives: Number(row.drives), firstDrivenAt: row.firstDrivenAt, lastDrivenAt: row.lastDrivenAt })
      tracksByVehicle.set(row.vehicleId, values)
    }
    const grouped = new Map()
    for (const row of vehicles) {
      const resolved = resolveVehicleModel(row.rawName, row.rawClass)
      const id = resolved.recognized ? resolved.id : `raw:${row.id}`
      const current = grouped.get(id) ?? {
        id, recognized: resolved.recognized, name: resolved.displayName.slice(0, 160), manufacturer: resolved.manufacturer,
        className: resolved.className.slice(0, 80), distanceMm: 0, unattributedDistanceMm: 0, drives: 0,
        firstDrivenAt: row.firstDrivenAt, lastDrivenAt: row.lastDrivenAt, variantCount: 0, tracks: new Map(),
      }
      current.distanceMm += Number(row.measuredDistanceMm) + Number(row.correctionDistanceMm)
      current.unattributedDistanceMm += Number(row.correctionDistanceMm)
      current.drives += Number(row.drives)
      current.variantCount += 1
      if (row.firstDrivenAt < current.firstDrivenAt) current.firstDrivenAt = row.firstDrivenAt
      if (row.lastDrivenAt > current.lastDrivenAt) current.lastDrivenAt = row.lastDrivenAt
      for (const track of tracksByVehicle.get(row.id) ?? []) {
        const previous = current.tracks.get(track.name)
        current.tracks.set(track.name, previous ? {
          ...previous,
          distanceMm: previous.distanceMm + track.distanceMm,
          drives: previous.drives + track.drives,
          firstDrivenAt: track.firstDrivenAt < previous.firstDrivenAt ? track.firstDrivenAt : previous.firstDrivenAt,
          lastDrivenAt: track.lastDrivenAt > previous.lastDrivenAt ? track.lastDrivenAt : previous.lastDrivenAt,
        } : track)
      }
      grouped.set(id, current)
    }
    const stableSort = (left, right) => right.distanceMm - left.distanceMm
      || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
      || (String(left.id || '') < String(right.id || '') ? -1 : String(left.id || '') > String(right.id || '') ? 1 : 0)
    const allModels = [...grouped.values()].map((model) => {
      const allTracks = [...model.tracks.values()].sort(stableSort)
      return { ...model, trackCount: allTracks.length, omittedTracks: Math.max(0, allTracks.length - 64), tracks: allTracks.slice(0, 64) }
    }).sort(stableSort)
    const totalDistanceMm = allModels.reduce((sum, model) => sum + model.distanceMm, 0)
    const totalDrives = allModels.reduce((sum, model) => sum + model.drives, 0)
    return {
      status: this.fault ? 'error' : 'ready', message: this.fault || undefined, schemaVersion, catalogVersion, trackedSince,
      totalDistanceMm, totalDrives, omittedModels: Math.max(0, allModels.length - 256),
      models: allModels.slice(0, 256),
    }
  }

  getHealth() { return { status: this.closed ? 'closed' : this.futureSchema ? 'future-schema' : this.fault ? 'error' : this.writable ? 'ready' : 'read-only', message: this.fault || undefined, schemaVersion: this.futureSchema || schemaVersion, algorithmVersion, lastBackup: this.lastBackup, path: this.filePath } }

  async createBackup() {
    if (this.closed) throw new Error('Lifetime database is closed')
    this.flush()
    const directory = path.join(path.dirname(this.filePath), 'backups'); await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    const createdAt = nowIso(this.now)
    const suffix = stableId('backup', `${createdAt}|${this.makeId()}`).slice(-8)
    const destination = path.join(directory, `apex-manual-${createdAt.replace(/[:.]/g, '-')}-${suffix}.sqlite3`)
    await backup(this.database, destination)
    await privateMode(destination)
    const result = { file: path.basename(destination), bytes: (await fs.stat(destination)).size, sha256: crypto.createHash('sha256').update(await fs.readFile(destination)).digest('hex'), createdAt }
    await fs.writeFile(`${destination}.json`, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); this.lastBackup = result
    return result
  }

  close({ requireDurable = false } = {}) {
    if (this.closed) return
    if (requireDurable && this.fault) throw new Error(`Lifetime database has an unresolved storage fault: ${this.fault}`)
    try { this.flush() } catch (error) { if (requireDurable) throw error; this.log('error', 'close-flush-failed', 'Closing after a lifetime database flush failure.', { error: error.message }) }
    if (requireDurable && this.fault) throw new Error(`Lifetime database has an unresolved storage fault: ${this.fault}`)
    if (!this.futureSchema) {
      try { this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)') }
      catch (error) { this.log('warning', 'checkpoint-deferred', 'SQLite deferred the final WAL checkpoint; committed WAL data remains durable.', { error: error.message }) }
    }
    this.database.close()
    this.closed = true
  }
  log(level, event, message, details) { void this.logger?.record(level, 'lifetime-stats', event, message, details) }
}

module.exports = { StatsDatabase, algorithmVersion, schemaVersion, vehicleKey }
