const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const { LiveSessionStore } = require('./live-session-store.cjs')
const { TelemetryDatabase } = require('./telemetry-database.cjs')
const { redactSensitiveText } = require('./privacy-redaction.cjs')

const PROCESSING_VERSION = 'apexrec-analysis-v3'
const RECORDING_FORMAT = 'apex-lmu-raw-v1'
const MAX_RECORDING_BYTES = 8 * 1024 * 1024 * 1024
const HASH_PROGRESS_BYTES = 64 * 1024 * 1024
const STAGING_WRITE_HIGH_WATER = 4
const STAGING_WRITE_LOW_WATER = 2
const STAGING_WRITE_HARD_LIMIT = 8
const MAX_IMPORT_LAPS = 2048

const initialState = Object.freeze({
  schemaVersion: 1,
  status: 'idle',
  fileName: null,
  bytesProcessed: 0,
  bytesTotal: 0,
  frames: 0,
  sessions: 0,
  laps: 0,
  importedSessions: 0,
  importedLaps: 0,
  duplicate: false,
  sessionIds: [],
  reason: null,
})

class RecordingImportError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RecordingImportError'
    this.code = code
  }
}

function safeError(error, sensitivePaths = []) {
  return redactSensitiveText(error instanceof Error ? error.message : error, sensitivePaths)
}

function stableImportIdentity(recordingSha256) {
  const digest = crypto.createHash('sha256').update(`${PROCESSING_VERSION}|${recordingSha256}`).digest('hex').slice(0, 32)
  return { importId: `recording-import-${digest}`, runId: `analysis-import-${digest}` }
}

function sameFileIdentity(left, right) {
  return left.size === right.size && left.mtimeMs === right.mtimeMs
}

async function privateDirectoryMode(target) {
  try { await fs.chmod(target, 0o700) }
  catch (error) { if (process.platform !== 'win32') throw error }
}

class RecordingImportService {
  constructor({
    userDataPath,
    appVersion,
    database,
    bridgeManager,
    logger = null,
    broadcast = () => {},
    onCommitted = () => {},
    openDatabase = TelemetryDatabase.open,
    createSessionStore = (options) => new LiveSessionStore(options),
    createReadStream = fsSync.createReadStream,
    now = () => new Date(),
  }) {
    if (!path.isAbsolute(userDataPath)) throw new Error('Recording import requires an absolute user-data path')
    if (!Number.isSafeInteger(database?.maxSessions) || database.maxSessions < 1) throw new Error('Recording import requires the destination session limit')
    if (!Number.isSafeInteger(database?.maxBytes) || database.maxBytes < 1) throw new Error('Recording import requires the destination payload-byte limit')
    this.userDataPath = userDataPath
    this.appVersion = appVersion
    this.database = database
    this.bridgeManager = bridgeManager
    this.logger = logger
    this.broadcast = broadcast
    this.onCommitted = onCommitted
    this.openDatabase = openDatabase
    this.createSessionStore = createSessionStore
    this.createReadStream = createReadStream
    this.now = now
    // Import bounds must agree with the atomic destination transaction. Using
    // the destination's limits avoids a second, drifting retention policy.
    this.maximumImportSessions = database.maxSessions
    this.maximumStagedPayloadBytes = database.maxBytes
    this.maximumImportLaps = MAX_IMPORT_LAPS
    this.stagingDirectory = path.join(userDataPath, 'data', 'recording-import-staging')
    this.state = { ...initialState, sessionIds: [] }
    this.active = null
    this.operation = 0
  }

  async initialize() {
    await fs.mkdir(this.stagingDirectory, { recursive: true, mode: 0o700 })
    // mkdir's mode is ignored when the directory already exists. Repair it on
    // every startup so an old or manually created directory cannot weaken the
    // private staging boundary.
    // On Windows, privacy comes from the user's profile ACL; chmod only maps
    // the write bit and is not consistently supported by every filesystem.
    await privateDirectoryMode(this.stagingDirectory)
    const entries = await fs.readdir(this.stagingDirectory, { withFileTypes: true })
    await Promise.all(entries
      .filter((entry) => entry.isFile() && /^analysis-import-[a-f0-9]{32}(?:-\d+)?\.sqlite3(?:-(?:wal|shm|journal))?$/.test(entry.name))
      .map((entry) => fs.rm(path.join(this.stagingDirectory, entry.name), { force: true })))
    return this.getState()
  }

  getState() {
    return { ...this.state, sessionIds: [...this.state.sessionIds] }
  }

  owns(message) {
    return Boolean(this.active?.runId && message?.source === 'recording-replay' && message.runId === this.active.runId)
  }

  ingest(message) {
    const active = this.active
    if (!active?.store || !this.owns(message)) return false
    if (active.cancelRequested || active.finalizing || active.ingestError) return true
    try {
      active.store.ingest(message)
      if (message.type === 'telemetry') {
        active.frames += 1
        if (active.frames === 1 || active.frames % 500 === 0) {
          const progress = active.store.getProgress()
          this.setState({ frames: active.frames, sessions: progress.sessions, laps: progress.laps })
        }
      }
      return true
    } catch (error) {
      active.ingestError ||= safeError(error, [active.filePath])
      active.ingestErrorCode ||= 'ingest-failed'
      this.record('error', 'ingest-failed', 'An imported recording frame could not enter the session accumulator.', { importId: active.importId, error: active.ingestError })
      this.bridgeManager.stopReplay()
      return true
    }
  }

  async start(filePath) {
    if (this.active) return { ok: false, reason: 'busy', state: this.getState() }
    const token = ++this.operation
    const active = {
      token, filePath: null, fileIdentity: null, fileName: null, cancelRequested: false,
      ownershipId: `analysis-import-operation-${token}`, ownsBridge: false, runId: null, importId: null,
      recordingSha256: null, stagingPath: null, database: null, store: null, frames: 0, ingestError: null, ingestErrorCode: null,
      pendingWrites: new Set(), peakPendingWrites: 0, backpressurePaused: false,
      finalizedSessions: 0, finalizedLaps: 0, stagedPayloadBytes: 0,
      finalizing: false, finalizationPromise: null,
    }
    this.active = active
    // A new explicit operation must not inherit a previous recording's
    // basename, counts, duplicate flag, or committed session IDs while
    // validation/ownership is still pending or when preflight fails.
    this.setState({ ...initialState, status: 'idle', sessionIds: [] })
    try {
      if (!this.database) throw new RecordingImportError('storage-unavailable', 'Local analysis storage is unavailable.')
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.apexrec') throw new RecordingImportError('invalid-file', 'Choose an Apex raw recording (.apexrec).')
      active.filePath = filePath
      active.fileName = path.basename(filePath)
      const ownership = this.bridgeManager.acquireReplayOwnership?.(active.ownershipId, { privateReplay: true })
      if (!ownership?.ok) throw new RecordingImportError(ownership?.reason || 'bridge-unavailable', 'The recording decoder is unavailable or busy.')
      active.ownsBridge = true
      this.setState({ ...initialState, status: 'hashing', fileName: active.fileName, sessionIds: [] })
      const before = await fs.stat(filePath)
      if (!before.isFile() || before.size <= 0) throw new RecordingImportError('invalid-file', 'The selected recording is not a non-empty regular file.')
      if (before.size > MAX_RECORDING_BYTES) throw new RecordingImportError('file-too-large', 'The selected recording exceeds the 8 GiB safety limit.')
      active.fileIdentity = { size: before.size, mtimeMs: before.mtimeMs }
      this.setState({ bytesTotal: before.size })

      const recordingSha256 = await this.hashFile(active)
      const afterHash = await fs.stat(filePath)
      if (!sameFileIdentity(active.fileIdentity, { size: afterHash.size, mtimeMs: afterHash.mtimeMs })) throw new RecordingImportError('file-changed', 'The recording changed while it was being checked.')
      this.throwIfCancelled(active)
      active.recordingSha256 = recordingSha256
      const identity = stableImportIdentity(recordingSha256)
      active.importId = identity.importId
      active.runId = identity.runId

      await this.database.flush?.()
      const existing = this.database.findRecordingImport?.(recordingSha256, PROCESSING_VERSION) ?? null
      if (existing) {
        this.active = null
        this.setState({
          status: 'complete',
          fileName: active.fileName,
          bytesProcessed: before.size,
          bytesTotal: before.size,
          frames: 0,
          sessions: existing.sessionCount,
          laps: existing.lapCount,
          importedSessions: 0,
          importedLaps: 0,
          duplicate: true,
          sessionIds: existing.sessionIds ?? [],
          reason: 'already-imported',
        })
        this.releaseBridgeOwnership(active)
        return { ok: true, duplicate: true, state: this.getState() }
      }

      active.stagingPath = path.join(this.stagingDirectory, `${active.runId}-${process.pid}.sqlite3`)
      await this.removeStagingFiles(active.stagingPath)
      active.database = await this.openDatabase({
        userDataPath: this.userDataPath,
        databasePath: active.stagingPath,
        appVersion: this.appVersion,
        logger: this.logger,
        persistReplay: true,
        deferPerLapTrackModels: true,
        maxSessions: Number.MAX_SAFE_INTEGER,
        maxBytes: Number.MAX_SAFE_INTEGER,
      })
      active.store = this.createSessionStore({
        logger: this.logger,
        onLapFinalized: (event) => this.trackStagingWrite(active, 'lap', () => active.database.enqueueFinalized(event)),
        onSessionFinalized: (session) => this.stageFinalizedSession(active, session),
      })
      this.throwIfCancelled(active)
      this.setState({ status: 'importing', frames: 0, sessions: 0, laps: 0, reason: null })
      const started = this.bridgeManager.startReplay(filePath, { speed: 0, strict: true, runId: active.runId, reportRecordingState: false, ownershipId: active.ownershipId })
      if (!started?.ok) throw new RecordingImportError(started?.reason || 'bridge-unavailable', 'The recording decoder could not start.')
      this.record('info', 'started', 'Private recording import started.', { importId: active.importId, bytes: before.size, processingVersion: PROCESSING_VERSION })
      return { ok: true, runId: active.runId, state: this.getState() }
    } catch (error) {
      const cancelled = error instanceof RecordingImportError && error.code === 'cancelled'
      await this.discard(active)
      this.setState({ ...initialState, status: cancelled ? 'cancelled' : 'error', reason: cancelled ? 'cancelled' : error.code || 'import-failed', sessionIds: [] })
      this.releaseBridgeOwnership(active)
      this.record(cancelled ? 'info' : 'error', cancelled ? 'cancelled' : 'start-failed', cancelled ? 'Private recording import was cancelled.' : 'Private recording import could not start.', { error: safeError(error, [active.filePath]) })
      return { ok: false, reason: cancelled ? 'cancelled' : error.code || 'import-failed', state: this.getState() }
    }
  }

  async hashFile(active, { reportProgress = true } = {}) {
    const hash = crypto.createHash('sha256')
    const expectedBytes = active.fileIdentity.size
    // createReadStream's end is inclusive: expectedBytes probes exactly one
    // byte beyond the selected identity without following a growing file.
    const stream = this.createReadStream(active.filePath, { highWaterMark: 1024 * 1024, end: expectedBytes })
    let bytes = 0
    let lastProgress = 0
    try {
      for await (const chunk of stream) {
        this.throwIfCancelled(active)
        if (bytes + chunk.length > expectedBytes) throw new RecordingImportError('file-changed', 'The recording grew while it was being checked.')
        hash.update(chunk)
        bytes += chunk.length
        if (reportProgress && (bytes - lastProgress >= HASH_PROGRESS_BYTES || bytes === active.fileIdentity.size)) {
          lastProgress = bytes
          this.setState({ bytesProcessed: bytes })
        }
      }
    } catch (error) {
      stream.destroy()
      throw error
    }
    if (bytes !== expectedBytes) throw new RecordingImportError('file-changed', 'The recording size changed while it was being checked.')
    return hash.digest('hex')
  }

  countFinalizedUnit(active, kind) {
    if (kind === 'lap') active.finalizedLaps += 1
    if (kind === 'session') active.finalizedSessions += 1
    if (active.finalizedLaps > this.maximumImportLaps || active.finalizedSessions > this.maximumImportSessions) {
      const error = new RecordingImportError('import-limit', 'The recording contains more sessions or laps than the private import safety limit.')
      this.recordStagingWriteFailure(active, 'import-limit', error)
      return error
    }
    return null
  }

  trackStagingWrite(active, kind, enqueue, { countFinalized = true } = {}) {
    const limitError = countFinalized ? this.countFinalizedUnit(active, kind) : null
    if (limitError) return Promise.reject(limitError)
    if (active.pendingWrites.size >= STAGING_WRITE_HARD_LIMIT) {
      const error = new RecordingImportError('import-limit', 'The private staging write backlog exceeded its hard safety limit.')
      this.recordStagingWriteFailure(active, 'backpressure-limit', error)
      return Promise.reject(error)
    }
    let pending
    try {
      pending = Promise.resolve(enqueue())
    } catch (error) {
      this.recordStagingWriteFailure(active, kind, error)
      return Promise.reject(error)
    }
    active.pendingWrites.add(pending)
    active.peakPendingWrites = Math.max(active.peakPendingWrites, active.pendingWrites.size)
    this.pauseForStagingBacklog(active)
    pending.then(
      (result) => {
        this.recordStagingWriteResult(active, kind, result)
        this.settleStagingWrite(active, pending)
      },
      (error) => {
        this.recordStagingWriteFailure(active, kind, error)
        this.settleStagingWrite(active, pending)
      },
    )
    return pending
  }

  stageFinalizedSession(active, session) {
    // Scoring can identify a session before LMU exposes a player vehicle. If
    // that transient segment ends first, the accumulator truthfully has no lap
    // and therefore no database row to finalize. Ignore only this explicit
    // empty shape; a non-empty session that the database cannot find remains a
    // staging failure through trackStagingWrite.
    // Count every observed finalized segment before the persistence decision.
    // Otherwise a crafted stream of scoring-only boundaries could grow the
    // accumulator's session ledger without approaching a durable-row limit.
    const limitError = this.countFinalizedUnit(active, 'session')
    if (limitError) return Promise.reject(limitError)
    if (Array.isArray(session?.laps) && session.laps.length === 0) {
      this.record('info', 'empty-session-skipped', 'A scoring-only recording segment ended without durable lap evidence.', { importId: active.importId })
      return Promise.resolve({ written: false, reason: 'empty-session' })
    }
    return this.trackStagingWrite(active, 'session', () => active.database.enqueueSessionFinalized(session), { countFinalized: false })
  }

  recordStagingWriteResult(active, kind, result) {
    if (result?.written !== true) {
      if (result?.duplicate === true) return
      if (!active.ingestError) this.recordStagingWriteFailure(active, kind, new Error(`Private staging rejected a ${kind} write (${result?.reason || 'unknown reason'}).`))
      return
    }
    if (kind !== 'lap') return
    if (!Number.isSafeInteger(result.bytes) || result.bytes < 1) {
      if (!active.ingestError) this.recordStagingWriteFailure(active, kind, new Error('Private staging did not report a valid compressed lap payload size.'))
      return
    }
    active.stagedPayloadBytes += result.bytes
    if (!active.ingestError && active.stagedPayloadBytes > this.maximumStagedPayloadBytes) {
      this.recordStagingWriteFailure(active, 'payload-limit', new RecordingImportError(
        'import-limit',
        `The recording's staged lap payloads exceed the ${this.maximumStagedPayloadBytes}-byte local history limit.`,
      ))
    }
  }

  pauseForStagingBacklog(active) {
    if (active !== this.active || active.backpressurePaused || active.pendingWrites.size < STAGING_WRITE_HIGH_WATER || !active.runId) return
    let result
    try { result = this.bridgeManager.setReplayOutputPaused?.(active.ownershipId, active.runId, true) }
    catch (error) { this.recordStagingWriteFailure(active, 'flow-control', error); return }
    if (!result?.ok) {
      this.recordStagingWriteFailure(active, 'flow-control', new Error(`Replay output could not be paused (${result?.reason || 'unavailable'}).`))
      return
    }
    active.backpressurePaused = true
    this.record('info', 'decoder-paused', 'Private recording decoder paused for bounded staging writes.', { importId: active.importId, pendingWrites: active.pendingWrites.size })
  }

  settleStagingWrite(active, pending) {
    active.pendingWrites.delete(pending)
    if (
      !active.backpressurePaused
      || active.pendingWrites.size > STAGING_WRITE_LOW_WATER
      || active !== this.active
      || active.cancelRequested
      || active.finalizing
      || active.ingestError
    ) return
    let result
    try { result = this.bridgeManager.setReplayOutputPaused?.(active.ownershipId, active.runId, false) }
    catch (error) { this.recordStagingWriteFailure(active, 'flow-control', error); return }
    if (!result?.ok) {
      this.recordStagingWriteFailure(active, 'flow-control', new Error(`Replay output could not be resumed (${result?.reason || 'unavailable'}).`))
      return
    }
    active.backpressurePaused = false
    this.record('info', 'decoder-resumed', 'Private recording decoder resumed after staging writes drained.', { importId: active.importId, pendingWrites: active.pendingWrites.size })
  }

  recordStagingWriteFailure(active, kind, error) {
    if (active.ingestError) return
    active.ingestError = safeError(error, [active.filePath])
    active.ingestErrorCode = error instanceof RecordingImportError && error.code === 'import-limit' ? 'import-limit' : 'ingest-failed'
    this.record('error', 'staging-write-failed', 'A private recording staging write failed; the import will be discarded.', { importId: active.importId, kind, error: active.ingestError })
    if (active === this.active && !active.cancelRequested && !active.finalizing) {
      try { this.bridgeManager.stopReplay() }
      catch (stopError) { this.record('warning', 'bridge-stop-failed', 'A failed private import could not stop its decoder cleanly.', { error: safeError(stopError, [active.filePath]) }) }
    }
  }

  async awaitStagingWrites(active) {
    while (active.pendingWrites.size > 0) {
      await Promise.allSettled([...active.pendingWrites])
    }
  }

  throwIfCancelled(active) {
    if (active !== this.active || active.cancelRequested) throw new RecordingImportError('cancelled', 'Recording import cancelled.')
  }

  stop() {
    const active = this.active
    if (!active) return { ok: false, reason: 'not-importing' }
    if (active.finalizing) return { ok: false, reason: 'finalizing' }
    active.cancelRequested = true
    this.setState({ status: 'cancelling', reason: null })
    if (active.runId) this.bridgeManager.stopReplay()
    return { ok: true }
  }

  async handleReplayFinished(result) {
    const active = this.active
    if (!active?.runId || result?.runId !== active.runId || active.finalizing) return false
    active.finalizing = true
    active.finalizationPromise = this.finalizeReplay(active, result)
    try { await active.finalizationPromise }
    finally {
      active.finalizationPromise = null
      this.releaseBridgeOwnership(active)
    }
    return true
  }

  async finalizeReplay(active, result) {
    const cancelled = active.cancelRequested
    if (cancelled || !result.complete || active.ingestError) {
      await this.discard(active)
      this.setState({ status: cancelled ? 'cancelled' : 'error', reason: cancelled ? 'cancelled' : active.ingestError ? active.ingestErrorCode || 'ingest-failed' : 'strict-replay-failed' })
      this.record(cancelled ? 'info' : 'error', cancelled ? 'cancelled' : 'replay-failed', cancelled ? 'Private recording import was cancelled.' : 'Strict recording replay did not complete; staged analysis was discarded.', { importId: active.importId, frames: active.frames, error: active.ingestError || 'strict-decoder-incomplete' })
      return
    }

    await this.awaitStagingWrites(active)
    if (active.ingestError) {
      await this.discard(active)
      this.setState({ status: 'error', reason: active.ingestErrorCode || 'ingest-failed' })
      this.record('error', 'replay-failed', 'A staging write failed after replay completion; staged analysis was discarded.', { importId: active.importId, frames: active.frames, error: active.ingestError })
      return
    }

    this.setState({ status: 'committing', frames: active.frames, reason: null })
    let committed
    try {
      if (result.recordingSha256 !== active.recordingSha256) {
        throw new RecordingImportError('file-changed', 'The decoder did not prove it read the selected recording bytes.')
      }
      const afterReplay = await fs.stat(active.filePath)
      if (!sameFileIdentity(active.fileIdentity, { size: afterReplay.size, mtimeMs: afterReplay.mtimeMs })) throw new RecordingImportError('file-changed', 'The recording changed while it was being imported.')

      // The bridge hash above proves which opened stream was actually decoded.
      // Size and mtime are only quick path-identity checks; re-read the source
      // as a second boundary check that the selected path still names those
      // same bytes immediately before the atomic commit.
      let verifiedSha256
      try {
        verifiedSha256 = await this.hashFile(active, { reportProgress: false })
      } catch (error) {
        if (error instanceof RecordingImportError) throw error
        throw new RecordingImportError('file-changed', 'The recording could not be verified after replay.')
      }
      const afterVerification = await fs.stat(active.filePath)
      if (
        verifiedSha256 !== active.recordingSha256
        || !sameFileIdentity(active.fileIdentity, { size: afterVerification.size, mtimeMs: afterVerification.mtimeMs })
      ) throw new RecordingImportError('file-changed', 'The recording changed while it was being imported.')

      await active.database.close({ requireDurable: true })
      active.database = null
      const importedAt = this.now().toISOString()
      committed = await this.database.importStaged(active.stagingPath, {
        id: active.importId,
        recordingSha256: active.recordingSha256,
        recordingFormat: RECORDING_FORMAT,
        processingVersion: PROCESSING_VERSION,
        importedAt,
        appVersion: this.appVersion,
      })
      const imported = committed?.imported === true && committed?.duplicate === false
      const duplicate = committed?.imported === false && committed?.duplicate === true
      if (!imported && !duplicate) {
        const storageUnavailable = committed?.reason === 'future-schema' || committed?.reason === 'unavailable'
        throw new RecordingImportError(
          storageUnavailable ? 'storage-unavailable' : 'commit-failed',
          'Local analysis storage did not commit the verified recording import.',
        )
      }
    } catch (error) {
      await this.discard(active)
      this.setState({ status: 'error', reason: error.code || 'commit-failed' })
      this.record('error', 'commit-failed', 'Private recording import could not be committed; staged analysis was discarded.', { importId: active.importId, frames: active.frames, error: safeError(error, [active.filePath]) })
      return
    }

    // An accepted importStaged result is the atomic visibility point. Cleanup
    // and UI notification failures after this line must never misreport a
    // committed import (or a verified duplicate) as rolled back.
    if (this.active === active) this.active = null
    try { await this.removeStagingFiles(active.stagingPath) } catch (error) { this.record('warning', 'staging-cleanup-failed', 'Committed recording import staging will be removed on next startup.', { importId: active.importId, error: safeError(error) }) }
    let existing = null
    try { existing = this.database.findRecordingImport?.(active.recordingSha256, PROCESSING_VERSION) ?? null } catch (error) { this.record('warning', 'provenance-read-failed', 'Committed recording provenance could not be reread for the completion notice.', { importId: active.importId, error: safeError(error) }) }
    const sessionIds = committed.sessionIds ?? existing?.sessionIds ?? []
    const sessions = Number(committed.sessionCount ?? committed.sessions ?? existing?.sessionCount ?? sessionIds.length)
    const laps = Number(committed.lapCount ?? committed.laps ?? existing?.lapCount ?? 0)
    const importedSessions = Number(committed.importedSessions ?? (committed.imported ? sessions : 0))
    const importedLaps = Number(committed.importedLaps ?? (committed.imported ? laps : 0))
    this.setState({
      status: 'complete',
      frames: active.frames,
      sessions,
      laps,
      importedSessions,
      importedLaps,
      duplicate: Boolean(committed.duplicate),
      sessionIds,
      reason: committed.duplicate ? 'already-imported' : null,
    })
    this.record('info', 'committed', 'Private recording import committed.', { importId: active.importId, frames: active.frames, sessions, laps, duplicate: Boolean(committed.duplicate) })
    try { await this.onCommitted({ ...committed, sessionIds }) } catch (error) { this.record('error', 'notification-failed', 'Imported analysis committed but its refresh notification failed.', { importId: active.importId, error: safeError(error) }) }
  }

  async discard(active) {
    if (!active) return
    if (active.database) {
      try { await active.database.close() } catch (error) { this.record('warning', 'staging-close-failed', 'Recording import staging could not close cleanly.', { error: safeError(error) }) }
      active.database = null
    }
    if (active.stagingPath) {
      try { await this.removeStagingFiles(active.stagingPath) }
      catch (error) { this.record('warning', 'staging-cleanup-failed', 'Discarded recording import staging will be removed on next startup.', { error: safeError(error) }) }
    }
    active.pendingWrites.clear()
    active.backpressurePaused = false
    if (this.active === active) this.active = null
  }

  async removeStagingFiles(databasePath) {
    await Promise.all([databasePath, `${databasePath}-wal`, `${databasePath}-shm`, `${databasePath}-journal`].map((candidate) => fs.rm(candidate, { force: true })))
  }

  releaseBridgeOwnership(active) {
    if (!active?.ownsBridge) return
    active.ownsBridge = false
    let released
    try { released = this.bridgeManager.releaseReplayOwnership?.(active.ownershipId) }
    catch (error) {
      this.record('warning', 'bridge-release-failed', 'Private recording import could not release decoder ownership cleanly.', { error: safeError(error, [active.filePath]) })
      return
    }
    if (released && released.ok === false && released.reason !== 'not-owned') {
      this.record('warning', 'bridge-release-failed', 'Private recording import could not release decoder ownership cleanly.', { reason: released.reason })
    }
  }

  async dispose() {
    const active = this.active
    if (!active) return
    if (active.finalizing && active.finalizationPromise) {
      await active.finalizationPromise
      return
    }
    active.cancelRequested = true
    if (active.runId) this.bridgeManager.stopReplay()
    await this.discard(active)
    this.releaseBridgeOwnership(active)
  }

  setState(patch) {
    this.state = { ...this.state, ...patch, sessionIds: patch.sessionIds ? [...patch.sessionIds] : this.state.sessionIds }
    try { this.broadcast(this.getState()) }
    catch (error) { this.record('warning', 'state-notification-failed', 'Recording import state could not be delivered to a renderer.', { error: safeError(error) }) }
  }

  record(level, event, message, details) {
    void this.logger?.record(level, 'recording-import', event, message, details)
  }
}

module.exports = {
  RecordingImportService, PROCESSING_VERSION, RECORDING_FORMAT, MAX_RECORDING_BYTES,
  STAGING_WRITE_HIGH_WATER, STAGING_WRITE_LOW_WATER, STAGING_WRITE_HARD_LIMIT,
  MAX_IMPORT_LAPS, stableImportIdentity,
}
