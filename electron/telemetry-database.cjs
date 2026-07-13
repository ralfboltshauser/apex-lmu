const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const { promisify } = require('node:util')
const { DatabaseSync } = require('node:sqlite')
const { buildTrackModel, TRACK_MODEL_ALGORITHM } = require('./track-model.cjs')

const deflateRaw = promisify(zlib.deflateRaw)
const SCHEMA_VERSION = 1
const PAYLOAD_FORMAT = 'apex-lap-json-deflate-v1'
const DEFAULT_MAX_SESSIONS = 40
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024
const migration1 = `
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, app_version TEXT NOT NULL, applied_at TEXT NOT NULL);
CREATE TABLE app_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sessions(id TEXT PRIMARY KEY, track_key TEXT NOT NULL, car_key TEXT NOT NULL, source TEXT NOT NULL, started_at TEXT NOT NULL, updated_at TEXT NOT NULL, ended_at TEXT, track_name TEXT NOT NULL, layout_name TEXT NOT NULL, track_length_m REAL NOT NULL, car_id INTEGER NOT NULL, car_name TEXT NOT NULL, car_class TEXT NOT NULL, interruption_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE laps(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, lap_number INTEGER NOT NULL, state TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, lap_time_ms REAL, quality TEXT NOT NULL, reasons_json TEXT NOT NULL, coverage REAL NOT NULL, maximum_gap_m REAL NOT NULL, sample_count INTEGER NOT NULL, replayable INTEGER NOT NULL, reference_eligible INTEGER NOT NULL, track_model_eligible INTEGER NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE lap_payloads(lap_id TEXT PRIMARY KEY REFERENCES laps(id) ON DELETE CASCADE, format TEXT NOT NULL, compressed BLOB NOT NULL, uncompressed_bytes INTEGER NOT NULL, crc32 INTEGER NOT NULL);
CREATE TABLE track_models(track_key TEXT PRIMARY KEY, algorithm_version TEXT NOT NULL, source_hash TEXT NOT NULL, geometry_hash TEXT NOT NULL, model_json TEXT NOT NULL, built_at TEXT NOT NULL);
CREATE TABLE track_model_sources(track_key TEXT NOT NULL REFERENCES track_models(track_key) ON DELETE CASCADE, lap_id TEXT NOT NULL REFERENCES laps(id) ON DELETE CASCADE, payload_hash TEXT NOT NULL, PRIMARY KEY(track_key, lap_id));
CREATE INDEX sessions_started ON sessions(started_at DESC);
CREATE INDEX laps_session ON laps(session_id, lap_number);
CREATE INDEX laps_pb ON laps(reference_eligible, lap_time_ms);
CREATE INDEX sessions_identity ON sessions(track_key, car_key);
`

function strictVersion(value) { return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) }
function checksum(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function migrationChecksum() { return checksum(migration1) }
function normalize(value) { return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ') }
function carKey(car) { return `car-v1|${normalize(car?.class)}|${normalize(car?.name)}` }
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
function finite(value) { return typeof value === 'number' && Number.isFinite(value) }
function privateMode(target) { return fs.chmod(target, 0o600).catch((error) => { if (process.platform !== 'win32') throw error }) }

function canonicalPayload(event) {
  return {
    schemaVersion: 1,
    format: PAYLOAD_FORMAT,
    track: { name: event.session.track.name, layout: event.session.track.layout, lengthM: event.session.track.lengthM },
    car: { name: event.session.car.name, class: event.session.car.class },
    lap: {
      number: event.lap.number, state: event.lap.state, lapTimeMs: event.lap.lapTimeMs, quality: event.lap.quality,
      reasons: [...event.lap.reasons].sort(), coverage: event.lap.coverage, maximumGapM: event.lap.maximumGapM,
      replayable: event.lap.replayable, referenceEligible: event.lap.referenceEligible, trackModelEligible: event.lap.trackModelEligible,
    },
    samples: event.samples,
  }
}

class TelemetryDatabase {
  static async open({ userDataPath, appVersion, logger = null, databasePath = null, persistReplay = false, maxSessions = DEFAULT_MAX_SESSIONS, maxBytes = DEFAULT_MAX_BYTES, now = () => new Date() }) {
    if (!path.isAbsolute(userDataPath) || !strictVersion(appVersion)) throw new Error('Telemetry database requires an absolute user-data path and strict app version')
    const filePath = databasePath || path.join(userDataPath, 'data', 'telemetry.sqlite3')
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    const existed = fsSync.existsSync(filePath)
    let database
    try { database = new DatabaseSync(filePath) } catch (error) { throw new Error(`Open telemetry database without replacing it: ${error.message}`) }
    const service = new TelemetryDatabase({ database, filePath, appVersion, logger, persistReplay, maxSessions, maxBytes, now })
    try { await service.initialize(existed); if (!service.futureSchema) await privateMode(filePath) } catch (error) { try { database.close() } catch {}; throw new Error(`Telemetry database unavailable; original file was preserved: ${error.message}`) }
    return service
  }

  constructor({ database, filePath, appVersion, logger, persistReplay, maxSessions, maxBytes, now }) {
    this.database = database; this.filePath = filePath; this.appVersion = appVersion; this.logger = logger; this.persistReplay = persistReplay; this.maxSessions = maxSessions; this.maxBytes = maxBytes; this.now = now
    this.closed = false; this.writable = false; this.futureSchema = null; this.fault = null; this.pending = Promise.resolve(); this.writes = 0
  }

  async initialize(existed) {
    this.database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;')
    if (existed) {
      const integrity = this.database.prepare('PRAGMA integrity_check').all()
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('telemetry database integrity check failed')
    }
    const current = Number(this.database.prepare('PRAGMA user_version').get().user_version)
    if (current > SCHEMA_VERSION) { this.futureSchema = current; return }
    if (current === 0) {
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.exec(migration1)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(1, 'local-lap-history', migrationChecksum(), this.appVersion, this.now().toISOString())
        this.database.exec(`PRAGMA user_version=${SCHEMA_VERSION}`)
        this.database.exec('COMMIT')
      } catch (error) { try { this.database.exec('ROLLBACK') } catch {}; throw new Error(`telemetry database migration rolled back: ${error.message}`) }
    }
    const migration = this.database.prepare('SELECT checksum FROM schema_migrations WHERE version=1').get()
    if (!migration || migration.checksum !== migrationChecksum()) throw new Error('telemetry migration checksum does not match this build')
    const insert = this.database.prepare('INSERT OR IGNORE INTO app_metadata(key,value) VALUES(?,?)')
    insert.run('schema_version', String(SCHEMA_VERSION)); insert.run('payload_format', PAYLOAD_FORMAT); insert.run('track_model_algorithm', TRACK_MODEL_ALGORITHM)
    this.database.exec('PRAGMA journal_mode=WAL;')
    this.writable = true
  }

  enqueueFinalized(event) {
    if (!this.writable || this.closed) return Promise.resolve({ written: false, reason: this.futureSchema ? 'future-schema' : 'unavailable' })
    if (!event || (event.session?.source !== 'live' && !(this.persistReplay && event.session?.source === 'recording-replay'))) return Promise.resolve({ written: false, reason: 'source-not-persisted' })
    const work = this.pending.then(() => this.writeFinalized(event))
    this.pending = work.catch((error) => { this.fault = error instanceof Error ? error.message : String(error); this.log('error', 'write-failed', 'A local lap history write failed.', { error: this.fault, lapId: event?.lap?.id }) })
    return work
  }

  async writeFinalized(event) {
    const canonical = canonicalPayload(event)
    const plain = Buffer.from(JSON.stringify(canonical))
    const payloadHash = checksum(plain)
    const compressed = await deflateRaw(plain, { level: 6 })
    const crc = crc32(plain)
    const timestamp = this.now().toISOString()
    const identity = carKey(event.session.car)
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const existing = this.database.prepare('SELECT payload_hash AS payloadHash FROM laps WHERE id=?').get(event.lap.id)
      if (existing) {
        if (existing.payloadHash !== payloadHash) throw new Error('lap ID already exists with different measured content')
        this.database.exec('COMMIT')
        return { written: false, duplicate: true, payloadHash }
      }
      this.database.prepare(`INSERT INTO sessions(id,track_key,car_key,source,started_at,updated_at,ended_at,track_name,layout_name,track_length_m,car_id,car_name,car_class,interruption_count)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,ended_at=COALESCE(excluded.ended_at,sessions.ended_at),interruption_count=excluded.interruption_count`).run(
        event.session.id, event.session.trackKey, identity, event.session.source, event.session.startedAt, event.session.updatedAt || timestamp, event.session.endedAt || null,
        event.session.track.name, event.session.track.layout, event.session.track.lengthM, event.session.car.id, event.session.car.name, event.session.car.class, event.session.interruptionCount || 0,
      )
      this.database.prepare(`INSERT INTO laps(id,session_id,lap_number,state,started_at,ended_at,lap_time_ms,quality,reasons_json,coverage,maximum_gap_m,sample_count,replayable,reference_eligible,track_model_eligible,payload_hash,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        event.lap.id, event.session.id, event.lap.number, event.lap.state, event.lap.startedAt, event.lap.endedAt || null, finite(event.lap.lapTimeMs) ? event.lap.lapTimeMs : null,
        event.lap.quality, JSON.stringify(event.lap.reasons), event.lap.coverage, event.lap.maximumGapM, event.samples.length, event.lap.replayable ? 1 : 0,
        event.lap.referenceEligible ? 1 : 0, event.lap.trackModelEligible ? 1 : 0, payloadHash, timestamp,
      )
      this.database.prepare('INSERT INTO lap_payloads(lap_id,format,compressed,uncompressed_bytes,crc32) VALUES(?,?,?,?,?)').run(event.lap.id, PAYLOAD_FORMAT, compressed, plain.length, crc)
      this.database.exec('COMMIT')
    } catch (error) { try { this.database.exec('ROLLBACK') } catch {}; throw error }
    this.writes += 1
    this.rebuildTrackModel(event.session.trackKey, event.session.track.lengthM)
    this.enforceRetention()
    return { written: true, payloadHash, bytes: compressed.length }
  }

  decodePayloadRow(row) {
    if (!row || row.format !== PAYLOAD_FORMAT) throw new Error(`unsupported lap payload format: ${row?.format || 'missing'}`)
    const plain = zlib.inflateRawSync(row.compressed, { maxOutputLength: 256 * 1024 * 1024 })
    if (plain.length !== Number(row.uncompressedBytes) || crc32(plain) !== Number(row.crc32)) throw new Error('lap payload checksum or length mismatch')
    if (checksum(plain) !== row.payloadHash) throw new Error('lap payload content hash mismatch')
    return { value: JSON.parse(plain.toString('utf8')), payloadHash: row.payloadHash }
  }

  payloadRowsForTrack(trackKey) {
    return this.database.prepare(`SELECT l.id AS lapId,l.payload_hash AS payloadHash,p.format,p.compressed,p.uncompressed_bytes AS uncompressedBytes,p.crc32
      FROM laps l JOIN sessions s ON s.id=l.session_id JOIN lap_payloads p ON p.lap_id=l.id
      WHERE s.track_key=? AND l.track_model_eligible=1 ORDER BY l.created_at DESC LIMIT 12`).all(trackKey)
  }

  rebuildTrackModel(trackKey, trackLengthM) {
    const decoded = this.payloadRowsForTrack(trackKey).map((row) => { const payload = this.decodePayloadRow(row); return { payloadHash: row.payloadHash, lap: { ...payload.value.lap, trackModelEligible: true }, samples: payload.value.samples, lapId: row.lapId } })
    const model = buildTrackModel({ trackKey, trackLengthM, laps: decoded })
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('DELETE FROM track_models WHERE track_key=?').run(trackKey)
      if (model?.published) {
        this.database.prepare('INSERT INTO track_models(track_key,algorithm_version,source_hash,geometry_hash,model_json,built_at) VALUES(?,?,?,?,?,?)').run(trackKey, model.algorithmVersion, model.sourceHash, model.geometryHash, JSON.stringify(model), this.now().toISOString())
        const insert = this.database.prepare('INSERT INTO track_model_sources(track_key,lap_id,payload_hash) VALUES(?,?,?)')
        for (const lap of decoded) insert.run(trackKey, lap.lapId, lap.payloadHash)
      }
      this.database.exec('COMMIT')
    } catch (error) { try { this.database.exec('ROLLBACK') } catch {}; throw error }
    return model
  }

  enforceRetention() {
    const rows = this.database.prepare('SELECT id FROM sessions ORDER BY started_at DESC').all()
    const pbSessions = new Set(this.database.prepare(`SELECT DISTINCT l.session_id AS sessionId FROM laps l JOIN sessions s ON s.id=l.session_id
      WHERE l.reference_eligible=1 AND l.lap_time_ms=(SELECT MIN(l2.lap_time_ms) FROM laps l2 JOIN sessions s2 ON s2.id=l2.session_id WHERE l2.reference_eligible=1 AND s2.track_key=s.track_key AND s2.car_key=s.car_key)`).all().map((row) => row.sessionId))
    const remove = rows.slice(this.maxSessions).map((row) => row.id).filter((id) => !pbSessions.has(id))
    let bytes = Number(this.database.prepare('SELECT COALESCE(SUM(length(compressed)),0) AS bytes FROM lap_payloads').get().bytes)
    for (const row of [...rows].reverse()) {
      if (bytes <= this.maxBytes && !remove.includes(row.id)) continue
      if (pbSessions.has(row.id)) continue
      const size = Number(this.database.prepare('SELECT COALESCE(SUM(length(p.compressed)),0) AS bytes FROM lap_payloads p JOIN laps l ON l.id=p.lap_id WHERE l.session_id=?').get(row.id).bytes)
      this.database.prepare('DELETE FROM sessions WHERE id=?').run(row.id)
      bytes -= size
    }
  }

  rowLapSummary(row) {
    return { id: row.id, number: Number(row.lapNumber), state: row.state, quality: row.quality, reasons: JSON.parse(row.reasonsJson), lapTimeMs: row.lapTimeMs === null ? null : Number(row.lapTimeMs), coverage: Number(row.coverage), maximumGapM: Number(row.maximumGapM), sampleCount: Number(row.sampleCount), samplesAvailable: true, replayable: Boolean(row.replayable), referenceEligible: Boolean(row.referenceEligible), trackModelEligible: Boolean(row.trackModelEligible), payloadHash: row.payloadHash }
  }

  listSessions() {
    if (this.closed || this.futureSchema) return []
    const sessions = this.database.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all()
    const lapQuery = this.database.prepare(`SELECT id,lap_number AS lapNumber,state,quality,reasons_json AS reasonsJson,lap_time_ms AS lapTimeMs,coverage,maximum_gap_m AS maximumGapM,sample_count AS sampleCount,replayable,reference_eligible AS referenceEligible,track_model_eligible AS trackModelEligible,payload_hash AS payloadHash FROM laps WHERE session_id=? ORDER BY lap_number,id`)
    return sessions.map((session) => ({
      schemaVersion: 1, qualityPolicyVersion: 'lap-quality-v1', revision: this.writes, id: session.id, source: session.source, state: 'finished', startedAt: session.started_at, endedAt: session.ended_at,
      track: { name: session.track_name, layout: session.layout_name, lengthM: Number(session.track_length_m) }, car: { id: Number(session.car_id), name: session.car_name, class: session.car_class },
      laps: lapQuery.all(session.id).map((lap) => this.rowLapSummary(lap)), currentLapId: null, interruptionCount: Number(session.interruption_count), sourceSegmentCount: 1,
    }))
  }

  lapRow(sessionId, lapId) {
    return this.database.prepare(`SELECT l.*,l.lap_number AS lapNumber,l.reasons_json AS reasonsJson,l.lap_time_ms AS lapTimeMs,l.maximum_gap_m AS maximumGapM,l.sample_count AS sampleCount,l.reference_eligible AS referenceEligible,l.track_model_eligible AS trackModelEligible,l.payload_hash AS payloadHash,
      s.track_key AS trackKey,s.car_key AS carKey,p.format,p.compressed,p.uncompressed_bytes AS uncompressedBytes,p.crc32
      FROM laps l JOIN sessions s ON s.id=l.session_id JOIN lap_payloads p ON p.lap_id=l.id WHERE l.session_id=? AND l.id=?`).get(sessionId, lapId)
  }

  getLap(sessionId, lapId) {
    if (this.closed || this.futureSchema) return null
    const row = this.lapRow(sessionId, lapId)
    if (!row) return null
    const decoded = this.decodePayloadRow(row)
    const session = this.listSessions().find((candidate) => candidate.id === sessionId)
    const lap = this.rowLapSummary(row)
    const modelRow = this.database.prepare('SELECT model_json AS modelJson FROM track_models WHERE track_key=?').get(row.trackKey)
    const pb = this.database.prepare(`SELECT l.id,l.session_id AS sessionId FROM laps l JOIN sessions s ON s.id=l.session_id WHERE s.track_key=? AND s.car_key=? AND l.reference_eligible=1 AND l.lap_time_ms IS NOT NULL ORDER BY l.lap_time_ms,l.created_at LIMIT 1`).get(row.trackKey, row.carKey)
    let personalBest = null
    if (pb) {
      const pbRow = this.lapRow(pb.sessionId, pb.id)
      const pbSession = this.listSessions().find((candidate) => candidate.id === pb.sessionId)
      if (pbRow && pbSession) personalBest = { session: pbSession, lap: this.rowLapSummary(pbRow), samples: this.decodePayloadRow(pbRow).value.samples }
    }
    return { schemaVersion: 1, session, lap, samples: decoded.value.samples, payloadHash: decoded.payloadHash, trackModel: modelRow ? JSON.parse(modelRow.modelJson) : null, personalBest }
  }

  getHealth() { return { status: this.closed ? 'closed' : this.futureSchema ? 'future-schema' : this.fault ? 'error' : this.writable ? 'ready' : 'read-only', schemaVersion: this.futureSchema || SCHEMA_VERSION, payloadFormat: PAYLOAD_FORMAT, algorithmVersion: TRACK_MODEL_ALGORITHM, path: this.filePath, writes: this.writes, message: this.fault || undefined } }
  async flush() { await this.pending }
  async close({ requireDurable = false } = {}) {
    if (this.closed) return
    await this.flush()
    if (requireDurable && this.fault) throw new Error(`Telemetry database has an unresolved storage fault: ${this.fault}`)
    if (!this.futureSchema) this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    this.database.close(); this.closed = true
  }
  log(level, event, message, details) { void this.logger?.record(level, 'telemetry-history', event, message, details) }
}

module.exports = { TelemetryDatabase, SCHEMA_VERSION, PAYLOAD_FORMAT, crc32, canonicalPayload, carKey }
