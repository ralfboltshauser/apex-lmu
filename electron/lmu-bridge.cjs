const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')

class LmuBridgeManager {
  constructor({ app, broadcast, broadcastRecording = () => {}, logger = null, runtime = {} }) {
    this.app = app
    this.broadcast = broadcast
    this.broadcastRecording = broadcastRecording
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
    this.replayResumeRequested = false
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
    if (this.process) return { ok: true, alreadyRunning: true }
    const binary = this.getBinaryPath()
    if (!this.fileExists(binary)) {
      this.log('error', 'bridge-missing', 'Telemetry bridge binary is missing.', { binary })
      this.broadcast(this.statusMessage('live', null, 'missing', 'The LMU telemetry bridge is not installed.'))
      return { ok: false, reason: 'missing-bridge', path: binary }
    }
    let child
    try { child = this.spawnProcess(binary, ['--hz=50', `--parent-pid=${process.pid}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (error) { this.log('error', 'spawn-failed', error.message, { stack: error.stack, code: error.code, binary }); this.broadcast(this.statusMessage('live', null, 'error', error.message)); return { ok: false, reason: 'spawn-failed' } }
    this.process = child
    this.attachProcess(child, {
      mode: 'live',
      runId: null,
      onExit: (code) => {
        if (this.process === child) this.process = null
        if (!this.replayProcess) this.broadcast(this.statusMessage('live', null, 'stopped', `LMU bridge exited (${code ?? 'signal'}).`))
        if (this.requested) this.restartTimer = this.schedule(() => this.start(), 1500)
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

  startReplay(filePath) {
    if (this.platform !== 'win32') return { ok: false, reason: 'unsupported-platform' }
    if (this.replayProcess || this.recordingProcess) return { ok: false, reason: 'busy' }
    const binary = this.getBinaryPath()
    if (!this.fileExists(binary)) return { ok: false, reason: 'missing-bridge', path: binary }
    this.replayResumeRequested = this.requested
    this.requested = false
    if (this.restartTimer) this.cancelSchedule(this.restartTimer)
    this.restartTimer = null
    if (this.process) this.process.kill()
    this.process = null
    let child
    try { child = this.spawnProcess(binary, [`--replay=${filePath}`, '--replay-speed=1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (error) { this.finishReplay(error.message); return { ok: false, reason: 'spawn-failed' } }
    this.replayProcess = child
    this.setRecordingState({ status: 'replaying', path: filePath, frames: 0, bytes: 0, durationSeconds: 0, message: 'Replaying recording…' })
    this.attachProcess(child, {
      mode: 'replay', runId: null,
      onExit: (code) => {
        if (this.replayProcess === child) this.replayProcess = null
        const stopped = this.replayStopRequested
        this.replayStopRequested = false
        this.finishReplay(stopped ? 'Replay stopped' : code === 0 ? 'Replay complete' : `Replay exited (${code ?? 'signal'}).`, stopped || code === 0)
      },
    })
    return { ok: true, path: filePath }
  }

  stopReplay() {
    if (!this.replayProcess) return { ok: false, reason: 'not-replaying' }
    this.replayStopRequested = true
    this.replayProcess.kill()
    return { ok: true }
  }

  finishReplay(message, complete = false) {
    this.setRecordingState({ ...this.recordingState, status: complete ? 'complete' : 'error', message })
    const resume = this.replayResumeRequested
    this.replayResumeRequested = false
    if (resume) { this.requested = true; this.start() }
  }

  setRecordingState(next) {
    this.recordingState = { ...next }
    this.broadcastRecording(this.getRecordingState())
  }

  stop() {
    this.requested = false
    if (this.restartTimer) this.cancelSchedule(this.restartTimer)
    this.restartTimer = null
    if (this.process) this.process.kill()
    if (this.selfTestProcess) this.selfTestProcess.kill()
    if (this.recordingProcess?.stdin?.writable) this.recordingProcess.stdin.write('stop\n')
    if (this.replayProcess) this.replayProcess.kill()
    this.process = null
    this.selfTestProcess = null
    this.selfTestRunId = null
    this.replayProcess = null
    return { ok: true }
  }

  attachProcess(child, { mode, runId, onExit }) {
    const lines = this.makeLineReader({ input: child.stdout, crlfDelay: Infinity })
    lines.on('line', (line) => {
      try {
        const parsed = JSON.parse(line)
        if (mode === 'self-test' && (parsed.source !== 'self-test' || parsed.runId !== runId)) {
          this.broadcast(this.statusMessage('self-test', runId, 'error', 'Bridge self-test emitted an uncorrelated frame.'))
          return
        }
        if (parsed.type === 'status') {
          const level = ['error', 'invalid-data', 'missing', 'stopped'].includes(parsed.state) ? 'warning' : 'info'
          this.log(level, 'status', parsed.message || parsed.state || 'Bridge status changed.', {
            mode, runId, state: parsed.state, gameVersion: parsed.gameVersion,
          })
        }
        if (mode === 'replay' && parsed.type === 'telemetry') this.setRecordingState({ ...this.recordingState, frames: this.recordingState.frames + 1 })
        this.broadcast(parsed)
      } catch (error) {
        this.log('error', 'invalid-frame', 'Bridge emitted invalid JSON.', { line, error: error.message })
        this.broadcast(this.statusMessage(mode, runId, 'error', 'LMU bridge emitted an invalid frame.'))
      }
    })
    child.stderr.on('data', (chunk) => {
      this.log('error', 'bridge-stderr', String(chunk).trim(), { mode, runId })
      this.broadcast({
        protocolVersion: 1,
        source: mode === 'self-test' ? 'self-test' : 'lmu-shared-memory',
        ...(runId ? { runId } : {}),
        type: 'diagnostic',
        level: 'error',
        message: String(chunk).trim(),
      })
    })
    child.once('error', (error) => {
      this.log('error', 'process-error', error.message, { mode, runId, code: error.code, stack: error.stack })
      if (mode === 'self-test' && this.selfTestProcess === child) {
        this.selfTestProcess = null
        this.selfTestRunId = null
      }
      this.broadcast(this.statusMessage(mode, runId, 'error', error.message))
    })
    child.once('exit', (code, signal) => { this.log(code === 0 ? 'info' : 'error', 'process-exit', `Bridge exited with ${code ?? signal ?? 'unknown'}.`, { mode, runId, code, signal }); onExit(code) })
  }

  log(level, event, message, details) { void this.logger?.record(level, 'bridge', event, message, details) }

  statusMessage(mode, runId, state, message) {
    return {
      protocolVersion: 1,
      source: mode === 'self-test' ? 'self-test' : 'lmu-shared-memory',
      ...(runId ? { runId } : {}),
      type: 'status',
      state,
      message,
    }
  }
}

module.exports = { LmuBridgeManager }
