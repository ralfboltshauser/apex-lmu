const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const { promisify } = require('node:util')
const { DatabaseSync } = require('node:sqlite')
const { buildTrackModel, TRACK_MODEL_ALGORITHM } = require('./track-model.cjs')
const { constants: { QUALITY_POLICY_VERSION } } = require('./live-session-store.cjs')

const deflateRaw = promisify(zlib.deflateRaw)
const SCHEMA_VERSION = 4
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
const migration2 = `
CREATE TABLE recording_imports(id TEXT PRIMARY KEY, recording_sha256 TEXT NOT NULL, recording_format TEXT NOT NULL, processing_version TEXT NOT NULL, imported_at TEXT NOT NULL, app_version TEXT NOT NULL, session_count INTEGER NOT NULL, lap_count INTEGER NOT NULL, UNIQUE(recording_sha256, processing_version));
CREATE TABLE recording_import_sessions(import_id TEXT NOT NULL REFERENCES recording_imports(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, PRIMARY KEY(import_id, session_id));
CREATE INDEX recording_import_sessions_session ON recording_import_sessions(session_id);
`
const migration3 = `
ALTER TABLE sessions ADD COLUMN quality_policy_version TEXT NOT NULL DEFAULT 'lap-quality-v1';
`
const migration4 = `
ALTER TABLE laps ADD COLUMN timing_source TEXT NOT NULL DEFAULT 'legacy-unknown';
UPDATE laps SET reference_eligible=0, track_model_eligible=0;
DELETE FROM track_models;
DROP INDEX laps_pb;
CREATE INDEX laps_pb ON laps(timing_source, reference_eligible, lap_time_ms);
`

const REQUIRED_STAGING_COLUMNS = {
  schema_migrations: ['version', 'name', 'checksum', 'app_version', 'applied_at'],
  app_metadata: ['key', 'value'],
  sessions: ['id', 'track_key', 'car_key', 'source', 'started_at', 'updated_at', 'ended_at', 'track_name', 'layout_name', 'track_length_m', 'car_id', 'car_name', 'car_class', 'interruption_count', 'quality_policy_version'],
  laps: ['id', 'session_id', 'lap_number', 'state', 'started_at', 'ended_at', 'lap_time_ms', 'quality', 'reasons_json', 'coverage', 'maximum_gap_m', 'sample_count', 'replayable', 'reference_eligible', 'track_model_eligible', 'payload_hash', 'created_at', 'timing_source'],
  lap_payloads: ['lap_id', 'format', 'compressed', 'uncompressed_bytes', 'crc32'],
  track_models: ['track_key', 'algorithm_version', 'source_hash', 'geometry_hash', 'model_json', 'built_at'],
  track_model_sources: ['track_key', 'lap_id', 'payload_hash'],
  recording_imports: ['id', 'recording_sha256', 'recording_format', 'processing_version', 'imported_at', 'app_version', 'session_count', 'lap_count'],
  recording_import_sessions: ['import_id', 'session_id'],
}

const SESSION_CONTENT_COLUMNS = ['track_key', 'car_key', 'started_at', 'updated_at', 'ended_at', 'track_name', 'layout_name', 'track_length_m', 'car_id', 'car_name', 'car_class', 'interruption_count', 'quality_policy_version']
const LAP_CONTENT_COLUMNS = ['session_id', 'lap_number', 'state', 'started_at', 'ended_at', 'lap_time_ms', 'quality', 'reasons_json', 'coverage', 'maximum_gap_m', 'sample_count', 'replayable', 'reference_eligible', 'track_model_eligible', 'payload_hash', 'timing_source']

function strictVersion(value) { return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) }
function checksum(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function migrationChecksum() { return checksum(migration1) }
function migration2Checksum() { return checksum(migration2) }
function migration3Checksum() { return checksum(migration3) }
function migration4Checksum() { return checksum(migration4) }
function migrationHistoryMatches(rows, count = SCHEMA_VERSION) {
  const expected = [
    [1, 'local-lap-history', migrationChecksum()],
    [2, 'private-recording-imports', migration2Checksum()],
    [3, 'session-quality-policy-provenance', migration3Checksum()],
    [4, 'official-lap-time-provenance', migration4Checksum()],
  ]
  return rows.length === count && expected.slice(0, count).every(([version, name, expectedChecksum], index) => (
    Number(rows[index]?.version) === version && rows[index]?.name === name && rows[index]?.checksum === expectedChecksum
  ))
}
function normalize(value) { return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ') }
function carKey(car) { return `car-v1|${normalize(car?.class)}|${normalize(car?.name)}` }
function trackKey(track) { return `${normalize(track?.name)}|${normalize(track?.layout)}|${Math.round(Number(track?.lengthM) || 0)}` }
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
function privateDirectoryMode(target) { return fs.chmod(target, 0o700).catch((error) => { if (process.platform !== 'win32') throw error }) }
function sameValue(left, right) { return left === right || (typeof left === 'number' && typeof right === 'number' && Number.isNaN(left) && Number.isNaN(right)) }
function sameColumns(left, right, columns) { return columns.every((column) => sameValue(left[column], right[column])) }
function validIsoDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function boundedToken(value, maximum = 200) { return typeof value === 'string' && value.length > 0 && value.length <= maximum && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) }
function validQualityPolicyVersion(value) { return typeof value === 'string' && /^lap-quality-v[1-9]\d*$/.test(value) }
function validTimingSource(value) { return ['official', 'unavailable', 'legacy-unknown'].includes(value) }

function canonicalPayload(event) {
  return {
    schemaVersion: 1,
    format: PAYLOAD_FORMAT,
    track: { name: event.session.track.name, layout: event.session.track.layout, lengthM: event.session.track.lengthM },
    car: { name: event.session.car.name, class: event.session.car.class },
    lap: {
      number: event.lap.number, state: event.lap.state, lapTimeMs: event.lap.lapTimeMs, timingSource: event.lap.timingSource, quality: event.lap.quality,
      reasons: [...event.lap.reasons].sort(), coverage: event.lap.coverage, maximumGapM: event.lap.maximumGapM,
      replayable: event.lap.replayable, referenceEligible: event.lap.referenceEligible, trackModelEligible: event.lap.trackModelEligible,
    },
    samples: event.samples,
  }
}

function decodedPayloadMatchesRow(decoded, row) {
  let reasons
  try { reasons = JSON.parse(row.reasonsJson) } catch { return false }
  return Array.isArray(reasons)
    && reasons.every((reason) => typeof reason === 'string')
    && decoded?.schemaVersion === 1
    && decoded?.format === PAYLOAD_FORMAT
    && Array.isArray(decoded.samples)
    && decoded.samples.length === Number(row.sampleCount)
    && decoded.track?.name === row.trackName
    && decoded.track?.layout === row.layoutName
    && decoded.track?.lengthM === Number(row.trackLengthM)
    && decoded.car?.name === row.carName
    && decoded.car?.class === row.carClass
    && decoded.lap?.number === Number(row.lapNumber)
    && decoded.lap?.state === row.state
    && decoded.lap?.lapTimeMs === (row.lapTimeMs === null ? null : Number(row.lapTimeMs))
    && decoded.lap?.timingSource === row.timingSource
    && decoded.lap?.quality === row.quality
    && JSON.stringify(decoded.lap?.reasons) === JSON.stringify([...reasons].sort())
    && decoded.lap?.coverage === Number(row.coverage)
    && decoded.lap?.maximumGapM === Number(row.maximumGapM)
    && decoded.lap?.replayable === Boolean(row.replayable)
    && decoded.lap?.referenceEligible === Boolean(row.referenceEligible)
    && decoded.lap?.trackModelEligible === Boolean(row.trackModelEligible)
}

class TelemetryDatabase {
  static async open({ userDataPath, appVersion, logger = null, databasePath = null, persistReplay = false, deferPerLapTrackModels = false, maxSessions = DEFAULT_MAX_SESSIONS, maxBytes = DEFAULT_MAX_BYTES, now = () => new Date() }) {
    if (!path.isAbsolute(userDataPath) || !strictVersion(appVersion)) throw new Error('Telemetry database requires an absolute user-data path and strict app version')
    const filePath = databasePath || path.join(userDataPath, 'data', 'telemetry.sqlite3')
    const directory = path.dirname(filePath)
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    // SQLite may create WAL/SHM sidecars before the main file is chmodded.
    // Repair an existing internal directory on every open so those files stay
    // behind a private traversal boundary even with a permissive umask.
    await privateDirectoryMode(directory)
    const existed = fsSync.existsSync(filePath)
    let database
    try { database = new DatabaseSync(filePath) } catch (error) { throw new Error(`Open telemetry database without replacing it: ${error.message}`) }
    const service = new TelemetryDatabase({ database, filePath, appVersion, logger, persistReplay, deferPerLapTrackModels, maxSessions, maxBytes, now })
    try { await service.initialize(existed); if (!service.futureSchema) await privateMode(filePath) } catch (error) { try { database.close() } catch {}; throw new Error(`Telemetry database unavailable; original file was preserved: ${error.message}`) }
    return service
  }

  constructor({ database, filePath, appVersion, logger, persistReplay, deferPerLapTrackModels, maxSessions, maxBytes, now }) {
    this.database = database; this.filePath = filePath; this.appVersion = appVersion; this.logger = logger; this.persistReplay = persistReplay; this.deferPerLapTrackModels = deferPerLapTrackModels === true; this.maxSessions = maxSessions; this.maxBytes = maxBytes; this.now = now
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
        this.database.exec(migration2)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(2, 'private-recording-imports', migration2Checksum(), this.appVersion, this.now().toISOString())
        this.database.exec(migration3)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(3, 'session-quality-policy-provenance', migration3Checksum(), this.appVersion, this.now().toISOString())
        this.database.exec(migration4)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(4, 'official-lap-time-provenance', migration4Checksum(), this.appVersion, this.now().toISOString())
        this.database.exec(`PRAGMA user_version=${SCHEMA_VERSION}`)
        this.database.exec('COMMIT')
      } catch (error) { try { this.database.exec('ROLLBACK') } catch {}; throw new Error(`telemetry database migration rolled back: ${error.message}`) }
    } else if (current === 1) {
      const legacyMigrations = this.database.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all()
      if (!migrationHistoryMatches(legacyMigrations, 1)) throw new Error('telemetry migration checksum does not match this build')
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.exec(migration2)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(2, 'private-recording-imports', migration2Checksum(), this.appVersion, this.now().toISOString())
        this.database.exec(migration3)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(3, 'session-quality-policy-provenance', migration3Checksum(), this.appVersion, this.now().toISOString())
        this.database.exec(migration4)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(4, 'official-lap-time-provenance', migration4Checksum(), this.appVersion, this.now().toISOString())
        this.database.exec(`PRAGMA user_version=${SCHEMA_VERSION}`)
        this.database.exec('COMMIT')
      } catch (error) { try { this.database.exec('ROLLBACK') } catch {}; throw new Error(`telemetry database migration rolled back: ${error.message}`) }
    } else if (current === 2) {
      const legacyMigrations = this.database.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all()
      if (!migrationHistoryMatches(legacyMigrations, 2)) throw new Error('telemetry migration checksum does not match this build')
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.exec(migration3)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(3, 'session-quality-policy-provenance', migration3Checksum(), this.appVersion, this.now().toISOString())
        this.database.exec(migration4)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(4, 'official-lap-time-provenance', migration4Checksum(), this.appVersion, this.now().toISOString())
        this.database.exec(`PRAGMA user_version=${SCHEMA_VERSION}`)
        this.database.exec('COMMIT')
      } catch (error) { try { this.database.exec('ROLLBACK') } catch {}; throw new Error(`telemetry database migration rolled back: ${error.message}`) }
    } else if (current === 3) {
      const legacyMigrations = this.database.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all()
      if (!migrationHistoryMatches(legacyMigrations, 3)) throw new Error('telemetry migration checksum does not match this build')
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.exec(migration4)
        this.database.prepare('INSERT INTO schema_migrations(version,name,checksum,app_version,applied_at) VALUES(?,?,?,?,?)').run(4, 'official-lap-time-provenance', migration4Checksum(), this.appVersion, this.now().toISOString())
        this.database.exec(`PRAGMA user_version=${SCHEMA_VERSION}`)
        this.database.exec('COMMIT')
      } catch (error) { try { this.database.exec('ROLLBACK') } catch {}; throw new Error(`telemetry database migration rolled back: ${error.message}`) }
    }
    const migrations = this.database.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all()
    if (!migrationHistoryMatches(migrations)) throw new Error('telemetry migration checksum does not match this build')
    const insert = this.database.prepare('INSERT INTO app_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    insert.run('schema_version', String(SCHEMA_VERSION)); insert.run('payload_format', PAYLOAD_FORMAT); insert.run('track_model_algorithm', TRACK_MODEL_ALGORITHM); insert.run('quality_policy_version', QUALITY_POLICY_VERSION)
    this.database.exec('PRAGMA journal_mode=WAL;')
    this.writable = true
  }

  transaction(work) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      try { this.database.exec('ROLLBACK') } catch {}
      throw error
    }
  }

  enqueueFinalized(event) {
    if (!this.writable || this.closed) return Promise.resolve({ written: false, reason: this.futureSchema ? 'future-schema' : 'unavailable' })
    if (!event || (event.session?.source !== 'live' && !(this.persistReplay && event.session?.source === 'recording-replay'))) return Promise.resolve({ written: false, reason: 'source-not-persisted' })
    const work = this.pending.then(() => this.writeFinalized(event))
    this.pending = work.catch((error) => { this.fault = error instanceof Error ? error.message : String(error); this.log('error', 'write-failed', 'A local lap history write failed.', { error: this.fault, lapId: event?.lap?.id }) })
    return work
  }

  enqueueSessionFinalized(summary) {
    if (!this.writable || this.closed) return Promise.resolve({ written: false, reason: this.futureSchema ? 'future-schema' : 'unavailable' })
    if (!summary || (summary.source !== 'live' && !(this.persistReplay && summary.source === 'recording-replay'))) return Promise.resolve({ written: false, reason: 'source-not-persisted' })
    const work = this.pending.then(() => this.writeSessionFinalized(summary))
    this.pending = work.catch((error) => { this.fault = error instanceof Error ? error.message : String(error); this.log('error', 'session-update-failed', 'A finalized local session could not be updated.', { error: this.fault, sessionId: summary?.id }) })
    return work
  }

  writeSessionFinalized(summary) {
    if (typeof summary.id !== 'string' || !summary.id || !validIsoDate(summary.endedAt) || !Number.isSafeInteger(summary.interruptionCount) || summary.interruptionCount < 0) throw new Error('finalized session summary is invalid')
    const result = this.transaction(() => {
      const existing = this.database.prepare('SELECT source FROM sessions WHERE id=?').get(summary.id)
      if (!existing) return { written: false, reason: 'not-found' }
      if (existing.source !== summary.source) throw new Error('session ID already exists with a different source')
      this.database.prepare('UPDATE sessions SET updated_at=?,ended_at=?,interruption_count=? WHERE id=?').run(summary.endedAt, summary.endedAt, summary.interruptionCount, summary.id)
      return { written: true }
    })
    if (result.written) this.writes += 1
    return result
  }

  async writeFinalized(event) {
    if (!validQualityPolicyVersion(event?.qualityPolicyVersion)) throw new Error('lap quality policy version is invalid')
    if (!['official', 'unavailable'].includes(event?.lap?.timingSource)) throw new Error('lap timing provenance is invalid')
    const hasOfficialTime = event.lap.timingSource === 'official'
      && event.lap.state === 'complete'
      && finite(event.lap.lapTimeMs)
      && event.lap.lapTimeMs > 0
    if ((event.lap.timingSource === 'official' && !hasOfficialTime)
      || (event.lap.timingSource === 'unavailable' && event.lap.lapTimeMs !== null)
      || (!hasOfficialTime && (event.lap.referenceEligible || event.lap.trackModelEligible))) throw new Error('lap timing provenance conflicts with eligibility or time')
    const canonical = canonicalPayload(event)
    const plain = Buffer.from(JSON.stringify(canonical))
    const payloadHash = checksum(plain)
    const compressed = await deflateRaw(plain, { level: 6 })
    const crc = crc32(plain)
    const timestamp = this.now().toISOString()
    const identity = carKey(event.session.car)
    const result = this.transaction(() => {
      const existingSession = this.database.prepare('SELECT source,quality_policy_version AS qualityPolicyVersion FROM sessions WHERE id=?').get(event.session.id)
      if (existingSession?.source !== undefined && existingSession.source !== event.session.source) throw new Error('session ID already exists with a different source')
      if (existingSession && existingSession.qualityPolicyVersion !== event.qualityPolicyVersion) throw new Error('session cannot mix lap quality policy versions')
      const existing = this.database.prepare('SELECT payload_hash AS payloadHash FROM laps WHERE id=?').get(event.lap.id)
      if (existing) {
        if (existing.payloadHash !== payloadHash) throw new Error('lap ID already exists with different measured content')
        return { written: false, duplicate: true, payloadHash }
      }
      this.database.prepare(`INSERT INTO sessions(id,track_key,car_key,source,started_at,updated_at,ended_at,track_name,layout_name,track_length_m,car_id,car_name,car_class,interruption_count,quality_policy_version)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,ended_at=COALESCE(excluded.ended_at,sessions.ended_at),interruption_count=excluded.interruption_count`).run(
        event.session.id, event.session.trackKey, identity, event.session.source, event.session.startedAt, event.session.updatedAt || timestamp, event.session.endedAt || null,
        event.session.track.name, event.session.track.layout, event.session.track.lengthM, event.session.car.id, event.session.car.name, event.session.car.class, event.session.interruptionCount || 0, event.qualityPolicyVersion,
      )
      this.database.prepare(`INSERT INTO laps(id,session_id,lap_number,state,started_at,ended_at,lap_time_ms,quality,reasons_json,coverage,maximum_gap_m,sample_count,replayable,reference_eligible,track_model_eligible,payload_hash,created_at,timing_source)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        event.lap.id, event.session.id, event.lap.number, event.lap.state, event.lap.startedAt, event.lap.endedAt || null, finite(event.lap.lapTimeMs) ? event.lap.lapTimeMs : null,
        event.lap.quality, JSON.stringify(event.lap.reasons), event.lap.coverage, event.lap.maximumGapM, event.samples.length, event.lap.replayable ? 1 : 0,
        event.lap.referenceEligible ? 1 : 0, event.lap.trackModelEligible ? 1 : 0, payloadHash, timestamp, event.lap.timingSource,
      )
      this.database.prepare('INSERT INTO lap_payloads(lap_id,format,compressed,uncompressed_bytes,crc32) VALUES(?,?,?,?,?)').run(event.lap.id, PAYLOAD_FORMAT, compressed, plain.length, crc)
      return { written: true, payloadHash, bytes: compressed.length }
    })
    if (!result.written) return result
    this.writes += 1
    // Import staging is an isolated write-only database. Rebuilding the same
    // derived track model after every lap is quadratic work there; the atomic
    // merge validates every payload and rebuilds each affected main-database
    // model exactly once before provenance becomes visible.
    if (!this.deferPerLapTrackModels) this.rebuildTrackModel(event.session.trackKey, event.session.track.lengthM)
    this.enforceRetention()
    return result
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
      WHERE s.track_key=? AND l.track_model_eligible=1 ORDER BY l.created_at DESC,l.id LIMIT 12`).all(trackKey)
  }

  rebuildTrackModelWithinTransaction(trackKey, trackLengthM) {
    const decoded = this.payloadRowsForTrack(trackKey).map((row) => { const payload = this.decodePayloadRow(row); return { payloadHash: row.payloadHash, lap: { ...payload.value.lap, trackModelEligible: true }, samples: payload.value.samples, lapId: row.lapId } })
    const model = buildTrackModel({ trackKey, trackLengthM, laps: decoded })
    this.database.prepare('DELETE FROM track_models WHERE track_key=?').run(trackKey)
    if (model?.published) {
      this.database.prepare('INSERT INTO track_models(track_key,algorithm_version,source_hash,geometry_hash,model_json,built_at) VALUES(?,?,?,?,?,?)').run(trackKey, model.algorithmVersion, model.sourceHash, model.geometryHash, JSON.stringify(model), this.now().toISOString())
      const insert = this.database.prepare('INSERT INTO track_model_sources(track_key,lap_id,payload_hash) VALUES(?,?,?)')
      for (const lap of decoded) insert.run(trackKey, lap.lapId, lap.payloadHash)
    }
    return model
  }

  rebuildTrackModel(trackKey, trackLengthM) { return this.transaction(() => this.rebuildTrackModelWithinTransaction(trackKey, trackLengthM)) }

  enforceRetentionWithinTransaction(protectedSessionIds = new Set()) {
    const rows = this.database.prepare(`SELECT s.id,s.track_key AS trackKey,s.track_length_m AS trackLengthM,s.started_at AS startedAt,
      COALESCE(SUM(length(p.compressed)),0) AS payloadBytes
      FROM sessions s LEFT JOIN laps l ON l.session_id=s.id LEFT JOIN lap_payloads p ON p.lap_id=l.id
      GROUP BY s.id,s.track_key,s.track_length_m,s.started_at ORDER BY s.started_at DESC,s.id`).all()
    const preferredPbSessions = new Set()
    const pbIdentities = new Set()
    const pbRows = this.database.prepare(`SELECT s.track_key AS trackKey,s.car_key AS carKey,l.session_id AS sessionId
      FROM laps l JOIN sessions s ON s.id=l.session_id
      WHERE l.timing_source='official' AND l.reference_eligible=1 AND l.lap_time_ms IS NOT NULL
      ORDER BY s.track_key,s.car_key,l.lap_time_ms,l.created_at,l.id`).all()
    for (const row of pbRows) {
      const identity = JSON.stringify([row.trackKey, row.carKey])
      if (pbIdentities.has(identity)) continue
      pbIdentities.add(identity)
      preferredPbSessions.add(row.sessionId)
    }
    const protectedIds = new Set(rows.map((row) => row.id).filter((id) => protectedSessionIds.has(id)))
    const protectedBytes = rows.filter((row) => protectedIds.has(row.id)).reduce((total, row) => total + Number(row.payloadBytes), 0)
    if (protectedIds.size > this.maxSessions || protectedBytes > this.maxBytes) throw new Error('protected recording import could not be retained atomically within local history limits')

    // The currently committing import is indivisible. Within the remaining
    // hard capacity, retain one deterministic PB session per track/car before
    // filling with newest ordinary sessions. A PB is a preference, never an
    // exemption from either advertised limit.
    const keep = new Set(protectedIds)
    let keptBytes = protectedBytes
    const candidates = [
      ...rows.filter((row) => preferredPbSessions.has(row.id) && !protectedIds.has(row.id)),
      ...rows.filter((row) => !preferredPbSessions.has(row.id) && !protectedIds.has(row.id)),
    ]
    for (const row of candidates) {
      const rowBytes = Number(row.payloadBytes)
      if (keep.size >= this.maxSessions || keptBytes + rowBytes > this.maxBytes) continue
      keep.add(row.id)
      keptBytes += rowBytes
    }

    const affectedTracks = new Map()
    for (const row of [...rows].reverse()) {
      if (keep.has(row.id)) continue
      this.database.prepare('DELETE FROM sessions WHERE id=?').run(row.id)
      affectedTracks.set(row.trackKey, Number(row.trackLengthM))
    }
    // A published model is derived data. Cascading deletion removes its source
    // rows, but not the model row itself, so always rebuild affected tracks
    // after retention. With fewer than two corroborating laps the rebuild
    // deliberately withdraws the model.
    for (const [trackKey, trackLengthM] of affectedTracks) this.rebuildTrackModelWithinTransaction(trackKey, trackLengthM)
    this.removeIncompleteRecordingImportsWithinTransaction()
    const retainedSessions = Number(this.database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count)
    const retainedBytes = Number(this.database.prepare('SELECT COALESCE(SUM(length(compressed)),0) AS bytes FROM lap_payloads').get().bytes)
    if (retainedSessions > this.maxSessions || retainedBytes > this.maxBytes) throw new Error('telemetry retention could not satisfy its hard limits')
    return affectedTracks
  }

  enforceRetention() { return this.transaction(() => this.enforceRetentionWithinTransaction()) }

  removeIncompleteRecordingImportsWithinTransaction() {
    return this.database.prepare(`DELETE FROM recording_imports
      WHERE session_count != (
        SELECT COUNT(*) FROM recording_import_sessions ris
        JOIN sessions s ON s.id=ris.session_id
        WHERE ris.import_id=recording_imports.id
      ) OR lap_count != (
        SELECT COUNT(*) FROM recording_import_sessions ris
        JOIN laps l ON l.session_id=ris.session_id
        JOIN lap_payloads p ON p.lap_id=l.id
        WHERE ris.import_id=recording_imports.id
      )`).run()
  }

  normalizeImportMetadata(metadata) {
    const id = metadata?.id
    const recordingSha256 = typeof metadata?.recordingSha256 === 'string' ? metadata.recordingSha256.toLowerCase() : ''
    const recordingFormat = metadata?.recordingFormat
    const processingVersion = metadata?.processingVersion
    const importedAt = metadata?.importedAt || this.now().toISOString()
    const appVersion = metadata?.appVersion || this.appVersion
    if (!boundedToken(id) || !/^[a-f0-9]{64}$/.test(recordingSha256) || !boundedToken(recordingFormat, 128) || !boundedToken(processingVersion, 128) || !validIsoDate(importedAt) || !strictVersion(appVersion)) throw new Error('recording import metadata is invalid')
    return { id, recordingSha256, recordingFormat, processingVersion, importedAt, appVersion }
  }

  importProvenance(row, sessionIds = undefined) {
    if (!row) return null
    if ((row.actualSessionCount !== undefined && Number(row.actualSessionCount) !== Number(row.sessionCount))
      || (row.actualLapCount !== undefined && Number(row.actualLapCount) !== Number(row.lapCount))) return null
    const provenance = {
      id: row.id,
      recordingSha256: row.recordingSha256,
      recordingFormat: row.recordingFormat,
      processingVersion: row.processingVersion,
      importedAt: row.importedAt,
      appVersion: row.appVersion,
      sessionCount: Number(row.sessionCount),
      lapCount: Number(row.lapCount),
    }
    if (sessionIds) provenance.sessionIds = [...sessionIds]
    return provenance
  }

  recordingImportPayloadsAreValid(importId, expectedLapCount) {
    const rows = this.database.prepare(`SELECT l.lap_number AS lapNumber,l.state,l.lap_time_ms AS lapTimeMs,l.timing_source AS timingSource,l.quality,l.reasons_json AS reasonsJson,l.coverage,l.maximum_gap_m AS maximumGapM,l.sample_count AS sampleCount,l.replayable,l.reference_eligible AS referenceEligible,l.track_model_eligible AS trackModelEligible,l.payload_hash AS payloadHash,
      p.format,p.compressed,p.uncompressed_bytes AS uncompressedBytes,p.crc32,
      s.source AS sessionSource,s.quality_policy_version AS qualityPolicyVersion,s.track_key AS trackKey,s.car_key AS carKey,s.track_name AS trackName,s.layout_name AS layoutName,s.track_length_m AS trackLengthM,s.car_name AS carName,s.car_class AS carClass
      FROM recording_import_sessions ris JOIN sessions s ON s.id=ris.session_id JOIN laps l ON l.session_id=s.id
      JOIN lap_payloads p ON p.lap_id=l.id WHERE ris.import_id=? ORDER BY l.id`).all(importId)
    if (rows.length !== expectedLapCount) return false
    try {
      for (const row of rows) {
        const decoded = this.decodePayloadRow(row).value
        if (row.sessionSource !== 'imported-recording' || row.qualityPolicyVersion !== QUALITY_POLICY_VERSION
          || row.trackKey !== trackKey(decoded.track) || row.carKey !== carKey(decoded.car)
          || !decodedPayloadMatchesRow(decoded, row)) return false
      }
      return true
    } catch { return false }
  }

  findRecordingImport(recordingSha256, processingVersion) {
    if (this.closed || this.futureSchema) return null
    const normalizedSha = typeof recordingSha256 === 'string' ? recordingSha256.toLowerCase() : ''
    if (!/^[a-f0-9]{64}$/.test(normalizedSha) || !boundedToken(processingVersion, 128)) throw new Error('recording import lookup is invalid')
    const row = this.database.prepare(`SELECT id,recording_sha256 AS recordingSha256,recording_format AS recordingFormat,processing_version AS processingVersion,imported_at AS importedAt,app_version AS appVersion,session_count AS sessionCount,lap_count AS lapCount
      FROM recording_imports WHERE recording_sha256=? AND processing_version=?`).get(normalizedSha, processingVersion)
    if (!row) return null
    const sessionIds = this.database.prepare(`SELECT ris.session_id AS sessionId FROM recording_import_sessions ris
      JOIN sessions s ON s.id=ris.session_id WHERE ris.import_id=? ORDER BY s.started_at DESC,ris.session_id`).all(row.id).map((entry) => entry.sessionId)
    if (sessionIds.length !== Number(row.sessionCount) || !this.recordingImportPayloadsAreValid(row.id, Number(row.lapCount))) return null
    return this.importProvenance(row, sessionIds)
  }

  importStaged(stagingPath, metadata) {
    if (!this.writable || this.closed) return Promise.resolve({ imported: false, duplicate: false, reason: this.futureSchema ? 'future-schema' : 'unavailable' })
    let normalized
    try { normalized = this.normalizeImportMetadata(metadata) } catch (error) { return Promise.reject(error) }
    const work = this.pending.then(() => this.importStagedNow(stagingPath, normalized))
    // An invalid or corrupt recording import is an isolated operation failure,
    // not evidence that the main history database has become unhealthy.
    this.pending = work.catch((error) => this.log('warn', 'recording-import-rejected', 'A staged recording import was rejected without changing local history.', { error: error instanceof Error ? error.message : String(error), importId: normalized.id }))
    return work
  }

  importStagedNow(stagingPath, metadata) {
    if (typeof stagingPath !== 'string' || !path.isAbsolute(stagingPath)) throw new Error('staged telemetry database path must be absolute')
    const duplicate = this.findRecordingImport(metadata.recordingSha256, metadata.processingVersion)
    if (duplicate) return { imported: false, duplicate: true, ...duplicate, sessions: duplicate.sessionCount, laps: duplicate.lapCount, importedSessions: 0, importedLaps: 0, affectedTrackKeys: [] }
    let stagingRealPath
    let mainRealPath
    try {
      const stat = fsSync.statSync(stagingPath)
      if (!stat.isFile()) throw new Error('not a regular file')
      stagingRealPath = fsSync.realpathSync(stagingPath)
      mainRealPath = fsSync.realpathSync(this.filePath)
    } catch { throw new Error('staged telemetry database is unavailable') }
    if (stagingRealPath === mainRealPath) throw new Error('main telemetry database cannot import itself')

    const collidingImports = this.database.prepare(`SELECT id,recording_sha256 AS recordingSha256,processing_version AS processingVersion FROM recording_imports
      WHERE id=? OR (recording_sha256=? AND processing_version=?)`).all(metadata.id, metadata.recordingSha256, metadata.processingVersion)
    if (collidingImports.some((entry) => entry.id !== metadata.id || entry.recordingSha256 !== metadata.recordingSha256 || entry.processingVersion !== metadata.processingVersion)) throw new Error('recording import ID already belongs to different provenance')

    let attached = false
    try {
      try { this.database.prepare('ATTACH DATABASE ? AS staged').run(stagingRealPath) } catch { throw new Error('staged telemetry database could not be opened') }
      attached = true
      const result = this.transaction(() => this.mergeAttachedStaging(metadata))
      this.writes += Math.max(1, result.importedLaps)
      return result
    } finally {
      if (attached) {
        try { this.database.exec('DETACH DATABASE staged') } catch (error) { this.log('warn', 'staging-detach-failed', 'A closed staging database could not be detached after import.', { error: error instanceof Error ? error.message : String(error), importId: metadata.id }) }
      }
    }
  }

  validateAttachedSchema() {
    const integrity = this.database.prepare('PRAGMA staged.integrity_check').all()
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('staged telemetry database integrity check failed')
    if (this.database.prepare('PRAGMA staged.foreign_key_check').all().length) throw new Error('staged telemetry database foreign keys are invalid')
    const version = Number(this.database.prepare('PRAGMA staged.user_version').get().user_version)
    if (version !== SCHEMA_VERSION) throw new Error('staged telemetry database schema version is unsupported')
    const migrations = this.database.prepare('SELECT version,name,checksum FROM staged.schema_migrations ORDER BY version').all()
    if (!migrationHistoryMatches(migrations)) throw new Error('staged telemetry migration checksum does not match this build')
    for (const [table, expectedColumns] of Object.entries(REQUIRED_STAGING_COLUMNS)) {
      const actualColumns = this.database.prepare(`PRAGMA staged.table_info(${table})`).all().map((column) => column.name)
      if (actualColumns.length !== expectedColumns.length || actualColumns.some((column, index) => column !== expectedColumns[index])) throw new Error(`staged telemetry schema differs for ${table}`)
      const expectedSql = this.database.prepare("SELECT sql FROM main.sqlite_schema WHERE type='table' AND name=?").get(table)?.sql
      const actualSql = this.database.prepare("SELECT sql FROM staged.sqlite_schema WHERE type='table' AND name=?").get(table)?.sql
      if (!expectedSql || actualSql !== expectedSql) throw new Error(`staged telemetry schema definition differs for ${table}`)
    }
    const metadata = new Map(this.database.prepare('SELECT key,value FROM staged.app_metadata').all().map((row) => [row.key, row.value]))
    if (metadata.get('schema_version') !== String(SCHEMA_VERSION) || metadata.get('payload_format') !== PAYLOAD_FORMAT || metadata.get('track_model_algorithm') !== TRACK_MODEL_ALGORITHM || metadata.get('quality_policy_version') !== QUALITY_POLICY_VERSION) throw new Error('staged telemetry metadata does not match this build')
    if (Number(this.database.prepare('SELECT COUNT(*) AS count FROM staged.recording_imports').get().count) !== 0
      || Number(this.database.prepare('SELECT COUNT(*) AS count FROM staged.recording_import_sessions').get().count) !== 0) throw new Error('an import staging database cannot contain prior recording provenance')
  }

  validateAttachedRows() {
    const sessions = this.database.prepare('SELECT * FROM staged.sessions ORDER BY id').all()
    const laps = this.database.prepare('SELECT * FROM staged.laps ORDER BY id').all()
    const payloadCount = Number(this.database.prepare('SELECT COUNT(*) AS count FROM staged.lap_payloads').get().count)
    if (!sessions.length || !laps.length) throw new Error('staged telemetry database contains no finalized lap history')
    if (payloadCount !== laps.length) throw new Error('staged telemetry lap and payload counts differ')
    if (Number(this.database.prepare('SELECT COUNT(*) AS count FROM staged.sessions s LEFT JOIN staged.laps l ON l.session_id=s.id WHERE l.id IS NULL').get().count) !== 0) throw new Error('staged telemetry contains a session without laps')
    const trackIdentities = new Map()
    for (const session of sessions) {
      if (session.source !== 'recording-replay') throw new Error('staged telemetry contains a non-recording session')
      if (typeof session.id !== 'string' || !session.id || typeof session.track_key !== 'string' || !session.track_key || typeof session.car_key !== 'string' || !session.car_key
        || !validIsoDate(session.started_at) || !validIsoDate(session.updated_at) || (session.ended_at !== null && !validIsoDate(session.ended_at))
        || typeof session.track_name !== 'string' || !session.track_name || typeof session.layout_name !== 'string' || typeof session.car_name !== 'string' || typeof session.car_class !== 'string'
        || !finite(Number(session.track_length_m)) || Number(session.track_length_m) <= 0 || !Number.isSafeInteger(Number(session.car_id))
        || !Number.isSafeInteger(Number(session.interruption_count)) || Number(session.interruption_count) < 0
        || !validQualityPolicyVersion(session.quality_policy_version)
        || session.car_key !== carKey({ name: session.car_name, class: session.car_class })) throw new Error('staged telemetry contains invalid session content')
      const trackIdentity = JSON.stringify([session.track_name, session.layout_name, Number(session.track_length_m)])
      if (trackIdentities.has(session.track_key) && trackIdentities.get(session.track_key) !== trackIdentity) throw new Error('staged telemetry reuses a track key for different track content')
      trackIdentities.set(session.track_key, trackIdentity)
    }
    for (const lap of laps) {
      if (typeof lap.id !== 'string' || !lap.id || typeof lap.session_id !== 'string' || !lap.session_id
        || !Number.isSafeInteger(Number(lap.lap_number)) || Number(lap.lap_number) < 1 || !['complete', 'incomplete'].includes(lap.state)
        || !validIsoDate(lap.started_at) || (lap.ended_at !== null && !validIsoDate(lap.ended_at)) || !validIsoDate(lap.created_at)
        || (lap.lap_time_ms !== null && (!finite(Number(lap.lap_time_ms)) || Number(lap.lap_time_ms) <= 0))
        || !['clean', 'limited', 'ineligible'].includes(lap.quality) || !finite(Number(lap.coverage)) || Number(lap.coverage) < 0 || Number(lap.coverage) > 1
        || !finite(Number(lap.maximum_gap_m)) || Number(lap.maximum_gap_m) < 0 || !Number.isSafeInteger(Number(lap.sample_count)) || Number(lap.sample_count) < 0
        || ![0, 1].includes(Number(lap.replayable)) || ![0, 1].includes(Number(lap.reference_eligible)) || ![0, 1].includes(Number(lap.track_model_eligible))
        || !['official', 'unavailable'].includes(lap.timing_source)
        || (lap.timing_source === 'official' && (lap.state !== 'complete' || lap.lap_time_ms === null))
        || (lap.timing_source === 'unavailable' && (lap.lap_time_ms !== null || Number(lap.reference_eligible) !== 0 || Number(lap.track_model_eligible) !== 0))
        || !/^[a-f0-9]{64}$/.test(lap.payload_hash)) throw new Error('staged telemetry contains invalid lap content')
    }

    const payloadRows = this.database.prepare(`SELECT l.id,l.session_id AS sessionId,l.lap_number AS lapNumber,l.state,l.started_at AS startedAt,l.ended_at AS endedAt,l.lap_time_ms AS lapTimeMs,l.timing_source AS timingSource,l.quality,l.reasons_json AS reasonsJson,l.coverage,l.maximum_gap_m AS maximumGapM,l.sample_count AS sampleCount,l.replayable,l.reference_eligible AS referenceEligible,l.track_model_eligible AS trackModelEligible,l.payload_hash AS payloadHash,
      p.format,p.compressed,p.uncompressed_bytes AS uncompressedBytes,p.crc32,s.track_name AS trackName,s.layout_name AS layoutName,s.track_length_m AS trackLengthM,s.car_name AS carName,s.car_class AS carClass
      FROM staged.laps l JOIN staged.sessions s ON s.id=l.session_id JOIN staged.lap_payloads p ON p.lap_id=l.id ORDER BY l.id`)
    let validatedPayloads = 0
    for (const row of payloadRows.iterate()) {
      if (!(row.compressed instanceof Uint8Array) || !Number.isSafeInteger(Number(row.uncompressedBytes)) || Number(row.uncompressedBytes) <= 0 || Number(row.uncompressedBytes) > 256 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(row.payloadHash)) throw new Error('staged telemetry contains invalid payload metadata')
      let decoded
      try { decoded = this.decodePayloadRow(row).value } catch (error) { throw new Error(`staged telemetry payload failed validation: ${error.message}`) }
      if (!decodedPayloadMatchesRow(decoded, row)) throw new Error('staged telemetry payload does not match its lap metadata')
      validatedPayloads += 1
    }
    if (validatedPayloads !== laps.length) throw new Error('staged telemetry payload validation count differs')
    return { sessions, laps }
  }

  validateAttachedCollisions(sessions, laps) {
    const mainSession = this.database.prepare('SELECT * FROM main.sessions WHERE id=?')
    for (const session of sessions) {
      const existing = mainSession.get(session.id)
      if (existing && (existing.source !== 'imported-recording' || !sameColumns(existing, session, SESSION_CONTENT_COLUMNS))) throw new Error('session ID already exists with different content')
    }
    const mainLap = this.database.prepare('SELECT * FROM main.laps WHERE id=?')
    for (const lap of laps) {
      const existing = mainLap.get(lap.id)
      if (!existing) continue
      if (!sameColumns(existing, lap, LAP_CONTENT_COLUMNS)) throw new Error('lap ID already exists with different content')
      // Matching lap metadata includes the canonical payload hash. The staged
      // payload was fully decoded above, so merge may safely repair a missing
      // or corrupt local payload for this exact content identity.
    }
  }

  validateAttachedRetentionCapacity(sessionCount) {
    const payloadBytes = Number(this.database.prepare('SELECT COALESCE(SUM(length(compressed)),0) AS bytes FROM staged.lap_payloads').get().bytes)
    if (sessionCount > this.maxSessions) throw new Error(`recording import has ${sessionCount} sessions and exceeds the local history limit of ${this.maxSessions}`)
    if (payloadBytes > this.maxBytes) throw new Error(`recording import has ${payloadBytes} payload bytes and exceeds the local history limit of ${this.maxBytes}`)
  }

  verifyAttachedHistoryRetained(sessionCount, lapCount) {
    const retainedSessions = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM staged.sessions source
      JOIN main.sessions retained ON retained.id=source.id AND retained.source='imported-recording'`).get().count)
    const retainedLaps = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM staged.laps source
      JOIN main.laps retained ON retained.id=source.id AND retained.session_id=source.session_id
      JOIN main.lap_payloads payload ON payload.lap_id=retained.id`).get().count)
    if (retainedSessions !== sessionCount || retainedLaps !== lapCount) throw new Error('recording import could not be retained atomically within local history limits')
  }

  mergeAttachedStaging(metadata) {
    this.validateAttachedSchema()
    const { sessions, laps } = this.validateAttachedRows()
    this.validateAttachedCollisions(sessions, laps)
    this.validateAttachedRetentionCapacity(sessions.length)
    const trackLengths = new Map(sessions.map((session) => [session.track_key, Number(session.track_length_m)]))
    const protectedSessionIds = new Set(sessions.map((session) => session.id))

    // A provenance row can outlive some of its mapped history in a database
    // created by an older build. It is not a duplicate once incomplete, so
    // replace that exact stale identity inside the same all-or-nothing merge.
    this.database.prepare('DELETE FROM main.recording_imports WHERE id=? AND recording_sha256=? AND processing_version=?').run(metadata.id, metadata.recordingSha256, metadata.processingVersion)

    this.database.prepare(`INSERT OR IGNORE INTO main.sessions(id,track_key,car_key,source,started_at,updated_at,ended_at,track_name,layout_name,track_length_m,car_id,car_name,car_class,interruption_count,quality_policy_version)
      SELECT id,track_key,car_key,'imported-recording',started_at,updated_at,ended_at,track_name,layout_name,track_length_m,car_id,car_name,car_class,interruption_count,quality_policy_version FROM staged.sessions`).run()
    this.database.prepare(`INSERT OR IGNORE INTO main.laps(id,session_id,lap_number,state,started_at,ended_at,lap_time_ms,quality,reasons_json,coverage,maximum_gap_m,sample_count,replayable,reference_eligible,track_model_eligible,payload_hash,created_at,timing_source)
      SELECT id,session_id,lap_number,state,started_at,ended_at,lap_time_ms,quality,reasons_json,coverage,maximum_gap_m,sample_count,replayable,reference_eligible,track_model_eligible,payload_hash,COALESCE(ended_at,started_at),timing_source FROM staged.laps`).run()
    // Staging creation time is a processing wall clock, not recording truth.
    // Normalize imported ordering to the lap evidence even when repairing a
    // previously partial import; live write ordering remains unchanged.
    this.database.prepare(`UPDATE main.laps SET created_at=(SELECT COALESCE(source.ended_at,source.started_at) FROM staged.laps source WHERE source.id=main.laps.id)
      WHERE id IN (SELECT id FROM staged.laps)`).run()
    this.database.prepare(`INSERT OR REPLACE INTO main.lap_payloads(lap_id,format,compressed,uncompressed_bytes,crc32)
      SELECT lap_id,format,compressed,uncompressed_bytes,crc32 FROM staged.lap_payloads`).run()

    for (const [trackKey, trackLengthM] of trackLengths) this.rebuildTrackModelWithinTransaction(trackKey, trackLengthM)
    this.enforceRetentionWithinTransaction(protectedSessionIds)
    this.verifyAttachedHistoryRetained(sessions.length, laps.length)

    // Provenance is the final visibility boundary. If retention or any later
    // statement fails, the surrounding transaction rolls back the imported
    // history and every eviction together.
    this.database.prepare(`INSERT INTO main.recording_imports(id,recording_sha256,recording_format,processing_version,imported_at,app_version,session_count,lap_count)
      VALUES(?,?,?,?,?,?,?,?)`).run(metadata.id, metadata.recordingSha256, metadata.recordingFormat, metadata.processingVersion, metadata.importedAt, metadata.appVersion, sessions.length, laps.length)
    this.database.prepare(`INSERT INTO main.recording_import_sessions(import_id,session_id) SELECT ?,id FROM staged.sessions`).run(metadata.id)
    const sessionIds = this.database.prepare(`SELECT source.id AS sessionId FROM staged.sessions source
      JOIN main.sessions retained ON retained.id=source.id ORDER BY source.started_at DESC,source.id`).all().map((row) => row.sessionId)
    return {
      imported: true,
      duplicate: false,
      ...metadata,
      sessionCount: sessions.length,
      lapCount: laps.length,
      sessionIds,
      sessions: sessions.length,
      laps: laps.length,
      importedSessions: sessions.length,
      importedLaps: laps.length,
      affectedTrackKeys: [...trackLengths.keys()].sort(),
    }
  }

  rowLapSummary(row) {
    const timingSource = validTimingSource(row.timingSource) ? row.timingSource : 'legacy-unknown'
    const lapTimeMs = timingSource === 'official' && row.lapTimeMs !== null ? Number(row.lapTimeMs) : null
    return { id: row.id, number: Number(row.lapNumber), state: row.state, quality: row.quality, reasons: JSON.parse(row.reasonsJson), lapTimeMs, timingSource, coverage: Number(row.coverage), maximumGapM: Number(row.maximumGapM), sampleCount: Number(row.sampleCount), samplesAvailable: Boolean(row.samplesAvailable), replayable: Boolean(row.replayable), referenceEligible: timingSource === 'official' && Boolean(row.referenceEligible), trackModelEligible: timingSource === 'official' && Boolean(row.trackModelEligible), payloadHash: row.payloadHash }
  }

  listSessions() {
    if (this.closed || this.futureSchema) return []
    const sessions = this.database.prepare('SELECT * FROM sessions ORDER BY started_at DESC,id').all()
    const lapQuery = this.database.prepare(`SELECT id,lap_number AS lapNumber,state,quality,reasons_json AS reasonsJson,lap_time_ms AS lapTimeMs,timing_source AS timingSource,coverage,maximum_gap_m AS maximumGapM,sample_count AS sampleCount,replayable,reference_eligible AS referenceEligible,track_model_eligible AS trackModelEligible,payload_hash AS payloadHash,
      EXISTS(SELECT 1 FROM lap_payloads available_payload WHERE available_payload.lap_id=laps.id) AS samplesAvailable
      FROM laps WHERE session_id=? ORDER BY lap_number,id`)
    const importQuery = this.database.prepare(`SELECT ri.id,ri.recording_sha256 AS recordingSha256,ri.recording_format AS recordingFormat,ri.processing_version AS processingVersion,ri.imported_at AS importedAt,ri.app_version AS appVersion,ri.session_count AS sessionCount,ri.lap_count AS lapCount,
      (SELECT COUNT(*) FROM recording_import_sessions counted_sessions WHERE counted_sessions.import_id=ri.id) AS actualSessionCount,
      (SELECT COUNT(*) FROM recording_import_sessions counted_sessions JOIN laps counted_laps ON counted_laps.session_id=counted_sessions.session_id JOIN lap_payloads counted_payloads ON counted_payloads.lap_id=counted_laps.id WHERE counted_sessions.import_id=ri.id) AS actualLapCount
      FROM recording_import_sessions ris JOIN recording_imports ri ON ri.id=ris.import_id WHERE ris.session_id=? ORDER BY ri.imported_at,ri.id LIMIT 1`)
    return sessions.map((session) => {
      const summary = {
        schemaVersion: 1, qualityPolicyVersion: session.quality_policy_version, revision: this.writes, id: session.id, source: session.source, state: 'finished', startedAt: session.started_at, endedAt: session.ended_at,
        track: { name: session.track_name, layout: session.layout_name, lengthM: Number(session.track_length_m) }, car: { id: Number(session.car_id), name: session.car_name, class: session.car_class },
        laps: lapQuery.all(session.id).map((lap) => this.rowLapSummary(lap)), currentLapId: null, interruptionCount: Number(session.interruption_count), sourceSegmentCount: 1,
      }
      if (session.source === 'imported-recording') {
        const provenance = this.importProvenance(importQuery.get(session.id))
        if (provenance) summary.importProvenance = provenance
      }
      return summary
    })
  }

  lapRow(sessionId, lapId) {
    return this.database.prepare(`SELECT l.*,l.lap_number AS lapNumber,l.reasons_json AS reasonsJson,l.lap_time_ms AS lapTimeMs,l.timing_source AS timingSource,l.maximum_gap_m AS maximumGapM,l.sample_count AS sampleCount,l.reference_eligible AS referenceEligible,l.track_model_eligible AS trackModelEligible,l.payload_hash AS payloadHash,1 AS samplesAvailable,
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
    const pb = this.database.prepare(`SELECT l.id,l.session_id AS sessionId FROM laps l JOIN sessions s ON s.id=l.session_id WHERE s.track_key=? AND s.car_key=? AND l.timing_source='official' AND l.reference_eligible=1 AND l.lap_time_ms IS NOT NULL ORDER BY l.lap_time_ms,l.created_at,l.id LIMIT 1`).get(row.trackKey, row.carKey)
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
