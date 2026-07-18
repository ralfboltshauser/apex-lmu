const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')
const { privateProtocolDiagnostic, redactProtocolDiagnostic, redactSensitiveText } = require('./privacy-redaction.cjs')

function protocolState(value) { return typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value) ? value : 'unknown' }

class LmuBridgeManager {
  constructor({ app, broadcast, broadcastRecording = () => {}, onReplayFinished = () => {}, logger = null, runtime = {} }) {
    this.app = app
    this.broadcast = broadcast
    this.broadcastRecording = broadcastRecording
    this.onReplayFinished = onReplayFinished
    this.logger = logger
    this.platform = runtime.platform ?? process.platform
    this.spawnProcess = runtime.spawn ?? spawn
    this.fileExists = runtime.fileExists ?? fs.existsSync
    this.makeRunId = runtime.randomUUID ?? randomUUID
    this.makeLineReader = runtime.createInterface ?? createInterface
    this.schedule = runtime.setTimeout ?? setTimeout
    this.cancelSchedule = runtime.clearTimeout ?? clearTimeout
    this.process = null
    this.selfTestProcess = null
    this.selfTestRunId = null
    this.restartTimer = null
    this.requested = false
    this.recordingProcess = null
    this.replayProcess = null
    this.replayOwnership = null
    this.replayOutputFlow = null
    this.replayStopRequested = false
    this.recordingState = { status: 'idle', path: null, frames: 0, bytes: 0, durationSeconds: 0, message: '' }
  }

  getBinaryPath() {
    if (this.app.isPackaged) return path.join(process.resourcesPath, 'bridge', 'apex-lmu-bridge.exe')
    return path.join(__dirname, '..', 'bridge', 'bin', 'apex-lmu-bridge.exe')
  }

  start() {
    this.log('info', 'start-requested', 'Live telemetry start requested.')
    this.requested = true
    if (this.platform !== 'win32') {
      this.broadcast(this.statusMessage('live', null, 'unsupported', 'LMU live telemetry is available on Windows.'))
      return { ok: false, reason: 'unsupported-platform' }
    }
    if (this.replayOwnership || this.replayProcess) {
      this.log('info', 'start-deferred', 'Live telemetry start deferred until recording analysis or replay finishes.')
      return { ok: true, deferred: true }
    }
    if (this.process) return { ok: true, alreadyRunning: true }
    const binary = this.getBinaryPath()
    if (!this.fileExists(binary)) {
      this.log('error', 'bridge-missing', 'Telemetry bridge binary is missing.', { binary })
      this.broadcast(this.statusMessage('live', null, 'missing', 'The LMU telemetry bridge is not installed.'))
      return { ok: false, reason: 'missing-bridge', path: binary }
    }
    let child
    const runId = this.makeRunId()
    try { child = this.spawnProcess(binary, ['--hz=50', `--parent-pid=${process.pid}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (error) { this.log('error', 'spawn-failed', error.message, { stack: error.stack, code: error.code, binary }); this.broadcast(this.statusMessage('live', null, 'error', error.message)); return { ok: false, reason: 'spawn-failed' } }
    this.process = child
    this.attachProcess(child, {
      mode: 'live',
      runId,
      onExit: (code) => {
        if (this.process !== child) return
        this.process = null
        if (!this.replayProcess && !this.replayOwnership) this.broadcast(this.statusMessage('live', runId, 'stopped', `LMU bridge exited (${code ?? 'signal'}).`))
        if (this.requested && !this.replayProcess && !this.replayOwnership) this.restartTimer = this.schedule(() => this.start(), 1500)
      },
    })
    return { ok: true }
  }

  runSelfTest() {
    const runId = this.makeRunId()
    if (this.platform !== 'win32') {
      this.broadcast(this.statusMessage('self-test', runId, 'unsupported', 'The native bridge self-test requires Windows.'))
      return { ok: false, reason: 'unsupported-platform', runId }
    }
    if (this.selfTestProcess) {
      return { ok: false, reason: 'self-test-running', runId: this.selfTestRunId }
    }
    const binary = this.getBinaryPath()
    if (!this.fileExists(binary)) {
      this.broadcast(this.statusMessage('self-test', runId, 'missing', 'The LMU telemetry bridge is not installed.'))
      return { ok: false, reason: 'missing-bridge', path: binary, runId }
    }

    let child
    try {
      child = this.spawnProcess(
        binary,
        ['--self-test', '--frames=8', `--run-id=${runId}`],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.broadcast(this.statusMessage('self-test', runId, 'error', message))
      return { ok: false, reason: 'spawn-failed', runId }
    }
    this.selfTestProcess = child
    this.selfTestRunId = runId
    this.attachProcess(child, {
      mode: 'self-test',
      runId,
      onExit: (code) => {
        if (this.selfTestProcess === child) {
          this.selfTestProcess = null
          this.selfTestRunId = null
        }
        if (code !== 0) {
          this.broadcast(this.statusMessage('self-test', runId, 'error', `Bridge self-test exited (${code ?? 'signal'}).`))
        }
      },
    })
    return { ok: true, runId }
  }

  getRecordingState() { return { ...this.recordingState } }

  startRecording(filePath, appVersion) {
    if (this.platform !== 'win32') return { ok: false, reason: 'unsupported-platform' }
    if (this.recordingProcess) return { ok: false, reason: 'already-recording' }
    if (this.replayOwnership || this.replayProcess) return { ok: false, reason: 'busy' }
    const binary = this.getBinaryPath()
    if (!this.fileExists(binary)) return { ok: false, reason: 'missing-bridge', path: binary }
    let child
    try {
      child = this.spawnProcess(binary, ['--hz=50', `--parent-pid=${process.pid}`, `--record=${filePath}`, `--app-version=${appVersion}`], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      this.setRecordingState({ status: 'error', path: filePath, message: error.message })
      return { ok: false, reason: 'spawn-failed' }
    }
    this.recordingProcess = child
    this.setRecordingState({ status: 'starting', path: filePath, frames: 0, bytes: 0, durationSeconds: 0, message: 'Starting recorder…' })
    const lines = this.makeLineReader({ input: child.stdout, crlfDelay: Infinity })
    lines.on('line', (line) => {
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'recording') {
          this.setRecordingState({ status: parsed.state === 'complete' ? 'complete' : parsed.state === 'error' ? 'error' : 'recording', path: filePath, frames: parsed.frames ?? 0, bytes: parsed.bytes ?? 0, durationSeconds: parsed.durationSeconds ?? 0, message: parsed.message ?? '' })
        } else if (parsed.type === 'status') {
          this.setRecordingState({ ...this.recordingState, message: parsed.message || this.recordingState.message })
        }
      } catch (error) { this.log('error', 'recording-invalid-frame', 'Recorder emitted invalid JSON.', { error: error.message }) }
    })
    child.stderr.on('data', (chunk) => this.log('error', 'recording-stderr', String(chunk).trim()))
    child.once('error', (error) => this.setRecordingState({ ...this.recordingState, status: 'error', message: error.message }))
    child.once('exit', (code) => {
      if (this.recordingProcess === child) this.recordingProcess = null
      if (!['complete', 'error'].includes(this.recordingState.status)) this.setRecordingState({ ...this.recordingState, status: code === 0 ? 'complete' : 'error', message: code === 0 ? 'Recording saved' : `Recorder exited (${code ?? 'signal'}).` })
    })
    return { ok: true, path: filePath }
  }

  stopRecording() {
    if (!this.recordingProcess) return { ok: false, reason: 'not-recording' }
    this.setRecordingState({ ...this.recordingState, status: 'stopping', message: 'Finishing recording…' })
    this.recordingProcess.stdin.write('stop\n')
    return { ok: true }
  }

  acquireReplayOwnership(ownerId, { privateReplay = false } = {}) {
    if (this.platform !== 'win32') return { ok: false, reason: 'unsupported-platform' }
    if (typeof ownerId !== 'string' || !/^[A-Za-z0-9._-]{1,96}$/.test(ownerId)) return { ok: false, reason: 'invalid-owner-id' }
    if (this.replayOwnership || this.replayProcess || this.recordingProcess) return { ok: false, reason: 'busy' }

    this.replayOwnership = { ownerId, privateReplay: privateReplay === true, sensitivePaths: [], external: true }
    if (this.restartTimer) this.cancelSchedule(this.restartTimer)
    this.restartTimer = null
    if (this.process) this.process.kill()
    this.process = null
    this.broadcast(this.statusMessage(
      'live',
      null,
      'waiting',
      privateReplay
        ? 'Private recording analysis is in progress; live telemetry is paused.'
        : 'Recording replay is starting; live telemetry is paused.',
    ))
    return { ok: true, ownerId }
  }

  releaseReplayOwnership(ownerId) {
    if (!this.replayOwnership) return { ok: false, reason: 'not-owned' }
    if (this.replayOwnership.ownerId !== ownerId) return { ok: false, reason: 'ownership-mismatch' }
    this.replayOwnership = null
    if (!this.replayProcess) this.resumeLiveIfRequested()
    return { ok: true }
  }

  startReplay(filePath, options = {}) {
    if (this.platform !== 'win32') return { ok: false, reason: 'unsupported-platform' }
    const speed = options.speed ?? 1
    const strict = options.strict === true
    const runId = options.runId ?? this.makeRunId()
    if (!Number.isFinite(speed) || speed < 0 || speed > 16) return { ok: false, reason: 'invalid-speed' }
    if (typeof runId !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(runId)) return { ok: false, reason: 'invalid-run-id' }
    const binary = this.getBinaryPath()
    if (!this.fileExists(binary)) return { ok: false, reason: 'missing-bridge', path: binary }

    const requestedOwnerId = options.ownershipId
    let ownership
    if (requestedOwnerId !== undefined) {
      if (this.replayProcess || this.recordingProcess || !this.replayOwnership || this.replayOwnership.ownerId !== requestedOwnerId) return { ok: false, reason: 'busy' }
      ownership = this.replayOwnership
    } else {
      if (this.replayProcess || this.replayOwnership || this.recordingProcess) return { ok: false, reason: 'busy' }
      const ownerId = `replay-${runId}`
      const acquired = this.acquireReplayOwnership(ownerId, { privateReplay: options.reportRecordingState === false })
      if (!acquired.ok) return acquired
      ownership = this.replayOwnership
      ownership.external = false
    }

    ownership.privateReplay ||= options.reportRecordingState === false
    ownership.sensitivePaths = ownership.privateReplay ? [filePath] : []
    const reportRecordingState = !ownership.privateReplay && options.reportRecordingState !== false
    const sanitizeText = (value) => redactSensitiveText(value, ownership.sensitivePaths)
    let child
    const args = [`--replay=${filePath}`, `--replay-speed=${speed}`, `--run-id=${runId}`, ...(strict ? ['--replay-strict'] : [])]
    try { child = this.spawnProcess(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (error) {
      const message = ownership.privateReplay ? 'Private recording decoder could not start.' : sanitizeText(error instanceof Error ? error.message : error)
      this.finishReplay(message, false, reportRecordingState, ownership.ownerId)
      return { ok: false, reason: 'spawn-failed' }
    }
    this.replayProcess = child
    this.replayOutputFlow = { child, ownerId: ownership.ownerId, runId, paused: false, stopping: false }
    const lifecycle = { starting: false, complete: false, protocolFailed: false, recordingSha256: null }
    if (reportRecordingState) this.setRecordingState({ status: 'replaying', path: filePath, frames: 0, bytes: 0, durationSeconds: 0, message: 'Replaying recording…' })
    this.attachProcess(child, {
      mode: 'replay', runId,
      onMessage: (message) => {
        if (message.type === 'status' && message.state === 'replay-starting') lifecycle.starting = true
        if (message.type === 'status' && message.state === 'replay-complete') {
          lifecycle.complete = true
          if (Object.prototype.hasOwnProperty.call(message, 'recordingSha256')) {
            if (typeof message.recordingSha256 === 'string' && /^[a-f0-9]{64}$/.test(message.recordingSha256)) lifecycle.recordingSha256 = message.recordingSha256
            else lifecycle.protocolFailed = true
          }
        }
        if (message.type === 'status' && strict && ['replay-partial', 'invalid-data', 'stale-data'].includes(message.state)) lifecycle.protocolFailed = true
      },
      onProtocolError: () => { lifecycle.protocolFailed = true },
      onExit: (code) => {
        if (this.replayOutputFlow?.child === child) this.replayOutputFlow = null
        if (this.replayProcess === child) this.replayProcess = null
        const stopped = this.replayStopRequested
        this.replayStopRequested = false
        const complete = !stopped && code === 0 && lifecycle.starting && lifecycle.complete && !lifecycle.protocolFailed
        const message = stopped ? 'Replay stopped' : complete ? 'Replay complete' : code === 0 ? 'Replay exited without correlated completion.' : `Replay exited (${code ?? 'signal'}).`
        this.finishReplay(message, stopped || complete, reportRecordingState, ownership.ownerId)
        this.notifyReplayFinished({
          runId, complete, stopped, message, code,
          ...(complete && lifecycle.recordingSha256 ? { recordingSha256: lifecycle.recordingSha256 } : {}),
        })
      },
      privatePaths: ownership.sensitivePaths,
    })
    return reportRecordingState ? { ok: true, path: filePath, runId } : { ok: true, runId }
  }

  setReplayOutputPaused(ownerId, runId, paused) {
    if (typeof paused !== 'boolean') return { ok: false, reason: 'invalid-state' }
    const flow = this.replayOutputFlow
    if (!flow || flow.child !== this.replayProcess) return { ok: false, reason: 'not-replaying' }
    if (flow.stopping) return { ok: false, reason: 'stopping' }
    if (this.replayOwnership?.ownerId !== ownerId || flow.ownerId !== ownerId) return { ok: false, reason: 'ownership-mismatch' }
    if (flow.runId !== runId) return { ok: false, reason: 'run-mismatch' }
    if (flow.paused === paused) return { ok: true, paused, unchanged: true }
    const method = paused ? 'pause' : 'resume'
    if (typeof flow.child.stdout?.[method] !== 'function') return { ok: false, reason: 'flow-control-unavailable' }
    try {
      flow.child.stdout[method]()
      flow.paused = paused
      return { ok: true, paused }
    } catch {
      return { ok: false, reason: 'flow-control-failed' }
    }
  }

  stopReplay() {
    if (!this.replayProcess) return { ok: false, reason: 'not-replaying' }
    this.replayStopRequested = true
    if (this.replayOutputFlow?.child === this.replayProcess) this.replayOutputFlow.stopping = true
    this.replayProcess.kill()
    return { ok: true }
  }

  finishReplay(message, complete = false, reportRecordingState = true, ownerId = null) {
    if (reportRecordingState) this.setRecordingState({ ...this.recordingState, status: complete ? 'complete' : 'error', message })
    if (this.replayOwnership?.ownerId === ownerId && !this.replayOwnership.external) this.releaseReplayOwnership(ownerId)
    else if (!this.replayOwnership && !this.replayProcess) this.resumeLiveIfRequested()
  }

  resumeLiveIfRequested() {
    if (this.requested && !this.process && !this.replayProcess && !this.replayOwnership) this.start()
  }

  setRecordingState(next) {
    this.recordingState = { ...next }
    this.broadcastRecording(this.getRecordingState())
  }

  notifyReplayFinished(result) {
    try {
      Promise.resolve(this.onReplayFinished(result)).catch((error) => this.log('error', 'replay-finished-callback-failed', 'Recording replay completion could not be delivered.', { runId: result.runId, error: error instanceof Error ? error.message : String(error) }))
    } catch (error) {
      this.log('error', 'replay-finished-callback-failed', 'Recording replay completion could not be delivered.', { runId: result.runId, error: error instanceof Error ? error.message : String(error) })
    }
  }

  stopLive() {
    this.requested = false
    if (this.restartTimer) this.cancelSchedule(this.restartTimer)
    this.restartTimer = null
    if (this.process) this.process.kill()
    this.process = null
    return { ok: true }
  }

  stop() {
    this.stopLive()
    if (this.selfTestProcess) this.selfTestProcess.kill()
    if (this.recordingProcess?.stdin?.writable) this.recordingProcess.stdin.write('stop\n')
    if (this.replayProcess) {
      this.replayStopRequested = true
      if (this.replayOutputFlow?.child === this.replayProcess) this.replayOutputFlow.stopping = true
      this.replayProcess.kill()
    }
    this.selfTestProcess = null
    this.selfTestRunId = null
    return { ok: true }
  }

  attachProcess(child, { mode, runId, onExit, onMessage = () => {}, onProtocolError = () => {}, privatePaths = [] }) {
    const sanitizeText = (value) => redactSensitiveText(value, privatePaths)
    const lines = this.makeLineReader({ input: child.stdout, crlfDelay: Infinity })
    lines.on('line', (line) => {
      // Killing a live child does not synchronously drain its pipes. Once a
      // replay owns the bridge, discard buffered output from that old child so
      // it cannot repopulate Live or the overlay after the waiting status.
      if (mode === 'live' && this.process !== child) return
      // stopReplay marks the exact replay child before sending its kill signal.
      // Discard pipe data already buffered at that boundary so a disposed
      // private import cannot fall through into live/stats/renderer consumers.
      if (mode === 'replay' && this.replayOutputFlow?.child === child && this.replayOutputFlow.stopping) return
      try {
        let parsed = JSON.parse(line)
        if (mode === 'live') parsed = { ...parsed, runId }
        if (mode === 'self-test' && (parsed.source !== 'self-test' || parsed.runId !== runId)) {
          this.broadcast(this.statusMessage('self-test', runId, 'error', 'Bridge self-test emitted an uncorrelated frame.'))
          return
        }
        if (mode === 'replay' && (parsed.source !== 'recording-replay' || parsed.runId !== runId)) {
          onProtocolError()
          this.broadcast(this.statusMessage('replay', runId, 'error', 'Recording replay emitted an uncorrelated frame.'))
          return
        }
        parsed = privatePaths.length > 0
          ? privateProtocolDiagnostic(parsed)
          : redactProtocolDiagnostic(parsed, privatePaths)
        onMessage(parsed)
        if (parsed.type === 'status') {
          const state = protocolState(parsed.state)
          const level = ['error', 'invalid-data', 'degraded-data', 'stale-data', 'missing', 'stopped'].includes(state) ? 'warning' : 'info'
          // Decoder messages can contain scoring-header names. Diagnostics
          // retain only the bounded state; non-private renderer consumers may
          // still receive the original user-facing bridge message.
          this.log(level, 'status', `Bridge status changed (${state}).`, {
            mode, runId, state, ...(Number.isSafeInteger(parsed.gameVersion) ? { gameVersion: parsed.gameVersion } : {}),
          })
        }
        if (mode === 'replay' && parsed.type === 'telemetry' && this.recordingState.status === 'replaying') this.setRecordingState({ ...this.recordingState, frames: this.recordingState.frames + 1 })
        this.broadcast(parsed)
      } catch (error) {
        onProtocolError()
        // A malformed line may still be an almost-complete telemetry frame.
        // Never persist it (or JSON.parse's source excerpt) in diagnostics.
        this.log('error', 'invalid-frame', 'Bridge emitted invalid JSON.', {
          mode, runId, bytes: Buffer.byteLength(line), errorType: error instanceof SyntaxError ? 'SyntaxError' : 'Error',
        })
        this.broadcast(this.statusMessage(mode, runId, 'error', 'LMU bridge emitted an invalid frame.'))
      }
    })
    child.stderr.on('data', (chunk) => {
      if (mode === 'live' && this.process !== child) return
      if (mode === 'replay' && this.replayOutputFlow?.child === child && this.replayOutputFlow.stopping) return
      // stderr is an unstructured byte stream and may split a private path at
      // arbitrary chunk boundaries. Never forward its contents for a private
      // replay; a generic diagnostic preserves the failure signal without
      // making redaction depend on chunking.
      const message = privatePaths.length > 0
        ? 'Private recording decoder reported an error.'
        : sanitizeText(String(chunk).trim())
      this.log('error', 'bridge-stderr', message, { mode, runId })
      this.broadcast({
        protocolVersion: 2,
        source: mode === 'self-test' ? 'self-test' : mode === 'replay' ? 'recording-replay' : 'lmu-shared-memory',
        ...(runId ? { runId } : {}),
        type: 'diagnostic',
        level: 'error',
        message,
      })
    })
    child.once('error', (error) => {
      if (mode === 'live' && this.process !== child) return
      if (mode === 'replay' && this.replayOutputFlow?.child === child && this.replayOutputFlow.stopping) return
      onProtocolError()
      const privateReplay = privatePaths.length > 0
      const message = privateReplay
        ? 'Private recording decoder process failed.'
        : sanitizeText(error instanceof Error ? error.message : error)
      this.log('error', 'process-error', message, {
        mode, runId, code: error?.code,
        ...(!privateReplay ? { stack: sanitizeText(error?.stack || '') } : {}),
      })
      if (mode === 'self-test' && this.selfTestProcess === child) {
        this.selfTestProcess = null
        this.selfTestRunId = null
      }
      this.broadcast(this.statusMessage(mode, runId, 'error', message))
    })
    const completionEvent = mode === 'replay' ? 'close' : 'exit'
    child.once(completionEvent, (code, signal) => {
      this.log(code === 0 ? 'info' : 'error', mode === 'replay' ? 'process-close' : 'process-exit', `Bridge ${mode === 'replay' ? 'closed' : 'exited'} with ${code ?? signal ?? 'unknown'}.`, { mode, runId, code, signal })
      onExit(code)
    })
  }

  log(level, event, message, details) { void this.logger?.record(level, 'bridge', event, message, details) }

  statusMessage(mode, runId, state, message) {
    return {
      protocolVersion: 2,
      source: mode === 'self-test' ? 'self-test' : mode === 'replay' ? 'recording-replay' : 'lmu-shared-memory',
      ...(runId ? { runId } : {}),
      type: 'status',
      state,
      message,
    }
  }
}

module.exports = { LmuBridgeManager }
